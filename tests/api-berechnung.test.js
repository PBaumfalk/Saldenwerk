// Rechen-Endpunkte der REST-API gegen docs/beispiel-konto.json.
//
// Bewusst OHNE /api/pdf: dessen Aufruf lädt pdf-node.js und setzt damit einen
// globalen window-Shim. Der PDF-Endpunkt hat deshalb eine eigene Testdatei,
// die node --test in einem eigenen Prozess ausführt.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { erzeugeServer } = require('../server/api.js');
const Kern = require('../kern.js');
const Engine = require('../engine.js');

const KONFIG = { benutzer: 'kanzlei', passwort: 'geheim' };
const AUTH = 'Basic ' + Buffer.from('kanzlei:geheim').toString('base64');
const STICHTAG = '2026-08-12';

const BEISPIEL = () => JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'docs', 'beispiel-konto.json'), 'utf8'));

async function mitServer(t, ablauf) {
  const server = erzeugeServer(KONFIG);
  await new Promise((fertig) => server.listen(0, '127.0.0.1', fertig));
  t.after(() => new Promise((fertig) => server.close(fertig)));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const post = (pfad, koerper) => fetch(basis + pfad, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify(koerper === undefined ? BEISPIEL() : koerper),
  });
  const get = (pfad) => fetch(basis + pfad, { headers: { Authorization: AUTH } });
  return ablauf(post, get);
}

test('POST /api/berechnung liefert das Engine-Ergebnis unverändert', (t) => mitServer(t, async (post) => {
  const antwort = await post(`/api/berechnung?stichtag=${STICHTAG}`);
  assert.strictEqual(antwort.status, 200);
  const koerper = await antwort.json();

  // Erwartungswert aus der Engine selbst ableiten: ein fest eingetragener
  // Betrag bräche bei jeder halbjährlichen Basiszins-Pflege.
  const bestand = Kern.ladeBestand(BEISPIEL());
  const erwartet = Engine.berechneKonto(bestand.konten[0], STICHTAG, bestand.tabelle);
  assert.deepStrictEqual(koerper, JSON.parse(JSON.stringify(erwartet)));
  assert.strictEqual(koerper.stichtag, STICHTAG);
  assert.ok(koerper.summen.saldo > 0);
  assert.ok(Array.isArray(koerper.staffel));
  assert.ok(Array.isArray(koerper.verrechnungen));
}));

test('POST /api/berechnung nimmt ohne Stichtag heute', (t) => mitServer(t, async (post) => {
  const koerper = await (await post('/api/berechnung')).json();
  assert.strictEqual(koerper.stichtag, Engine.heute());
}));

test('POST /api/berechnung wählt das Konto über kontoId und über den Namen',
  (t) => mitServer(t, async (post) => {
    for (const kennung of ['demo-muster-gmbh', 'Muster GmbH ./. Beispiel']) {
      const antwort = await post(
        `/api/berechnung?kontoId=${encodeURIComponent(kennung)}&stichtag=${STICHTAG}`);
      assert.strictEqual(antwort.status, 200, `Kennung „${kennung}"`);
    }
  }));

test('POST /api/berechnung berücksichtigt basiszinsOverrides aus dem Körper',
  (t) => mitServer(t, async (post) => {
    const ohne = await (await post(`/api/berechnung?stichtag=${STICHTAG}`)).json();
    const objekt = BEISPIEL();
    objekt.basiszinsOverrides = [{ ab: '2024-07-01', satz: 9.99 }];
    const mit = await (await post(`/api/berechnung?stichtag=${STICHTAG}`, objekt)).json();
    assert.notStrictEqual(mit.summen.saldo, ohne.summen.saldo,
      'die Overrides sind wirkungslos geblieben');
  }));

test('POST /api/berechnung antwortet auf ungültige Bestände mit den deutschen Texten',
  (t) => mitServer(t, async (post) => {
    const faelle = [
      [{ version: 2, konten: [] }, 400, 'Unbekannte oder fehlende Versionsnummer (erwartet: 1).'],
      [{ version: 1 }, 400, 'Das Feld „konten" fehlt oder ist keine Liste.'],
      [{ version: 1, konten: [{ buchungen: [] }] }, 400,
        'Konto 1: Feld „name" fehlt oder ist kein Text.'],
      [{ version: 1, konten: [{ name: 'A' }] }, 400,
        'Konto 1 („A"): Feld „buchungen" fehlt oder ist keine Liste.'],
      [{ version: 1, konten: [{ name: 'A', buchungen: [
        { typ: 'kaffee', datum: '2024-01-01', betrag: 1, text: 'x' }] }] }, 400,
      'Konto 1 („A"), Buchung 1: unbekannter Buchungstyp „kaffee".'],
      [{ version: 1, konten: [{ name: 'A', buchungen: [
        { typ: 'zahlung', datum: '2024-01-01', betrag: 0, text: 'x' }] }] }, 400,
      'Konto 1 („A"), Buchung 1: Betrag muss eine Zahl größer als 0 sein.'],
    ];
    for (const [objekt, status, text] of faelle) {
      const antwort = await post('/api/berechnung', objekt);
      assert.strictEqual(antwort.status, status);
      assert.strictEqual((await antwort.json()).fehler, text);
    }
  }));

