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

test('validiereExport: akzeptiert Akten-Metadaten als Text oder fehlend', () => {
  const mitMetadaten = gueltigeDatei();
  Object.assign(mitMetadaten.konten[0], {
    aktenzeichen: '12 C 345/26', glaeubiger: 'Müller GmbH', schuldner: 'Meier',
  });
  assert.strictEqual(validiereExport(mitMetadaten).ok, true);
  assert.strictEqual(validiereExport(gueltigeDatei()).ok, true);
});

test('validiereExport: Akten-Metadaten mit falschem Typ liefern ok:false', () => {
  const zahl = gueltigeDatei();
  zahl.konten[0].aktenzeichen = 42;
  const e1 = validiereExport(zahl);
  assert.strictEqual(e1.ok, false);
  assert.ok(e1.fehler.includes('aktenzeichen'));

  const objekt = gueltigeDatei();
  objekt.konten[0].glaeubiger = {};
  const e2 = validiereExport(objekt);
  assert.strictEqual(e2.ok, false);
  assert.ok(e2.fehler.includes('glaeubiger'));

  const liste = gueltigeDatei();
  liste.konten[0].schuldner = [];
  assert.strictEqual(validiereExport(liste).ok, false);
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

test('validiereExport: akzeptiert gültige basiszinsOverrides und fehlendes Feld', () => {
  const mitOverrides = gueltigeDatei();
  mitOverrides.basiszinsOverrides = [{ ab: '2027-01-01', satz: 1.5 }];
  const ergebnis = validiereExport(mitOverrides);
  assert.strictEqual(ergebnis.ok, true);
  assert.deepStrictEqual(ergebnis.basiszinsOverrides, [{ ab: '2027-01-01', satz: 1.5 }]);

  const ohne = validiereExport(gueltigeDatei());
  assert.strictEqual(ohne.ok, true);
  assert.deepStrictEqual(ohne.basiszinsOverrides, []);
});

test('validiereExport: ungültige basiszinsOverrides liefern ok:false', () => {
  const keinArray = gueltigeDatei();
  keinArray.basiszinsOverrides = 'x';
  assert.strictEqual(validiereExport(keinArray).ok, false);

  const kaputtesDatum = gueltigeDatei();
  kaputtesDatum.basiszinsOverrides = [{ ab: 'kein-datum', satz: 1 }];
  assert.strictEqual(validiereExport(kaputtesDatum).ok, false);

  const kaputterSatz = gueltigeDatei();
  kaputterSatz.basiszinsOverrides = [{ ab: '2027-01-01', satz: 'x' }];
  assert.strictEqual(validiereExport(kaputterSatz).ok, false);
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

test('validiereExport: unmöglicher Monat wirft nicht, sondern liefert ok:false', () => {
  const datei = gueltigeDatei();
  datei.konten[0].buchungen[0].datum = '2024-13-01';
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
