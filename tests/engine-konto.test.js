const test = require('node:test');
const assert = require('node:assert');
const Engine = require('../engine.js');

const T = [{ ab: '2002-01-01', satz: 2.0 }]; // konstanter Basiszins für einfache Handrechnung

function hf(betrag, datum, verzinsung) {
  return { id: 'hf-' + datum, typ: 'hauptforderung', datum, betrag, text: 'HF', verzinsung };
}
const fest5 = (beginn, ende = null) => ({ art: 'fest', satz: 5, beginn, ende, methode: 'kalender' });

test('unverzinste Hauptforderung minus Zahlung', () => {
  const konto = { buchungen: [
    hf(1000, '2024-01-10', { art: 'keine' }),
    { id: 'z1', typ: 'zahlung', datum: '2024-02-10', betrag: 400, text: 'Zahlung' },
  ] };
  const r = Engine.berechneKonto(konto, '2024-03-01', T);
  assert.strictEqual(r.summen.hauptforderung.offen, 600);
  assert.strictEqual(r.summen.saldo, 600);
  assert.strictEqual(r.verrechnungen[0].aufHauptforderung, 400);
});

test('Zahlung tilgt Kosten, dann Zinsen, dann Hauptforderung (§ 367)', () => {
  const konto = { buchungen: [
    hf(1000, '2024-01-01', fest5('2024-01-01')),
    { id: 'nf', typ: 'nebenforderung', datum: '2024-01-01', betrag: 50, text: 'Kosten',
      verzinsung: { art: 'keine' } },
    { id: 'zf', typ: 'zinsforderung', datum: '2024-01-01', betrag: 20, text: 'Altzins' },
    { id: 'z1', typ: 'zahlung', datum: '2024-12-31', betrag: 200, text: 'Zahlung' },
  ] };
  const r = Engine.berechneKonto(konto, '2024-12-31', T);
  // Zinsen HF bis 30.12.2024: von exkl 2023-12-31 bis 2024-12-30 = 365 Tage / 366
  // 1000 * 5% * 365/366 = 49.86
  const v = r.verrechnungen[0];
  assert.strictEqual(v.aufKosten, 50);
  assert.strictEqual(v.aufZinsen, 69.86); // 20 (ZF) + 49.86 (laufende)
  assert.strictEqual(Engine.round2(v.aufHauptforderung), 80.14);
  assert.strictEqual(r.summen.hauptforderung.offen, 919.86);
  assert.strictEqual(r.summen.zinsforderung.offen, 0);
  assert.strictEqual(r.summen.nebenforderung.offen, 0);
});

test('nach Teiltilgung läuft Zins nur auf Restbetrag', () => {
  const konto = { buchungen: [
    hf(1000, '2024-01-01', fest5('2024-01-01')),
    { id: 'z1', typ: 'zahlung', datum: '2024-07-01', betrag: 524.93, text: 'Zahlung' },
  ] };
  const r = Engine.berechneKonto(konto, '2024-12-31', T);
  // Zinsen bis 30.06.: 182 Tage: 1000*5%*182/366 = 24.86 -> Zahlung: 24.86 Zins + 500.07 HF
  // Rest-HF 499.93; Zinsen 30.06.->31.12.: 184 Tage: 499.93*5%*184/366 = 12.57
  assert.strictEqual(r.summen.hauptforderung.offen, 499.93);
  assert.strictEqual(r.summen.laufendeZinsen.offen, 12.57);
});

test('Zinsende begrenzt den Zinslauf', () => {
  const konto = { buchungen: [ hf(1000, '2024-01-01', fest5('2024-01-01', '2024-01-31')) ] };
  const r = Engine.berechneKonto(konto, '2024-12-31', T);
  // 31 Tage: 1000*5%*31/366 = 4.23
  assert.strictEqual(r.summen.laufendeZinsen.offen, 4.23);
});

test('Basiszins-Forderung nutzt Tabelle', () => {
  const konto = { buchungen: [
    hf(1000, '2024-01-01', { art: 'basiszins', satz: 5, beginn: '2024-01-01', ende: null, methode: 'kalender' }),
  ] };
  const r = Engine.berechneKonto(konto, '2024-12-31', T);
  // konstant 2+5=7 %: 366/366 Tage -> 70.00
  assert.strictEqual(r.summen.laufendeZinsen.offen, 70.0);
  assert.ok(r.staffel.every((s) => s.satzProzent === 7));
});

test('Überzahlung wird ausgewiesen', () => {
  const konto = { buchungen: [
    hf(100, '2024-01-01', { art: 'keine' }),
    { id: 'z1', typ: 'zahlung', datum: '2024-02-01', betrag: 150, text: 'Zahlung' },
  ] };
  const r = Engine.berechneKonto(konto, '2024-03-01', T);
  assert.strictEqual(r.summen.ueberzahlung, 50);
  assert.strictEqual(r.summen.saldo, -50);
  assert.ok(r.warnungen.some((w) => w.toLowerCase().includes('überzahlung')));
});

test('Buchungen nach Stichtag werden ignoriert', () => {
  const konto = { buchungen: [
    hf(100, '2024-01-01', { art: 'keine' }),
    hf(999, '2025-01-01', { art: 'keine' }),
  ] };
  const r = Engine.berechneKonto(konto, '2024-06-01', T);
  assert.strictEqual(r.summen.hauptforderung.gesamt, 100);
  assert.strictEqual(r.ignorierteBuchungen, 1);
});
