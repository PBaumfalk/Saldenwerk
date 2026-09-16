// PDF-Endpunkt der REST-API.
//
// Eigene Testdatei: Der erste Aufruf von /api/pdf lädt pdf-node.js und setzt
// damit einen globalen window-Shim. node --test isoliert Testdateien in
// eigenen Prozessen, der Shim bleibt also hier.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { erzeugeServer } = require('../server/api.js');

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
  return ablauf((pfad, koerper) => fetch(basis + pfad, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify(koerper === undefined ? BEISPIEL() : koerper),
  }));
}

test('POST /api/pdf liefert ein PDF zum Download', (t) => mitServer(t, async (post) => {
  const antwort = await post(`/api/pdf?stichtag=${STICHTAG}`);
  assert.strictEqual(antwort.status, 200);
  assert.strictEqual(antwort.headers.get('content-type'), 'application/pdf');
  assert.strictEqual(antwort.headers.get('content-disposition'),
    'attachment; filename="Forderungsaufstellung_12-C-345-24_2026-08-12.pdf"; ' +
    "filename*=UTF-8''Forderungsaufstellung_12-C-345-24_2026-08-12.pdf");

  const buffer = Buffer.from(await antwort.arrayBuffer());
  assert.strictEqual(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(buffer.length > 10 * 1024, `nur ${buffer.length} Bytes`);
  assert.strictEqual(Number(antwort.headers.get('content-length')), buffer.length);
}));

test('Umlaute im Aktenzeichen sprengen die Content-Disposition nicht',
  (t) => mitServer(t, async (post) => {
    // Node lehnt Nicht-ASCII in Kopfzeilen mit ERR_INVALID_CHAR ab. Ohne die
    // RFC-5987-Kodierung hätte ein Konto „Müller" den Endpunkt mit 500 beendet
    // — und Umlaute in Aktenzeichen und Parteinamen sind hier der Regelfall.
    const objekt = BEISPIEL();
    objekt.konten[0].aktenzeichen = '12 C 345/24 — Müller & Söhne';
    const antwort = await post(`/api/pdf?stichtag=${STICHTAG}`, objekt);
    assert.strictEqual(antwort.status, 200);

    const kopf = antwort.headers.get('content-disposition');
    // ASCII-Ersatzschreibung für alte Clients …
    assert.match(kopf, /filename="Forderungsaufstellung_12-C-345-24-Mueller-Soehne_2026-08-12\.pdf"/);
    // … und der echte Name mit Umlauten für alle anderen.
    assert.ok(kopf.includes("filename*=UTF-8''"), kopf);
    assert.strictEqual(
      decodeURIComponent(kopf.split("filename*=UTF-8''")[1]),
      'Forderungsaufstellung_12-C-345-24-Müller-Söhne_2026-08-12.pdf');
    // Die Kopfzeile selbst ist reines ASCII.
    assert.doesNotMatch(kopf, /[^\x20-\x7e]/);
    await antwort.arrayBuffer();
  }));

test('?format=base64 liefert das PDF als JSON', (t) => mitServer(t, async (post) => {
  const antwort = await post(`/api/pdf?stichtag=${STICHTAG}&format=base64`);
  assert.strictEqual(antwort.status, 200);
  assert.match(antwort.headers.get('content-type'), /application\/json/);
  const koerper = await antwort.json();
  assert.strictEqual(koerper.dateiname, 'Forderungsaufstellung_12-C-345-24_2026-08-12.pdf');
  const buffer = Buffer.from(koerper.pdf, 'base64');
  assert.strictEqual(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(buffer.length > 10 * 1024);
}));

test('das PDF wird nicht zwischengespeichert', (t) => mitServer(t, async (post) => {
  const antwort = await post(`/api/pdf?stichtag=${STICHTAG}`);
  assert.match(antwort.headers.get('cache-control') || '', /no-store/);
  await antwort.arrayBuffer();
}));

test('ungültige Bestände ergeben auch am PDF-Endpunkt 400, kein 500',
  (t) => mitServer(t, async (post) => {
    const antwort = await post('/api/pdf', { version: 2, konten: [] });
    assert.strictEqual(antwort.status, 400);
    assert.match((await antwort.json()).fehler, /Versionsnummer/);
  }));

test('ein unbekanntes Konto ergibt 404, kein PDF', (t) => mitServer(t, async (post) => {
  const antwort = await post('/api/pdf?kontoId=gibtsnicht');
  assert.strictEqual(antwort.status, 404);
  assert.match(antwort.headers.get('content-type'), /application\/json/);
}));

test('zwei PDF-Anfragen hintereinander funktionieren', (t) => mitServer(t, async (post) => {
  // applyPlugin darf nur einmal pro Prozess laufen; ein zweiter Aufruf würde
  // die autoTable-Registrierung sonst verdoppeln.
  for (const durchlauf of [1, 2]) {
    const antwort = await post(`/api/pdf?stichtag=${STICHTAG}`);
    assert.strictEqual(antwort.status, 200, `Durchlauf ${durchlauf}`);
    const buffer = Buffer.from(await antwort.arrayBuffer());
    assert.strictEqual(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  }
}));

test('Umlaute im Kontonamen erzeugen ein gültiges PDF', (t) => mitServer(t, async (post) => {
  const objekt = {
    version: 1,
    konten: [{
      id: 'u', name: 'Müller & Söhne ./. Groß', aktenzeichen: '1 C 2/26',
      buchungen: [{
        id: 'hf', typ: 'hauptforderung', datum: '2025-01-15', betrag: 1234.56,
        text: 'Vergütung für Übersetzung, 100 € Zuschlag',
        verzinsung: { art: 'basiszins', satz: 5, beginn: '2025-02-01', ende: null, methode: 'kalender' },
      }],
    }],
  };
  const antwort = await post(`/api/pdf?stichtag=${STICHTAG}`, objekt);
  assert.strictEqual(antwort.status, 200);
  const buffer = Buffer.from(await antwort.arrayBuffer());
  assert.strictEqual(buffer.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.match(buffer.subarray(-32).toString('latin1'), /%%EOF\s*$/);
}));
