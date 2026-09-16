// Hält server/openapi.json und den Router deckungsgleich — in beide Richtungen.
//
// Eine handgeschriebene Schnittstellenbeschreibung läuft sonst innerhalb
// weniger Commits von der Implementierung weg, und niemand merkt es: Die Spec
// ist syntaktisch weiterhin gültig, beschreibt aber etwas anderes als der
// Server tut. Das ist schlimmer als gar keine Beschreibung.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { erzeugeServer, baueRouten } = require('../server/api.js');
const Kern = require('../kern.js');

const SPEC = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'server', 'openapi.json'), 'utf8'));
const ROUTEN = baueRouten({ benutzer: 'a', passwort: 'b' });

// Statische Beiwerk-Dateien der Doku-Seite. Sie sind Teil der Auslieferung,
// aber keine Schnittstelle — sie gehören bewusst nicht in die Beschreibung.
const NICHT_BESCHRIEBEN = new Set([
  '/api/docs/swagger-ui.css',
  '/api/docs/swagger-ui-bundle.js',
]);

const PRAEFIX = SPEC.servers[0].url; // '/api'
const specPfade = () => Object.keys(SPEC.paths).map((p) => PRAEFIX + p);

test('die Beschreibung ist gültiges JSON und nennt sich OpenAPI 3.1', () => {
  assert.match(SPEC.openapi, /^3\.1\./);
  assert.strictEqual(SPEC.info.title, 'Saldenwerk');
  assert.strictEqual(SPEC.servers.length, 1);
});

test('die Beschreibung trägt dieselbe Version wie der Server', () => {
  assert.strictEqual(SPEC.info.version, Kern.VERSION,
    'openapi.json und kern.js nennen verschiedene Versionen');
});

test('jeder bediente Pfad ist beschrieben', () => {
  const beschrieben = new Set(specPfade());
  for (const route of ROUTEN) {
    if (NICHT_BESCHRIEBEN.has(route.pfad)) continue;
    assert.ok(beschrieben.has(route.pfad),
      `Der Server bedient „${route.pfad}", server/openapi.json beschreibt ihn nicht.`);
  }
});

test('jeder beschriebene Pfad wird auch bedient', () => {
  const bedient = new Set(ROUTEN.map((r) => r.pfad));
  for (const pfad of specPfade()) {
    assert.ok(bedient.has(pfad),
      `server/openapi.json beschreibt „${pfad}", der Server bedient ihn nicht.`);
  }
});

test('die beschriebenen Methoden stimmen mit dem Router überein', () => {
  for (const [specPfad, eintrag] of Object.entries(SPEC.paths)) {
    const pfad = PRAEFIX + specPfad;
    const beschrieben = Object.keys(eintrag).filter((k) => ['get', 'post', 'put', 'delete', 'patch'].includes(k));
    const bedient = ROUTEN.filter((r) => r.pfad === pfad).map((r) => r.methode.toLowerCase());
    assert.deepStrictEqual(beschrieben.sort(), bedient.sort(),
      `Methoden für „${pfad}" weichen ab`);
  }
});

test('die Beschreibung bildet die Authentifizierung korrekt ab', () => {
  for (const [specPfad, eintrag] of Object.entries(SPEC.paths)) {
    const pfad = PRAEFIX + specPfad;
    for (const [methode, vorgang] of Object.entries(eintrag)) {
      const route = ROUTEN.find((r) => r.pfad === pfad && r.methode.toLowerCase() === methode);
      assert.ok(route, `${methode} ${pfad} nicht im Router`);
      const offenLautSpec = Array.isArray(vorgang.security) && vorgang.security.length === 0;
      assert.strictEqual(offenLautSpec, !route.auth,
        `Die Anmeldepflicht für ${methode.toUpperCase()} ${pfad} ist falsch beschrieben ` +
        `(Router: ${route.auth ? 'geschützt' : 'offen'}, Spec: ${offenLautSpec ? 'offen' : 'geschützt'}).`);
    }
  }
});

test('jeder Vorgang hat operationId, summary und eine 200er-Antwort', () => {
  const ids = new Set();
  for (const [specPfad, eintrag] of Object.entries(SPEC.paths)) {
    for (const [methode, vorgang] of Object.entries(eintrag)) {
      const wo = `${methode.toUpperCase()} ${specPfad}`;
      assert.ok(vorgang.operationId, `${wo}: operationId fehlt`);
      assert.ok(!ids.has(vorgang.operationId), `${wo}: operationId „${vorgang.operationId}" doppelt`);
      ids.add(vorgang.operationId);
      assert.ok(vorgang.summary, `${wo}: summary fehlt`);
      assert.ok(vorgang.responses && vorgang.responses['200'], `${wo}: keine 200er-Antwort beschrieben`);
    }
  }
});

test('geschützte Vorgänge beschreiben ihre 401-Antwort', () => {
  for (const [specPfad, eintrag] of Object.entries(SPEC.paths)) {
    for (const [methode, vorgang] of Object.entries(eintrag)) {
      if (Array.isArray(vorgang.security) && vorgang.security.length === 0) continue;
      assert.ok(vorgang.responses['401'],
        `${methode.toUpperCase()} ${specPfad} ist geschützt, beschreibt aber keine 401.`);
    }
  }
});

test('POST-Vorgänge beschreiben 400, 413 und 415', () => {
  for (const [specPfad, eintrag] of Object.entries(SPEC.paths)) {
    if (!eintrag.post) continue;
    for (const status of ['400', '413', '415']) {
      assert.ok(eintrag.post.responses[status],
        `POST ${specPfad} beschreibt keine ${status}.`);
    }
  }
});

