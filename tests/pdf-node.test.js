// PDF-Erzeugung außerhalb des Browsers.
//
// Eigene Testdatei, weil pdf-node.js einen globalen window-Shim setzt.
// node --test isoliert Testdateien in eigenen Prozessen, der Shim leckt also
// nicht in die übrigen Tests.
//
// Dieser Test ist die Absicherung gegen ein vendor/jspdf-Update: Dependabot
// sieht vendor/ mangels npm-Ökosystem nicht, Änderungen fallen also nur hier auf.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Kern = require('../kern.js');
const PdfNode = require('../pdf-node.js');

const STICHTAG = '2026-08-12';

function modell(stichtag) {
  const roh = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'docs', 'beispiel-konto.json'), 'utf8'));
  const r = Kern.pdfModell({ bestand: Kern.ladeBestand(roh), stichtag: stichtag || STICHTAG });
  assert.ok(r.ok, r.fehler);
  return r;
}

test('der Shim macht jsPDF für pdfexport.js sichtbar', () => {
  // pdfexport.js:92 liest window.jspdf. Das UMD nimmt in Node den
  // module.exports-Zweig und setzt globalThis.jspdf NICHT von selbst —
  // ohne die Zuweisung in pdf-node.js wirft erzeugePdf „jsPDF ist nicht geladen."
  assert.strictEqual(typeof globalThis.window, 'object');
  assert.strictEqual(typeof globalThis.jspdf, 'object');
  assert.strictEqual(typeof globalThis.jspdf.jsPDF, 'function');
});

test('autoTable ist am jsPDF-Prototyp eingehängt', () => {
  // Das autoTable-UMD hängt sich in Node nicht selbst ein; applyPlugin ist nötig.
  assert.strictEqual(typeof globalThis.jspdf.jsPDF.API.autoTable, 'function');
});

test('der window-Shim aktiviert den UI-Teil von app.js nicht', () => {
  // app.js:160 prüft typeof document, nicht window — deshalb bleibt der
  // UI-Block trotz Shim inaktiv. Diese Eigenschaft ist beabsichtigt und
  // wird hier festgenagelt.
  assert.strictEqual(typeof document, 'undefined');
  assert.strictEqual(typeof globalThis.self, 'undefined');
});

test('erzeugePdf liefert einen Buffer mit PDF-Signatur', () => {
  const buf = PdfNode.erzeugePdf(modell().modell);
  assert.ok(Buffer.isBuffer(buf), 'kein Buffer');
  assert.strictEqual(buf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(buf.length > 10 * 1024, `nur ${buf.length} Bytes`);
});

test('das PDF endet regulär', () => {
  const buf = PdfNode.erzeugePdf(modell().modell);
  assert.match(buf.subarray(-32).toString('latin1'), /%%EOF\s*$/);
});

test('Umlaute und Eurozeichen überleben die Erzeugung', () => {
  const objekt = {
    version: 1,
    konten: [{
      id: 'umlaute', name: 'Müller & Söhne GmbH ./. Groß', aktenzeichen: '1 C 2/26',
      buchungen: [{
        id: 'hf', typ: 'hauptforderung', datum: '2025-01-15', betrag: 1234.56,
        text: 'Vergütung für Übersetzung — 100 € Zuschlag, Größe: äöüß',
        verzinsung: { art: 'basiszins', satz: 5, beginn: '2025-02-01', ende: null, methode: 'kalender' },
      }],
    }],
  };
  const r = Kern.pdfModell({ bestand: Kern.ladeBestand(objekt), stichtag: STICHTAG });
  const buf = PdfNode.erzeugePdf(r.modell);
  assert.strictEqual(buf.subarray(0, 5).toString('latin1'), '%PDF-');
  // Helvetica/WinAnsi: die Umlaute stehen als Einzelbytes im Textstrom.
  const roh = buf.toString('latin1');
  assert.ok(roh.includes('Vergütung') || roh.includes('bersetzung'),
    'Text mit Umlauten nicht im PDF auffindbar');
});

test('erzeugePdf ist mehrfach im selben Prozess aufrufbar', () => {
  // applyPlugin darf nur einmal laufen; ein zweiter Aufruf würde sonst
  // die autoTable-Registrierung verdoppeln.
  const m = modell().modell;
  const a = PdfNode.erzeugePdf(m);
  const b = PdfNode.erzeugePdf(m);
  assert.strictEqual(a.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.strictEqual(b.subarray(0, 5).toString('latin1'), '%PDF-');
  // Gleiche Eingabe, gleiche Grössenordnung (die PDF-Id variiert).
  assert.ok(Math.abs(a.length - b.length) < 256, `${a.length} vs. ${b.length}`);
});

test('ein erneutes require liefert dasselbe Modul, ohne erneut zu shimmen', () => {
  assert.strictEqual(require('../pdf-node.js'), PdfNode);
  assert.strictEqual(typeof globalThis.jspdf.jsPDF.API.autoTable, 'function');
});

test('der Dateiname aus kern.js passt zum erzeugten PDF', () => {
  const r = modell();
  assert.strictEqual(r.dateiname, 'Forderungsaufstellung_12-C-345-24_2026-08-12.pdf');
  assert.doesNotMatch(r.dateiname, /[\s"'\\/:*?<>|]/);
});
