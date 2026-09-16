// Transport-Verhalten der REST-API: Router, Authentifizierung, Fehlerformat.
//
// Der Server wird in-process auf Port 0 gestartet — node --test lässt
// Testdateien nebenläufig laufen, ein fester Port würde kollidieren.
// Das fachliche Verhalten prüft tests/kern.test.js; hier geht es nur um HTTP.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { erzeugeServer, MAX_BYTES } = require('../server/api.js');
const { leseKonfiguration } = require('../server/server.js');
const Kern = require('../kern.js');

const KONFIG = { benutzer: 'kanzlei', passwort: 'geheim' };
const AUTH = 'Basic ' + Buffer.from('kanzlei:geheim').toString('base64');

// Startet einen Server auf einem freien Port und räumt ihn nach dem Test weg.
async function mitServer(t, konfig, ablauf) {
  const server = erzeugeServer(konfig || KONFIG);
  await new Promise((fertig) => server.listen(0, '127.0.0.1', fertig));
  const basis = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((fertig) => server.close(fertig)));
  return ablauf(basis);
}

const json = (koerper) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: AUTH },
  body: typeof koerper === 'string' ? koerper : JSON.stringify(koerper),
});

// ── Statusendpunkt ─────────────────────────────────────────────────────────

test('GET /api/status antwortet ohne Anmeldung', (t) => mitServer(t, null, async (basis) => {
  const antwort = await fetch(`${basis}/api/status`);
  assert.strictEqual(antwort.status, 200);
  const koerper = await antwort.json();
  assert.strictEqual(koerper.app, 'Saldenwerk');
  assert.strictEqual(koerper.version, Kern.VERSION);
  assert.strictEqual(koerper.features.jlawyer, false);
}));

test('GET /api/status meldet die j-lawyer-Anbindung, wenn sie konfiguriert ist',
  (t) => mitServer(t, Object.assign({}, KONFIG, { jlawyer: { url: 'https://x' } }),
    async (basis) => {
      const koerper = await (await fetch(`${basis}/api/status`)).json();
      assert.strictEqual(koerper.features.jlawyer, true);
    }));

// ── Authentifizierung ──────────────────────────────────────────────────────

test('geschützte Endpunkte antworten ohne Anmeldung mit 401', (t) => mitServer(t, null, async (basis) => {
  for (const pfad of ['/api/basiszins', '/api/berechnung', '/api/report', '/api/pdf',
    '/api/tenor', '/api/rvg']) {
    const antwort = await fetch(`${basis}${pfad}`, { method: pfad === '/api/basiszins' ? 'GET' : 'POST' });
    assert.strictEqual(antwort.status, 401, `${pfad} war nicht geschützt`);
    assert.match(antwort.headers.get('www-authenticate') || '', /^Basic realm="Saldenwerk"/);
    assert.strictEqual((await antwort.json()).fehler, 'Anmeldung erforderlich.');
  }
}));

test('falsche Zugangsdaten werden abgewiesen', (t) => mitServer(t, null, async (basis) => {
  const faelle = [
    'Basic ' + Buffer.from('kanzlei:falsch').toString('base64'),
    'Basic ' + Buffer.from('fremd:geheim').toString('base64'),
    'Basic ' + Buffer.from('kanzlei').toString('base64'),
    'Basic nicht-base64!!',
    'Bearer ' + Buffer.from('kanzlei:geheim').toString('base64'),
    '',
  ];
  for (const kopf of faelle) {
    const antwort = await fetch(`${basis}/api/basiszins`,
      kopf ? { headers: { Authorization: kopf } } : undefined);
    assert.strictEqual(antwort.status, 401, `„${kopf}" wurde akzeptiert`);
  }
}));

test('richtige Zugangsdaten werden angenommen', (t) => mitServer(t, null, async (basis) => {
  const antwort = await fetch(`${basis}/api/basiszins`, { headers: { Authorization: AUTH } });
  assert.strictEqual(antwort.status, 200);
  const koerper = await antwort.json();
  assert.ok(koerper.tabelle.length > 40);
  assert.match(koerper.deckungsEnde, /^\d{4}-\d{2}-\d{2}$/);
}));

test('Zugangsdaten mit Umlauten und Doppelpunkt im Passwort funktionieren',
  (t) => mitServer(t, { benutzer: 'müller', passwort: 'a:b:cß' }, async (basis) => {
    const kopf = 'Basic ' + Buffer.from('müller:a:b:cß', 'utf8').toString('base64');
    const antwort = await fetch(`${basis}/api/basiszins`, { headers: { Authorization: kopf } });
    assert.strictEqual(antwort.status, 200);
  }));

// ── Routing ────────────────────────────────────────────────────────────────

