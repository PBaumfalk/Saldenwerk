const test = require('node:test');
const assert = require('node:assert');
const Basiszins = require('../basiszins.js');

test('satzAm findet gültigen Satz', () => {
  assert.strictEqual(Basiszins.satzAm('2024-03-15'), 3.62);
  assert.strictEqual(Basiszins.satzAm('2024-07-01'), 3.37);
  assert.strictEqual(Basiszins.satzAm('2024-06-30'), 3.62);
  assert.strictEqual(Basiszins.satzAm('2020-05-01'), -0.88);
});

test('satzAm vor Tabellenbeginn liefert null', () => {
  assert.strictEqual(Basiszins.satzAm('2001-12-31'), null);
});

test('Tabelle ist aufsteigend sortiert und beginnt 2002', () => {
  const t = Basiszins.TABELLE;
  assert.strictEqual(t[0].ab, '2002-01-01');
  for (let i = 1; i < t.length; i++) assert.ok(t[i].ab > t[i - 1].ab);
});

test('deckungsEnde leerer Tabelle ist null', () => {
  assert.strictEqual(Basiszins.deckungsEnde([]), null);
  assert.strictEqual(Basiszins.deckungsEnde(null), null);
});

test('deckungsEnde eines Januar-Eintrags ist der 30.06.', () => {
  assert.strictEqual(Basiszins.deckungsEnde([{ ab: '2026-01-01', satz: 1 }]), '2026-06-30');
});

test('deckungsEnde eines Juli-Eintrags ist der 31.12.', () => {
  assert.strictEqual(Basiszins.deckungsEnde([{ ab: '2026-07-01', satz: 1 }]), '2026-12-31');
});

test('deckungsEnde der eingebauten Tabelle ist der 31.12.2026', () => {
  assert.strictEqual(Basiszins.deckungsEnde(Basiszins.TABELLE), '2026-12-31');
});

test('deckungsEnde berücksichtigt Overrides', () => {
  const t = Basiszins.mitOverrides([{ ab: '2027-01-01', satz: 1.5 }]);
  assert.strictEqual(Basiszins.deckungsEnde(t), '2027-06-30');
});

test('mitOverrides ersetzt und ergänzt', () => {
  const t = Basiszins.mitOverrides([
    { ab: '2024-01-01', satz: 9.99 },
    { ab: '2099-07-01', satz: 1.0 },
  ]);
  assert.strictEqual(Basiszins.satzAm('2024-02-01', t), 9.99);
  assert.strictEqual(Basiszins.satzAm('2099-08-01', t), 1.0);
  assert.strictEqual(Basiszins.satzAm('2023-08-01', t), 3.12);
});