test('alle $ref-Verweise lassen sich auflösen', () => {
  const verweise = [];
  (function sammle(knoten) {
    if (!knoten || typeof knoten !== 'object') return;
    if (typeof knoten.$ref === 'string') verweise.push(knoten.$ref);
    for (const wert of Object.values(knoten)) sammle(wert);
  })(SPEC);
  assert.ok(verweise.length > 20, `nur ${verweise.length} Verweise gefunden — Sammelfunktion prüfen`);

  for (const verweis of new Set(verweise)) {
    assert.ok(verweis.startsWith('#/'), `externe Verweise sind nicht vorgesehen: ${verweis}`);
    let knoten = SPEC;
    for (const teil of verweis.slice(2).split('/')) {
      knoten = knoten && knoten[teil.replace(/~1/g, '/').replace(/~0/g, '~')];
    }
    assert.ok(knoten, `Verweis „${verweis}" zeigt ins Leere`);
  }
});

test('jedes definierte Schema wird auch benutzt', () => {
  const text = JSON.stringify(SPEC);
  for (const name of Object.keys(SPEC.components.schemas)) {
    assert.ok(text.includes(`#/components/schemas/${name}`),
      `Schema „${name}" ist definiert, wird aber nirgends verwendet.`);
  }
});

test('die Fehlercode-Liste der Spec entspricht Kern.FEHLERCODES', () => {
  // Läuft sonst bei jedem neuen Fehlercode auseinander.
  assert.deepStrictEqual(
    [...SPEC.components.schemas.Fehler.properties.code.enum].sort(),
    Object.values(Kern.FEHLERCODES).sort());
});

test('das Basiszins-Schema kennt negative Sätze', () => {
  // Die Tabelle enthält von 2013 bis 2022 durchgehend negative Sätze —
  // ein minimum: 0 wäre hier ein stiller Fehler.
  const satz = SPEC.components.schemas.BasiszinsEintrag.properties.satz;
  assert.strictEqual(satz.minimum, undefined);
  assert.strictEqual(satz.exclusiveMinimum, undefined);
});

// ── Auslieferung ───────────────────────────────────────────────────────────

async function mitServer(t, ablauf) {
  const server = erzeugeServer({ benutzer: 'a', passwort: 'b' });
  await new Promise((fertig) => server.listen(0, '127.0.0.1', fertig));
  t.after(() => new Promise((fertig) => server.close(fertig)));
  return ablauf(`http://127.0.0.1:${server.address().port}`);
}

test('GET /api/openapi.json liefert die Beschreibung ohne Anmeldung', (t) => mitServer(t, async (basis) => {
  const antwort = await fetch(`${basis}/api/openapi.json`);
  assert.strictEqual(antwort.status, 200);
  assert.match(antwort.headers.get('content-type'), /application\/json/);
  const geliefert = await antwort.json();
  assert.deepStrictEqual(geliefert, SPEC);
}));

test('GET /api/docs liefert die Swagger-UI-Seite ohne Anmeldung', (t) => mitServer(t, async (basis) => {
  const antwort = await fetch(`${basis}/api/docs`);
  assert.strictEqual(antwort.status, 200);
  assert.match(antwort.headers.get('content-type'), /text\/html/);
  const html = await antwort.text();
  assert.match(html, /<html lang="de">/);
  assert.ok(html.includes('/api/openapi.json'), 'die Seite verweist nicht auf die Beschreibung');
}));

test('die Swagger-UI-Dateien werden mitgeliefert', (t) => mitServer(t, async (basis) => {
  for (const [pfad, typ] of [['/api/docs/swagger-ui.css', /text\/css/],
    ['/api/docs/swagger-ui-bundle.js', /javascript/]]) {
    const antwort = await fetch(basis + pfad);
    assert.strictEqual(antwort.status, 200, `${pfad} fehlt`);
    assert.match(antwort.headers.get('content-type'), typ);
    assert.ok((await antwort.text()).length > 10000);
  }
}));

test('die Doku-Seite lädt nichts von fremden Hosts', () => {
  // Voraussetzung dafür, dass die bestehende CSP (default-src self) ohne
  // Lockerung trägt. Bei einem Swagger-UI-Update erneut prüfen.
  const html = fs.readFileSync(path.join(__dirname, '..', 'server', 'docs.html'), 'utf8');
  for (const treffer of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.ok(treffer[1].startsWith('/'), `docs.html lädt „${treffer[1]}" von extern`);
  }
  const css = fs.readFileSync(
    path.join(__dirname, '..', 'vendor', 'swagger-ui', 'swagger-ui.css'), 'utf8');
  const externe = [...css.matchAll(/url\((?!["']?data:)([^)]*)\)/g)];
  assert.strictEqual(externe.length, 0,
    `swagger-ui.css lädt externe Ressourcen: ${externe.map((t) => t[1]).join(', ')}`);
});

test('die Apache-2.0-Lizenz von Swagger UI liegt bei', () => {
  const lizenz = fs.readFileSync(
    path.join(__dirname, '..', 'vendor', 'swagger-ui', 'LICENSE-swagger-ui.txt'), 'utf8');
  assert.match(lizenz, /Apache License/);
  assert.match(lizenz, /Version 2\.0/);
  const readme = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'README.md'), 'utf8');
  assert.ok(readme.includes('Swagger UI'), 'vendor/README.md führt Swagger UI nicht auf');
  assert.ok(readme.includes('Apache-2.0'), 'vendor/README.md nennt die Lizenz nicht');
});
