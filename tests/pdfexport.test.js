const test = require('node:test');
const assert = require('node:assert');
const Pdfexport = require('../pdfexport.js');
const Druck = require('../druck.js');
const Engine = require('../engine.js');

function modellFixture() {
  const konto = {
    name: 'Mandant ./. Schuldner',
    aktenzeichen: '12 C 345/26',
    buchungen: [
      { id: 'hf1', typ: 'hauptforderung', datum: '2024-01-05', betrag: 1000, text: 'Rechnung', verzinsung: null },
      { id: 'z1', typ: 'zahlung', datum: '2024-03-01', betrag: 300, text: 'Zahlung', verzinsung: null },
    ],
  };
  return Druck.baueDruckmodell(konto, Engine.berechneKonto(konto, '2024-12-31'));
}

test('baueTabellenKonfig: 10 Spalten mit Breiten in Summe 100', () => {
  const k = Pdfexport.baueTabellenKonfig(modellFixture());
  assert.strictEqual(k.head.length, 10);
  assert.strictEqual(k.head[0], 'Datum');
  assert.strictEqual(k.head[9], 'Gesamtsaldo');
  assert.strictEqual(k.spaltenProzent.length, 10);
  assert.strictEqual(Engine.round2(k.spaltenProzent.reduce((s, p) => s + p, 0)), 100);
});

test('baueTabellenKonfig: Zeilen-Mapping mit Arten und Saldozeile', () => {
  const k = Pdfexport.baueTabellenKonfig(modellFixture());
  // 2 Buchungszeilen + Saldozeile
  assert.strictEqual(k.body.length, 3);
  assert.deepStrictEqual(k.arten, ['buchung', 'buchung', 'saldo']);
  assert.strictEqual(k.body[0][0], '05.01.2024');
  assert.strictEqual(k.body[0][3], '1.000,00 EUR'); // Spalte Hauptforderung
  assert.strictEqual(k.body[1][2], '300,00 EUR'); // Spalte Zahlung
  assert.strictEqual(k.body[1][8], '-300,00 EUR'); // Umsatz negativ
  assert.ok(k.body[2][0].startsWith('Saldo per'));
  assert.strictEqual(k.body[2][9], '700,00 EUR');
});

test('baueSeite2Konfig: drei Summenblöcke mit Gesamtzeilen', () => {
  const k = Pdfexport.baueSeite2Konfig(modellFixture());
  assert.deepStrictEqual(k.bloecke.map((b) => b.titel), ['Summen', 'Zahlungen', 'Salden']);
  const salden = k.bloecke[2];
  assert.deepStrictEqual(salden.zeilen[salden.zeilen.length - 1], ['Gesamtsaldo:', '700,00 EUR']);
  assert.ok(k.tageszins.includes('EUR ab dem'));
});
