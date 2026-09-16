const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Kern = require('../kern.js');
const Engine = require('../engine.js');

const BEISPIEL = () => JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'docs', 'beispiel-konto.json'), 'utf8'));

// Fester Stichtag in allen Tests: Die Basiszins-Tabelle wächst halbjährlich,
// ein "heute" würde die Suite mit der Zeit mürbe machen.
const STICHTAG = '2026-08-12';

function bestand(objekt) {
  const geladen = Kern.ladeBestand(objekt || BEISPIEL());
  assert.ok(geladen.ok, geladen.fehler);
  return geladen;
}

// ── ladeBestand ────────────────────────────────────────────────────────────

test('ladeBestand nimmt das Dateiformat V1 an und liefert die Basiszins-Tabelle', () => {
  const b = bestand();
  assert.strictEqual(b.konten.length, 1);
  assert.deepStrictEqual(b.basiszinsOverrides, []);
  assert.ok(b.tabelle.length > 40);
  assert.strictEqual(b.tabelle[0].ab, '2002-01-01');
});

test('ladeBestand reicht die deutschen Fehlertexte aus validiereExport durch', () => {
  const r = Kern.ladeBestand({ version: 2, konten: [] });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, Kern.FEHLERCODES.BESTAND_UNGUELTIG);
  assert.strictEqual(r.fehler, 'Unbekannte oder fehlende Versionsnummer (erwartet: 1).');
});

test('ladeBestand mischt basiszinsOverrides in die Tabelle', () => {
  const objekt = BEISPIEL();
  objekt.basiszinsOverrides = [{ ab: '2027-01-01', satz: 2.5 }];
  const b = bestand(objekt);
  assert.strictEqual(b.tabelle[b.tabelle.length - 1].ab, '2027-01-01');
  assert.strictEqual(b.tabelle[b.tabelle.length - 1].satz, 2.5);
});

// ── waehleKonto ────────────────────────────────────────────────────────────

test('waehleKonto nimmt ohne Angabe das erste Konto', () => {
  const r = Kern.waehleKonto(bestand(), null);
  assert.ok(r.ok);
  assert.strictEqual(r.konto.id, 'demo-muster-gmbh');
});

test('waehleKonto findet über id und über exakten Namen', () => {
  const b = bestand();
  assert.strictEqual(Kern.waehleKonto(b, 'demo-muster-gmbh').konto.id, 'demo-muster-gmbh');
  assert.strictEqual(Kern.waehleKonto(b, 'Muster GmbH ./. Beispiel').konto.id, 'demo-muster-gmbh');
});

test('waehleKonto listet bei unbekannter Kennung die vorhandenen Konten auf', () => {
  const r = Kern.waehleKonto(bestand(), 'gibtsnicht');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, Kern.FEHLERCODES.KONTO_NICHT_GEFUNDEN);
  assert.match(r.fehler, /Muster GmbH \.\/\. Beispiel/);
  assert.match(r.fehler, /demo-muster-gmbh/);
});

test('waehleKonto meldet Mehrdeutigkeit bei doppeltem Namen', () => {
  const objekt = BEISPIEL();
  objekt.konten.push(Object.assign({}, objekt.konten[0], { id: 'zweite' }));
  const r = Kern.waehleKonto(bestand(objekt), 'Muster GmbH ./. Beispiel');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, Kern.FEHLERCODES.KONTO_MEHRDEUTIG);
  assert.match(r.fehler, /id angeben/);
});

test('waehleKonto meldet einen leeren Bestand', () => {
  const r = Kern.waehleKonto(bestand({ version: 1, konten: [] }), null);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, Kern.FEHLERCODES.KONTO_LEER);
});

// ── normalisiereStichtag ───────────────────────────────────────────────────

test('normalisiereStichtag akzeptiert beide Schreibweisen', () => {
  assert.strictEqual(Kern.normalisiereStichtag('2026-08-12').stichtag, '2026-08-12');
  assert.strictEqual(Kern.normalisiereStichtag('12.08.2026').stichtag, '2026-08-12');
});

test('normalisiereStichtag weist unmögliche Daten zurück', () => {
  for (const wert of ['31.02.2026', '2026-13-01', 'morgen', '2026-08-32']) {
    const r = Kern.normalisiereStichtag(wert);
    assert.strictEqual(r.ok, false, `„${wert}" hätte abgelehnt werden müssen`);
    assert.strictEqual(r.code, Kern.FEHLERCODES.STICHTAG_UNGUELTIG);
  }
});

test('normalisiereStichtag setzt ohne Angabe heute ein', () => {
  // Der einzige Test, der den heute-Default belegt; alle anderen sind datumsfest.
  assert.strictEqual(Kern.normalisiereStichtag(null).stichtag, Engine.heute());
  assert.strictEqual(Kern.normalisiereStichtag('').stichtag, Engine.heute());
  assert.strictEqual(Kern.normalisiereStichtag(undefined).stichtag, Engine.heute());
});

