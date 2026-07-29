// tests/druck.test.js
const test = require('node:test');
const assert = require('node:assert');
const Druck = require('../druck.js');

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
