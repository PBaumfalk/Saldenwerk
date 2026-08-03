const test = require('node:test');
const assert = require('node:assert');
const { formatEUR, parseBetrag, formatDatum, parseDatum, verrechnungsText } = require('../app.js');

test('formatEUR deutsches Format', () => {
  assert.strictEqual(formatEUR(1234.5), '1.234,50 €');
  assert.strictEqual(formatEUR(-3.1), '-3,10 €');
});
test('parseBetrag akzeptiert deutsche und technische Schreibweise', () => {
  assert.strictEqual(parseBetrag('1.234,56'), 1234.56);
  assert.strictEqual(parseBetrag('1234.56'), 1234.56);
  assert.strictEqual(parseBetrag('1234,56'), 1234.56);
  assert.strictEqual(parseBetrag('12'), 12);
  assert.strictEqual(parseBetrag('abc'), null);
  assert.strictEqual(parseBetrag(''), null);
});
test('verrechnungsText benennt die Tilgungsreihenfolge', () => {
  assert.strictEqual(verrechnungsText('497'), 'Verrechnung nach § 497 Abs. 3 BGB');
  assert.strictEqual(verrechnungsText('367'), 'Verrechnung nach § 367 BGB');
  assert.strictEqual(verrechnungsText(undefined), 'Verrechnung nach § 367 BGB');
});
test('Datum hin und zurück', () => {
  assert.strictEqual(formatDatum('2024-07-01'), '01.07.2024');
  assert.strictEqual(parseDatum('01.07.2024'), '2024-07-01');
  assert.strictEqual(parseDatum('2024-07-01'), '2024-07-01');
  assert.strictEqual(parseDatum('31.02.2024'), null);
});