test('unbekannte Pfade ergeben 404', (t) => mitServer(t, null, async (basis) => {
  for (const pfad of ['/api/gibtsnicht', '/', '/api', '/api/jlawyer/akten']) {
    const antwort = await fetch(`${basis}${pfad}`, { headers: { Authorization: AUTH } });
    assert.strictEqual(antwort.status, 404, `${pfad} ergab ${antwort.status}`);
    assert.match((await antwort.json()).fehler, /nicht bekannt/);
  }
}));

test('falsche Methoden ergeben 405, nicht 404', (t) => mitServer(t, null, async (basis) => {
  const antwort = await fetch(`${basis}/api/berechnung`,
    { method: 'GET', headers: { Authorization: AUTH } });
  assert.strictEqual(antwort.status, 405);
  assert.match((await antwort.json()).fehler, /GET/);

  const zweite = await fetch(`${basis}/api/status`, { method: 'DELETE' });
  assert.strictEqual(zweite.status, 405);
}));

test('ein abschließender Schrägstrich ändert die Route nicht', (t) => mitServer(t, null, async (basis) => {
  assert.strictEqual((await fetch(`${basis}/api/status/`)).status, 200);
}));

test('Query-Parameter stören das Routing nicht', (t) => mitServer(t, null, async (basis) => {
  assert.strictEqual((await fetch(`${basis}/api/status?x=1`)).status, 200);
}));

// ── Body-Behandlung ────────────────────────────────────────────────────────

test('fehlender oder falscher Inhaltstyp ergibt 415', (t) => mitServer(t, null, async (basis) => {
  for (const typ of [undefined, 'text/plain', 'application/xml']) {
    const kopfzeilen = { Authorization: AUTH };
    if (typ) kopfzeilen['Content-Type'] = typ;
    const antwort = await fetch(`${basis}/api/berechnung`,
      { method: 'POST', headers: kopfzeilen, body: '{}' });
    assert.strictEqual(antwort.status, 415, `Typ „${typ}" ergab ${antwort.status}`);
  }
}));

test('application/json mit Zeichensatzangabe wird angenommen', (t) => mitServer(t, null, async (basis) => {
  const antwort = await fetch(`${basis}/api/berechnung`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: AUTH },
    body: JSON.stringify({ version: 1, konten: [{ name: 'X', buchungen: [] }] }),
  });
  assert.strictEqual(antwort.status, 200);
}));

test('leerer Körper und kaputtes JSON ergeben 400', (t) => mitServer(t, null, async (basis) => {
  const leer = await fetch(`${basis}/api/berechnung`, json(''));
  assert.strictEqual(leer.status, 400);
  assert.match((await leer.json()).fehler, /keine Daten/);

  const kaputt = await fetch(`${basis}/api/berechnung`, json('{ das ist kein json'));
  assert.strictEqual(kaputt.status, 400);
  assert.match((await kaputt.json()).fehler, /gültiges JSON/);
}));

test('ein zu großer Körper ergibt 413', (t) => mitServer(t, null, async (basis) => {
  // Gültiges JSON knapp über der Grenze, damit wirklich das Limit greift
  // und nicht der Parser.
  const fuellung = 'x'.repeat(MAX_BYTES + 1024);
  const antwort = await fetch(`${basis}/api/berechnung`,
    json(`{"version":1,"konten":[],"fuellung":"${fuellung}"}`)).catch((e) => e);
  // Der Server bricht die Verbindung ab; je nach Zeitpunkt sieht fetch
  // entweder die 413-Antwort oder einen Verbindungsabbruch. Beides belegt,
  // dass nicht 10 MB in den Speicher gelesen wurden.
  if (antwort instanceof Error) {
    assert.match(String(antwort.cause || antwort), /socket|terminated|closed|EPIPE|aborted/i);
  } else {
    assert.strictEqual(antwort.status, 413);
    assert.match((await antwort.json()).fehler, /10 MB/);
  }
}));

// ── Fehlerformat ───────────────────────────────────────────────────────────

test('jede Fehlerantwort trägt das Feld fehler mit deutschem Text', (t) => mitServer(t, null, async (basis) => {
  const antworten = [
    await fetch(`${basis}/api/gibtsnicht`, { headers: { Authorization: AUTH } }),
    await fetch(`${basis}/api/basiszins`),
    await fetch(`${basis}/api/berechnung`, { method: 'GET', headers: { Authorization: AUTH } }),
    await fetch(`${basis}/api/berechnung`, json({ version: 2 })),
  ];
  for (const antwort of antworten) {
    assert.ok(antwort.status >= 400);
    assert.match(antwort.headers.get('content-type') || '', /application\/json/);
    const koerper = await antwort.json();
    assert.strictEqual(typeof koerper.fehler, 'string');
    assert.ok(koerper.fehler.length > 0);
  }
}));

