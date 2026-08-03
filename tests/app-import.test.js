const test = require('node:test');
const assert = require('node:assert');
const { validiereExport } = require('../app.js');

function gueltigeDatei() {
  return {
    version: 1,
    konten: [
      {
        name: 'Mandant Müller ./. Schuldner Meier',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
        buchungen: [
          { id: 'b1', typ: 'hauptforderung', datum: '2024-01-01', betrag: 1000, text: 'Rechnung', verzinsung: null },
          { id: 'b2', typ: 'zahlung', datum: '2024-02-01', betrag: 200, text: 'Zahlung', verzinsung: null },
        ],
      },
    ],
  };
}

test('validiereExport: gültige Datei liefert ok:true mit konten', () => {
  const ergebnis = validiereExport(gueltigeDatei());
  assert.strictEqual(ergebnis.ok, true);
  assert.strictEqual(ergebnis.konten.length, 1);
});

test('validiereExport: akzeptiert tilgungsreihenfolge 497 und fehlendes Feld', () => {
  const mit497 = gueltigeDatei();
  mit497.konten[0].tilgungsreihenfolge = '497';
  assert.strictEqual(validiereExport(mit497).ok, true);
  assert.strictEqual(validiereExport(gueltigeDatei()).ok, true);
});

test('validiereExport: unbekannte tilgungsreihenfolge liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].tilgungsreihenfolge = '123';
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler.includes('Tilgungsreihenfolge'));

  const zahl = gueltigeDatei();
  zahl.konten[0].tilgungsreihenfolge = 497;
  assert.strictEqual(validiereExport(zahl).ok, false);
});

test('validiereExport: leeres Objekt ohne version liefert ok:false', () => {
  const ergebnis = validiereExport({});
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: falsche version liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.version = 2;
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: konten kein Array liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten = 'kein-array';
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: Buchung mit unbekanntem typ liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].typ = 'unbekannt';
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: Buchung mit ungültigem datum liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].datum = '31.02.2024';
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: Betrag als String liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].betrag = '1000';
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: Konto ohne name liefert ok:false', () => {
  const datei = gueltigeDatei();
  delete datei.konten[0].name;
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: Konto ohne buchungen-Array liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen = 'kein-array';
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: verzinsung ohne beginn liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].verzinsung = { art: 'fest', satz: 5 };
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: verzinsung mit Fremdwert bei art liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].verzinsung = { art: 'unsinn', satz: 5, beginn: '2024-01-01', methode: 'kalender' };
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: verzinsung mit satz als String liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].verzinsung = { art: 'fest', satz: '5', beginn: '2024-01-01', methode: 'kalender' };
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: verzinsung mit ende vor beginn liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].verzinsung = {
    art: 'fest', satz: 5, beginn: '2024-06-01', ende: '2024-01-01', methode: 'kalender',
  };
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});

test('validiereExport: verzinsung {art:"keine"} liefert ok:true', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].verzinsung = { art: 'keine' };
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, true);
});

test('validiereExport: vollständige fest-Verzinsung liefert ok:true', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].verzinsung = {
    art: 'fest', satz: 5, beginn: '2024-01-01', ende: null, methode: 'kalender',
  };
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, true);
});

test('validiereExport: betrag 0 liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].betrag = 0;
  const ergebnis = validiereExport(datei);
  assert.strictEqual(ergebnis.ok, false);
  assert.ok(ergebnis.fehler);
});
