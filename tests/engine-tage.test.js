const test = require('node:test');
const assert = require('node:assert');
const Engine = require('../engine.js');

test('tageKalender zählt tatsächliche Tage', () => {
  assert.strictEqual(Engine.tageKalender('2024-01-01', '2024-01-31'), 30);
  assert.strictEqual(Engine.tageKalender('2023-12-31', '2024-12-31'), 366); // Schaltjahr
  assert.strictEqual(Engine.tageKalender('2024-02-28', '2024-03-01'), 2);
});

test('addTage über Monats-/Jahresgrenzen', () => {
  assert.strictEqual(Engine.addTage('2024-02-28', 1), '2024-02-29');
  assert.strictEqual(Engine.addTage('2024-01-01', -1), '2023-12-31');
});

test('tageBank360 nach 30E/360', () => {
  assert.strictEqual(Engine.tageBank360('2024-01-01', '2025-01-01'), 360);
  assert.strictEqual(Engine.tageBank360('2024-01-31', '2024-02-28'), 28); // 30 -> 28
  assert.strictEqual(Engine.tageBank360('2024-01-15', '2024-03-15'), 60);
});

test('jahresSegmente splittet am Jahresende', () => {
  const segs = Engine.jahresSegmente('2023-11-30', '2024-02-29');
  assert.deepStrictEqual(segs, [
    { von: '2023-11-30', bis: '2023-12-31', jahr: 2023, tage: 31 },
    { von: '2023-12-31', bis: '2024-02-29', jahr: 2024, tage: 60 },
  ]);
  assert.deepStrictEqual(Engine.jahresSegmente('2024-03-01', '2024-04-01'),
    [{ von: '2024-03-01', bis: '2024-04-01', jahr: 2024, tage: 31 }]);
});

test('round2 rundet kaufmännisch', () => {
  assert.strictEqual(Engine.round2(1.005), 1.01);
  assert.strictEqual(Engine.round2(2.674999), 2.67);
});