test('Fehler aus kern.js werden auf passende Statuscodes abgebildet',
  (t) => mitServer(t, null, async (basis) => {
    const bestand = { version: 1, konten: [{ name: 'A', buchungen: [] }] };
    const faelle = [
      [json({ version: 2 }), 400, Kern.FEHLERCODES.BESTAND_UNGUELTIG, ''],
      [json(bestand), 404, Kern.FEHLERCODES.KONTO_NICHT_GEFUNDEN, '?kontoId=weg'],
      [json(bestand), 400, Kern.FEHLERCODES.STICHTAG_UNGUELTIG, '?stichtag=gestern'],
      [json({ version: 1, konten: [] }), 400, Kern.FEHLERCODES.KONTO_LEER, ''],
    ];
    for (const [anfrage, status, code, abfrage] of faelle) {
      const antwort = await fetch(`${basis}/api/berechnung${abfrage}`, anfrage);
      assert.strictEqual(antwort.status, status, `${code} ergab ${antwort.status}`);
      assert.strictEqual((await antwort.json()).code, code);
    }
  }));

test('Antworten werden nicht zwischengespeichert', (t) => mitServer(t, null, async (basis) => {
  const antwort = await fetch(`${basis}/api/status`);
  assert.match(antwort.headers.get('cache-control') || '', /no-store/);
}));

// ── Konfiguration und fail-closed ──────────────────────────────────────────

test('erzeugeServer verlangt Zugangsdaten', () => {
  assert.throws(() => erzeugeServer({}), /benutzer und passwort/);
  assert.throws(() => erzeugeServer({ benutzer: 'a' }), /benutzer und passwort/);
});

test('leseKonfiguration verlangt beide Zugangsdaten', () => {
  assert.match(leseKonfiguration({}).fehler, /SALDENWERK_API_BENUTZER/);
  assert.match(leseKonfiguration({ SALDENWERK_API_BENUTZER: 'a' }).fehler, /SALDENWERK_API_PASSWORT/);
});

test('leseKonfiguration lehnt eine halb konfigurierte j-lawyer-Anbindung ab', () => {
  const basis = { SALDENWERK_API_BENUTZER: 'a', SALDENWERK_API_PASSWORT: 'b' };
  const halb = leseKonfiguration(Object.assign({}, basis, { JLAWYER_URL: 'https://x' }));
  assert.match(halb.fehler, /unvollständig/);
  assert.match(halb.fehler, /JLAWYER_BENUTZER/);

  const ganz = leseKonfiguration(Object.assign({}, basis, {
    JLAWYER_URL: 'https://x', JLAWYER_BENUTZER: 'u', JLAWYER_PASSWORT: 'p' }));
  assert.ok(ganz.konfig.jlawyer);

  const keiner = leseKonfiguration(basis);
  assert.strictEqual(keiner.konfig.jlawyer, null);
});

test('leseKonfiguration prüft die Portnummer und hat einen Standardwert', () => {
  const basis = { SALDENWERK_API_BENUTZER: 'a', SALDENWERK_API_PASSWORT: 'b' };
  assert.strictEqual(leseKonfiguration(basis).konfig.port, 8091);
  assert.strictEqual(leseKonfiguration(
    Object.assign({}, basis, { SALDENWERK_API_PORT: '9000' })).konfig.port, 9000);
  for (const wert of ['abc', '-1', '70000', '80.5']) {
    assert.match(leseKonfiguration(Object.assign({}, basis, { SALDENWERK_API_PORT: wert })).fehler,
      /Portnummer/, `Port „${wert}" wurde akzeptiert`);
  }
});

test('ohne Zugangsdaten startet der Prozess gar nicht', () => {
  const skript = path.join(__dirname, '..', 'server', 'server.js');
  const umgebung = Object.assign({}, process.env);
  delete umgebung.SALDENWERK_API_BENUTZER;
  delete umgebung.SALDENWERK_API_PASSWORT;
  let gescheitert = false;
  try {
    execFileSync(process.execPath, [skript], { env: umgebung, encoding: 'utf8', timeout: 10000 });
  } catch (e) {
    gescheitert = true;
    assert.strictEqual(e.status, 1, 'Exit-Code sollte 1 sein');
    assert.match(e.stderr, /SALDENWERK_API_BENUTZER/);
    assert.strictEqual(e.stdout, '', 'stdout muss leer bleiben');
  }
  assert.ok(gescheitert, 'der Server hätte ohne Zugangsdaten nicht starten dürfen');
});
