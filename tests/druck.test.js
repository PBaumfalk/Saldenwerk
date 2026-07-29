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
