const test = require('node:test');
const assert = require('node:assert');
const { formatEUR, parseBetrag, formatDatum, parseDatum, verrechnungsText, backupErinnerungFaellig } = require('../app.js');

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
test('parseBetrag erkennt Tausenderpunkte auch ohne Komma', () => {
  assert.strictEqual(parseBetrag('1.000'), 1000);
  assert.strictEqual(parseBetrag('10.000'), 10000);
  assert.strictEqual(parseBetrag('1.234.567'), 1234567);
  assert.strictEqual(parseBetrag('2.750'), 2750);
  assert.strictEqual(parseBetrag('1.000,50'), 1000.5);
  assert.strictEqual(parseBetrag('-1.000'), -1000);
});
test('parseBetrag lässt technische Dezimalpunkte unangetastet', () => {
  assert.strictEqual(parseBetrag('1234.56'), 1234.56);
  assert.strictEqual(parseBetrag('1.23'), 1.23);
  assert.strictEqual(parseBetrag('0.5'), 0.5);
});
test('verrechnungsText benennt die Tilgungsreihenfolge', () => {
  assert.strictEqual(verrechnungsText('497'), 'Verrechnung nach § 497 Abs. 3 BGB');
  assert.strictEqual(verrechnungsText('367'), 'Verrechnung nach § 367 BGB');
  assert.strictEqual(verrechnungsText(undefined), 'Verrechnung nach § 367 BGB');
});
test('backupErinnerungFaellig: frisch gesichert ohne Änderungen ist nicht fällig', () => {
  assert.strictEqual(backupErinnerungFaellig(
    { letzterExport: '2026-08-01', aenderungenSeitExport: 0 }, '2026-08-03'), false);
});
test('backupErinnerungFaellig: Export älter als 14 Tage mit Änderungen ist fällig', () => {
  assert.strictEqual(backupErinnerungFaellig(
    { letzterExport: '2026-07-19', aenderungenSeitExport: 1 }, '2026-08-03'), true);
  assert.strictEqual(backupErinnerungFaellig(
    { letzterExport: '2026-07-20', aenderungenSeitExport: 1 }, '2026-08-03'), false);
});
test('backupErinnerungFaellig: mehr als 50 Speicherungen sind fällig', () => {
  assert.strictEqual(backupErinnerungFaellig(
    { letzterExport: '2026-08-02', aenderungenSeitExport: 51 }, '2026-08-03'), true);
});
test('backupErinnerungFaellig: ohne Änderungen nie fällig', () => {
  assert.strictEqual(backupErinnerungFaellig(
    { letzterExport: '2025-01-01', aenderungenSeitExport: 0 }, '2026-08-03'), false);
});
test('backupErinnerungFaellig: ohne Metadaten fällig sobald Änderungen existieren', () => {
  assert.strictEqual(backupErinnerungFaellig(null, '2026-08-03'), false);
  assert.strictEqual(backupErinnerungFaellig({ aenderungenSeitExport: 3 }, '2026-08-03'), true);
});
test('Datum hin und zurück', () => {
  assert.strictEqual(formatDatum('2024-07-01'), '01.07.2024');
  assert.strictEqual(parseDatum('01.07.2024'), '2024-07-01');
  assert.strictEqual(parseDatum('2024-07-01'), '2024-07-01');
  assert.strictEqual(parseDatum('31.02.2024'), null);
});