// ── dateiname ──────────────────────────────────────────────────────────────

test('dateiname ersetzt Pfad- und Leerzeichen und bevorzugt das Aktenzeichen', () => {
  const konto = { name: 'Muster GmbH ./. Beispiel', aktenzeichen: '12 C 345/24' };
  assert.strictEqual(Kern.dateiname(konto, '2026-08-12', 'pdf'),
    'Forderungsaufstellung_12-C-345-24_2026-08-12.pdf');
  assert.strictEqual(Kern.dateiname({ name: 'A/B:C*D' }, '2026-08-12', '.html'),
    'Forderungsaufstellung_A-B-C-D_2026-08-12.html');
});

test('dateiname enthält keine Zeichen, die gequotet werden müssten', () => {
  const namen = ['../../etc/passwd', 'a"b', 'x\ty', '   ', 'ä ö ü'];
  for (const name of namen) {
    const d = Kern.dateiname({ name }, '2026-08-12', 'pdf');
    assert.doesNotMatch(d, /[\s"'\\/:*?<>|]/, `„${name}" ergab „${d}"`);
    assert.ok(d.startsWith('Forderungsaufstellung_'));
  }
});

// ── Anwendungsfälle ────────────────────────────────────────────────────────

test('berechnung liefert das unveränderte Engine-Ergebnis', () => {
  const b = bestand();
  const r = Kern.berechnung({ bestand: b, stichtag: STICHTAG });
  assert.ok(r.ok);
  assert.strictEqual(r.stichtag, STICHTAG);
  assert.deepStrictEqual(r.ergebnis,
    Engine.berechneKonto(b.konten[0], STICHTAG, b.tabelle));
});

test('berechnung reicht Fehler aus Kontoauswahl und Stichtag unverändert durch', () => {
  const b = bestand();
  assert.strictEqual(Kern.berechnung({ bestand: b, kontoId: 'weg' }).code,
    Kern.FEHLERCODES.KONTO_NICHT_GEFUNDEN);
  assert.strictEqual(Kern.berechnung({ bestand: b, stichtag: 'gestern' }).code,
    Kern.FEHLERCODES.STICHTAG_UNGUELTIG);
});

test('report baut Modell und HTML mit übergebbarem Erstellungsdatum', () => {
  const r = Kern.report({ bestand: bestand(), stichtag: STICHTAG, erstelltAm: '2026-08-12' });
  assert.ok(r.ok);
  assert.strictEqual(r.erstelltAm, '2026-08-12');
  assert.ok(r.html.startsWith('<!DOCTYPE html>') || r.html.startsWith('<!doctype html>'));
  assert.ok(r.html.length > 5000);
  assert.ok(r.modell.kopf);
});

test('pdfModell liefert Modell und Dateiname, aber keine Bytes', () => {
  const r = Kern.pdfModell({ bestand: bestand(), stichtag: STICHTAG });
  assert.ok(r.ok);
  assert.ok(r.modell.kopf);
  assert.strictEqual(r.dateiname, 'Forderungsaufstellung_12-C-345-24_2026-08-12.pdf');
  assert.strictEqual(r.html, undefined);
});

test('tenor liefert den Antragstext', () => {
  const r = Kern.tenor({ bestand: bestand(), stichtag: STICHTAG });
  assert.ok(r.ok);
  assert.strictEqual(typeof r.text, 'string');
  assert.strictEqual(r.hinweis, null);
});

test('tenor erklärt ein vollständig getilgtes Konto, statt null zu liefern', () => {
  const objekt = {
    version: 1,
    konten: [{
      name: 'Getilgt', buchungen: [
        { id: 'hf', typ: 'hauptforderung', datum: '2024-01-01', betrag: 100,
          text: 'Forderung', verzinsung: { art: 'keine' } },
        { id: 'z', typ: 'zahlung', datum: '2024-02-01', betrag: 100, text: 'Ausgleich' },
      ],
    }],
  };
  const r = Kern.tenor({ bestand: bestand(objekt), stichtag: STICHTAG });
  assert.ok(r.ok);
  assert.strictEqual(r.text, null);
  assert.match(r.hinweis, /[Kk]eine offenen Forderungen/);
});

// ── rvg ────────────────────────────────────────────────────────────────────

test('rvg erzeugt Nebenforderungen samt Gebührenstand', () => {
  const r = Kern.rvg({
    gegenstandswert: 5000, datum: '2024-05-02',
    vorgerichtlich: { aktiv: true, faktor: 1.3, auslagenpauschale: true, umsatzsteuer: true },
  });
  assert.ok(r.ok);
  assert.strictEqual(r.buchungen.length, 3);
  assert.ok(r.buchungen.every((b) => b.typ === 'nebenforderung' && b.datum === '2024-05-02'));
  assert.ok(r.stand.quelle.includes('KostRÄG'));
});

test('rvg nimmt TT.MM.JJJJ an und reicht es normalisiert weiter', () => {
  const r = Kern.rvg({
    gegenstandswert: 5000, datum: '02.05.2024',
    vorgerichtlich: { aktiv: true, faktor: 1.3 },
  });
  assert.ok(r.ok);
  assert.ok(r.buchungen.every((b) => b.datum === '2024-05-02'));
});

test('rvg fängt die Würfe aus rvg.js als Fehlerobjekt ab', () => {
  const r = Kern.rvg({
    gegenstandswert: 5000, datum: '2024-05-02',
    vorgerichtlich: { aktiv: true, faktor: -1 },
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, Kern.FEHLERCODES.RVG_EINGABE_UNGUELTIG);
  assert.match(r.fehler, /Faktor/);
});

test('rvg prüft die Typen, die rvg.js selbst nicht prüft', () => {
  const faelle = [
    [{ gegenstandswert: '5000', datum: '2024-05-02' }, /Gegenstandswert/],
    [{ gegenstandswert: 5000, datum: 'irgendwann' }, /Datum/],
    [{ gegenstandswert: 5000, datum: '2024-05-02', vorgerichtlich: 'ja' }, /vorgerichtlich/],
    [{ gegenstandswert: 5000, datum: '2024-05-02', vorgerichtlich: { aktiv: 'ja' } }, /aktiv/],
    [{ gegenstandswert: 5000, datum: '2024-05-02', gerichtlich: { anrechnungsFaktor: 'halb' } }, /anrechnungsFaktor/],
    [{ gegenstandswert: 5000, datum: '2024-05-02', gerichtlich: { verfahrensart: 'schiedsgericht' } }, /Verfahrensart/],
    [{ gegenstandswert: 5000, datum: '2024-05-02', verzugspauschale: 40 }, /verzugspauschale/],
  ];
  for (const [eingabe, muster] of faelle) {
    const r = Kern.rvg(eingabe);
    assert.strictEqual(r.ok, false, `${JSON.stringify(eingabe)} hätte abgelehnt werden müssen`);
    assert.strictEqual(r.code, Kern.FEHLERCODES.RVG_EINGABE_UNGUELTIG);
    assert.match(r.fehler, muster);
  }
});

// ── basiszins und baueBestand ──────────────────────────────────────────────

test('basiszins liefert Tabelle und Deckungsende', () => {
  const r = Kern.basiszins([]);
  assert.ok(r.ok);
  assert.ok(r.tabelle.length > 40);
  assert.match(r.deckungsEnde, /^\d{4}-\d{2}-\d{2}$/);
});

test('baueBestand validiert das Ergebnis, bevor es jemand schreiben kann', () => {
  const gut = Kern.baueBestand({ konten: [{ name: 'Neu', buchungen: [] }] });
  assert.ok(gut.ok);
  assert.strictEqual(gut.objekt.version, 1);
  assert.strictEqual(gut.objekt.basiszinsOverrides, undefined);

  const schlecht = Kern.baueBestand({ konten: [{ buchungen: [] }] });
  assert.strictEqual(schlecht.ok, false);
  assert.strictEqual(schlecht.code, Kern.FEHLERCODES.BESTAND_UNGUELTIG);
  assert.match(schlecht.fehler, /name/);
});

test('baueBestand übernimmt basiszinsOverrides nur, wenn welche da sind', () => {
  const r = Kern.baueBestand({
    konten: [{ name: 'Neu', buchungen: [] }],
    basiszinsOverrides: [{ ab: '2027-01-01', satz: 2.5 }],
  });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.objekt.basiszinsOverrides, [{ ab: '2027-01-01', satz: 2.5 }]);
});

// ── Fehlercode-Disziplin ───────────────────────────────────────────────────

test('jeder Fehlerpfad liefert code und fehler, und wirft nie', () => {
  const eingaben = [
    () => Kern.ladeBestand(null),
    () => Kern.ladeBestand('kein Objekt'),
    () => Kern.waehleKonto({ konten: [] }, 'x'),
    () => Kern.normalisiereStichtag('quatsch'),
    () => Kern.rvg(null),
    () => Kern.baueBestand({ konten: [{}] }),
  ];
  for (const aufruf of eingaben) {
    const r = aufruf();
    assert.strictEqual(r.ok, false);
    assert.ok(Object.values(Kern.FEHLERCODES).includes(r.code), `unbekannter Code ${r.code}`);
    assert.strictEqual(typeof r.fehler, 'string');
    assert.ok(r.fehler.length > 0);
  }
});

test('FEHLERCODES ist eingefroren und selbstkonsistent', () => {
  assert.ok(Object.isFrozen(Kern.FEHLERCODES));
  for (const [name, wert] of Object.entries(Kern.FEHLERCODES)) {
    assert.strictEqual(name, wert, 'Schlüssel und Wert müssen gleich lauten');
  }
});
