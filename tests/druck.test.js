// tests/druck.test.js
const test = require('node:test');
const assert = require('node:assert');
const Druck = require('../druck.js');
const Engine = require('../engine.js');

test('formatBetragEUR: deutsches Format mit EUR-Suffix', () => {
  assert.strictEqual(Druck.formatBetragEUR(1215), '1.215,00 EUR');
  assert.strictEqual(Druck.formatBetragEUR(330.61), '330,61 EUR');
  assert.strictEqual(Druck.formatBetragEUR(-3.1), '-3,10 EUR');
});

test('formatZahl5/formatProzent5: fünf Nachkommastellen', () => {
  assert.strictEqual(Druck.formatZahl5(4.12), '4,12000');
  assert.strictEqual(Druck.formatProzent5(8.37), '8,37000%');
  assert.strictEqual(Druck.formatZahl5(0.2739726), '0,27397');
});

test('spalteFuerBuchung: alle Buchungstypen', () => {
  const vz = { art: 'fest', satz: 5, methode: 'kalender', beginn: '2024-01-01', ende: null };
  assert.strictEqual(Druck.spalteFuerBuchung({ typ: 'zahlung' }), 'zahlung');
  assert.strictEqual(Druck.spalteFuerBuchung({ typ: 'hauptforderung', verzinsung: vz }), 'hauptforderung');
  assert.strictEqual(Druck.spalteFuerBuchung({ typ: 'zinsforderung', verzinsung: null }), 'hfZinsen');
  assert.strictEqual(Druck.spalteFuerBuchung({ typ: 'nebenforderung', verzinsung: vz }), 'verzinslKosten');
  assert.strictEqual(Druck.spalteFuerBuchung({ typ: 'nebenforderung', verzinsung: null }), 'unverzinslKosten');
  assert.strictEqual(Druck.spalteFuerBuchung({ typ: 'nebenforderung', verzinsung: { art: 'keine' } }), 'unverzinslKosten');
});

test('verzinsungsZusatz: Basiszins-, Festzins- und Keine-Fälle', () => {
  assert.strictEqual(
    Druck.verzinsungsZusatz({ art: 'basiszins', satz: 5, methode: 'kalender', beginn: '2019-12-23', ende: null }, '2024-11-12'),
    'verzinst mit 5,00000 Prozentpunkten über dem Basiszinssatz gem. § 247 BGB ab dem 23.12.2019 bis zum 12.11.2024');
  assert.strictEqual(
    Druck.verzinsungsZusatz({ art: 'fest', satz: 4, methode: 'kalender', beginn: '2024-01-01', ende: '2024-06-30' }, '2024-11-12'),
    'verzinst mit 4,00000 % p. a. ab dem 01.01.2024 bis zum 30.06.2024');
  assert.strictEqual(Druck.verzinsungsZusatz(null, '2024-11-12'), null);
  assert.strictEqual(Druck.verzinsungsZusatz({ art: 'keine' }, '2024-11-12'), null);
});

function unverzinstesKonto() {
  return {
    name: 'Mandant ./. Schuldner',
    buchungen: [
      { id: 'hf1', typ: 'hauptforderung', datum: '2024-01-05', betrag: 1000, text: 'Rechnung 4711', verzinsung: null },
      { id: 'nf1', typ: 'nebenforderung', datum: '2024-02-01', betrag: 100, text: 'Mahnkosten', verzinsung: null },
      { id: 'z1', typ: 'zahlung', datum: '2024-03-01', betrag: 300, text: 'Zahlung Schuldner', verzinsung: null },
      { id: 'zf1', typ: 'zinsforderung', datum: '2024-04-01', betrag: 50, text: 'Titulierte Zinsen', verzinsung: null },
    ],
  };
}

test('baueDruckmodell: Buchungszeilen chronologisch mit laufendem Saldo', () => {
  const konto = unverzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);

  assert.strictEqual(m.kopf.kontoName, 'Mandant ./. Schuldner');
  assert.strictEqual(m.kopf.stichtag, '2024-12-31');

  assert.deepStrictEqual(m.zeilen.map((z) => [z.datum, z.spalte, z.betrag, z.gesamtsaldo]), [
    ['2024-01-05', 'hauptforderung', 1000, 1000],
    ['2024-02-01', 'unverzinslKosten', 100, 1100],
    ['2024-03-01', 'zahlung', 300, 800],
    ['2024-04-01', 'hfZinsen', 50, 850],
  ]);
  assert.ok(m.zeilen.every((z) => z.art === 'buchung'));
});

test('baueDruckmodell: Saldozeile mit Spaltensummen', () => {
  const konto = unverzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  assert.deepStrictEqual(m.saldozeile, {
    zahlung: 300, hauptforderung: 1000, hfZinsen: 50, verzinslKosten: 0,
    kostenzinsen: 0, unverzinslKosten: 100, umsatz: 850, gesamtsaldo: 850,
  });
  // Invariante: laufender Saldo endet beim Engine-Saldo
  assert.strictEqual(m.saldozeile.gesamtsaldo, ergebnis.summen.saldo);
});

test('baueDruckmodell: Buchungen nach Stichtag erscheinen nicht', () => {
  const konto = unverzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-02-15');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  assert.strictEqual(m.zeilen.length, 2);
  assert.strictEqual(m.saldozeile.gesamtsaldo, 1100);
});
