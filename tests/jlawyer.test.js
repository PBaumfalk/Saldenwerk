const test = require('node:test');
const assert = require('node:assert');
const Core = require('../jlawyer.js');

test('baueUrl: normalisiert Slashes und ergänzt REST-Basis', () => {
  assert.strictEqual(Core.baueUrl('https://server:8080', '/v1/cases/list'),
    'https://server:8080/j-lawyer-io/rest/v1/cases/list');
  assert.strictEqual(Core.baueUrl('https://server:8080/', 'v1/cases/list'),
    'https://server:8080/j-lawyer-io/rest/v1/cases/list');
  assert.strictEqual(Core.baueUrl('https://server:8080/j-lawyer-io/rest', '/v1/security/metadata'),
    'https://server:8080/j-lawyer-io/rest/v1/security/metadata');
});

test('authHeader: Basic mit UTF-8-sicherer Kodierung', () => {
  assert.strictEqual(Core.authHeader('admin', 'a'), 'Basic ' + Buffer.from('admin:a').toString('base64'));
  assert.strictEqual(Core.authHeader('jürgen', 'paßwort€'),
    'Basic ' + Buffer.from('jürgen:paßwort€', 'utf8').toString('base64'));
});

test('base64VonString und base64VonArrayBuffer', () => {
  assert.strictEqual(Core.base64VonString('Hällo § Wörld'),
    Buffer.from('Hällo § Wörld', 'utf8').toString('base64'));
  const bytes = new Uint8Array([37, 80, 68, 70, 255, 0, 1]);
  assert.strictEqual(Core.base64VonArrayBuffer(bytes.buffer), Buffer.from(bytes).toString('base64'));
});

test('findeAkten: exakter fileNumber-Abgleich, trim und case-insensitiv', () => {
  const treffer = [
    { id: 'a', fileNumber: '12 C 345/26', name: 'Müller ./. Meier' },
    { id: 'b', fileNumber: '12 C 345/26-2', name: 'Müller ./. Meier ZV' },
    { id: 'c', fileNumber: '99 O 1/25', name: 'Anders' },
  ];
  const r = Core.findeAkten(treffer, ' 12 c 345/26 ');
  assert.deepStrictEqual(r.exakt.map((a) => a.id), ['a']);
  assert.strictEqual(r.alle.length, 3);
  assert.deepStrictEqual(Core.findeAkten([], '12 C 1/26'), { exakt: [], alle: [] });
});

test('mappeParteien: Mandant wird Gläubiger, Gegner wird Schuldner', () => {
  const parties = [
    { contactId: 'k1', involvementType: 'Mandant' },
    { contactId: 'k2', involvementType: 'Gegner' },
  ];
  const kontakte = { k1: { company: 'Müller GmbH' }, k2: { firstName: 'Max', name: 'Meier' } };
  const r = Core.mappeParteien(parties, kontakte);
  assert.strictEqual(r.glaeubiger, 'Müller GmbH');
  assert.strictEqual(r.schuldner, 'Max Meier');
  assert.deepStrictEqual(r.hinweise, []);
});

test('mappeParteien: mehrere je Rolle und unbekannte Rollen erzeugen Hinweise', () => {
  const parties = [
    { contactId: 'k1', involvementType: 'Mandant' },
    { contactId: 'k2', involvementType: 'Mandant' },
    { contactId: 'k3', involvementType: 'Sachverständiger' },
  ];
  const kontakte = { k1: { name: 'A' }, k2: { name: 'B' }, k3: { name: 'C' } };
  const r = Core.mappeParteien(parties, kontakte);
  assert.strictEqual(r.glaeubiger, 'A, B');
  assert.strictEqual(r.schuldner, '');
  assert.ok(r.hinweise.some((h) => h.includes('Mehrere')));
  assert.ok(r.hinweise.some((h) => h.includes('Sachverständiger')));
});

test('klassifiziereFehler: deutsche Meldungen je Fehlerart', () => {
  assert.ok(Core.klassifiziereFehler({ art: 'netzwerk' }).includes('CORS'));
  assert.ok(Core.klassifiziereFehler({ art: 'timeout' }).includes('Zeitüberschreitung'));
  assert.ok(Core.klassifiziereFehler({ art: 'http', status: 401 }).includes('Anmeldung'));
  assert.ok(Core.klassifiziereFehler({ art: 'http', status: 403 }).includes('Berechtigung'));
  assert.ok(Core.klassifiziereFehler({ art: 'http', status: 404 }).includes('nicht gefunden'));
  assert.ok(Core.klassifiziereFehler({ art: 'http', status: 500 }).includes('Serverfehler'));
  assert.ok(Core.klassifiziereFehler({ art: 'json' }).includes('Unerwartete Antwort'));
});

test('uploadDateiname: Sanitisierung und Kollisions-Suffix', () => {
  assert.strictEqual(Core.uploadDateiname('Forderungsaufstellung_12 C 345/26_2026-08-05', 'pdf', []),
    'Forderungsaufstellung_12 C 345-26_2026-08-05.pdf');
  const vorhandene = ['Bericht.pdf', 'bericht_2.pdf'];
  assert.strictEqual(Core.uploadDateiname('Bericht', 'pdf', vorhandene), 'Bericht_3.pdf');
  assert.strictEqual(Core.uploadDateiname('Neu', 'json', vorhandene), 'Neu.json');
});

test('pruefeApiLevel: v7-Suche ab Level 7, sonst Fallback', () => {
  assert.strictEqual(Core.pruefeApiLevel({ apiLevel: 8 }), 'v7');
  assert.strictEqual(Core.pruefeApiLevel({ apiLevel: 7 }), 'v7');
  assert.strictEqual(Core.pruefeApiLevel({ apiLevel: 6 }), 'v1');
  assert.strictEqual(Core.pruefeApiLevel(null), 'v1');
});