test('POST /api/report liefert Modell und HTML', (t) => mitServer(t, async (post) => {
  const antwort = await post(`/api/report?stichtag=${STICHTAG}`);
  assert.strictEqual(antwort.status, 200);
  const koerper = await antwort.json();
  assert.ok(koerper.modell.kopf, 'kein Kopf im Druckmodell');
  assert.match(koerper.html, /^<!DOCTYPE html>/i);
  assert.ok(koerper.html.length > 5000);
  assert.ok(koerper.html.includes('Muster GmbH'), 'der Kontoname fehlt im HTML');
}));

test('POST /api/tenor liefert den Antragstext', (t) => mitServer(t, async (post) => {
  const koerper = await (await post(`/api/tenor?stichtag=${STICHTAG}`)).json();
  assert.strictEqual(typeof koerper.text, 'string');
  assert.ok(koerper.text.length > 50);
  assert.strictEqual(koerper.hinweis, null);
}));

test('POST /api/tenor erklärt ein getilgtes Konto, statt null zu liefern',
  (t) => mitServer(t, async (post) => {
    const objekt = { version: 1, konten: [{ name: 'Getilgt', buchungen: [
      { id: 'hf', typ: 'hauptforderung', datum: '2024-01-01', betrag: 100, text: 'F',
        verzinsung: { art: 'keine' } },
      { id: 'z', typ: 'zahlung', datum: '2024-02-01', betrag: 100, text: 'Ausgleich' },
    ] }] };
    const koerper = await (await post(`/api/tenor?stichtag=${STICHTAG}`, objekt)).json();
    assert.strictEqual(koerper.text, null);
    assert.match(koerper.hinweis, /[Kk]eine offenen Forderungen/);
  }));

test('GET /api/basiszins liefert die Tabelle und das Deckungsende', (t) => mitServer(t, async (post, get) => {
  const antwort = await get('/api/basiszins');
  assert.strictEqual(antwort.status, 200);
  const koerper = await antwort.json();
  const erwartet = Kern.basiszins([]);
  assert.deepStrictEqual(koerper.tabelle, erwartet.tabelle);
  assert.strictEqual(koerper.deckungsEnde, erwartet.deckungsEnde);
  assert.strictEqual(koerper.tabelle[0].ab, '2002-01-01');
}));

test('POST /api/rvg erzeugt Nebenforderungen', (t) => mitServer(t, async (post) => {
  const antwort = await post('/api/rvg', {
    gegenstandswert: 5000, datum: '2024-05-02',
    vorgerichtlich: { aktiv: true, faktor: 1.3, auslagenpauschale: true, umsatzsteuer: true },
  });
  assert.strictEqual(antwort.status, 200);
  const koerper = await antwort.json();
  assert.strictEqual(koerper.buchungen.length, 3);
  assert.ok(koerper.buchungen.every((b) => b.typ === 'nebenforderung'));
  assert.ok(koerper.hinweise.some((h) => h.includes('KostRÄG')));
  assert.ok(koerper.stand.gueltigAb);
}));

test('POST /api/rvg prüft die Eingaben serverseitig und stürzt nicht ab',
  (t) => mitServer(t, async (post) => {
    const faelle = [
      [{ gegenstandswert: '5000', datum: '2024-05-02' }, /Gegenstandswert/],
      [{ gegenstandswert: 5000, datum: 'bald' }, /Datum/],
      [{ gegenstandswert: 5000, datum: '2024-05-02', vorgerichtlich: { aktiv: true, faktor: -1 } }, /Faktor/],
      [{ gegenstandswert: 5000, datum: '2024-05-02', gerichtlich: { verfahrensart: 'schlichtung' } }, /Verfahrensart/],
      [null, /keine RVG-Eingaben/],
    ];
    for (const [eingabe, muster] of faelle) {
      const antwort = await post('/api/rvg', eingabe);
      assert.strictEqual(antwort.status, 400, `${JSON.stringify(eingabe)} ergab ${antwort.status}`);
      const koerper = await antwort.json();
      assert.match(koerper.fehler, muster);
      assert.strictEqual(koerper.code, Kern.FEHLERCODES.RVG_EINGABE_UNGUELTIG);
    }
  }));

test('Beträge werden als Zahlen übertragen, nicht als formatierte Texte',
  (t) => mitServer(t, async (post) => {
    // Schützt gegen ein Node ohne vollständiges ICU: dort wären die Zahlen
    // zwar weiterhin Zahlen, aber ein späterer Umbau auf formatierte Ausgabe
    // würde hier auffallen.
    const koerper = await (await post(`/api/berechnung?stichtag=${STICHTAG}`)).json();
    assert.strictEqual(typeof koerper.summen.saldo, 'number');
    assert.strictEqual(typeof koerper.summen.hauptforderung.offen, 'number');
    for (const zeile of koerper.staffel) assert.strictEqual(typeof zeile.zins, 'number');
  }));

test('das HTML des Reports trägt deutsche Zahlenformate', (t) => mitServer(t, async (post) => {
  // Direkter Wächter gegen ein ICU-loses Node: dort stünde „5,000.00" im
  // Report, und das fiele erst im fertigen Schriftsatz auf.
  const koerper = await (await post(`/api/report?stichtag=${STICHTAG}`)).json();
  assert.match(koerper.html, /\d{1,3}\.\d{3},\d{2}/,
    'kein Betrag im deutschen Format gefunden — Locale des Servers prüfen');
}));
