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

function konto497Fixture() {
  return { tilgungsreihenfolge: '497', buchungen: [
    hf(1000, '2024-01-01', fest5('2024-01-01')),
    { id: 'nf', typ: 'nebenforderung', datum: '2024-01-01', betrag: 50, text: 'Kosten',
      verzinsung: { art: 'keine' } },
    { id: 'zf', typ: 'zinsforderung', datum: '2024-01-01', betrag: 20, text: 'Altzins' },
    { id: 'z1', typ: 'zahlung', datum: '2024-12-31', betrag: 200, text: 'Zahlung' },
  ] };
}

test('Zahlung tilgt Kosten, dann Hauptforderung, zuletzt Zinsen (§ 497 Abs. 3)', () => {
  const r = Engine.berechneKonto(konto497Fixture(), '2024-12-31', T);
  const v = r.verrechnungen[0];
  assert.strictEqual(v.aufKosten, 50);
  assert.strictEqual(v.aufHauptforderung, 150);
  assert.strictEqual(v.aufZinsen, 0);
  assert.strictEqual(r.summen.hauptforderung.offen, 850);
  assert.strictEqual(r.summen.zinsforderung.offen, 20);
  // 49.86 bis zum Zahlungsvortag + 0.12 am Stichtag auf Rest-HF 850
  assert.strictEqual(r.summen.laufendeZinsen.offen, 49.98);
});

test('ohne Angabe und mit expliziter 367 identische Verrechnung (Default)', () => {
  const ohneFeld = konto497Fixture();
  delete ohneFeld.tilgungsreihenfolge;
  const explizit367 = { ...konto497Fixture(), tilgungsreihenfolge: '367' };
  const r1 = Engine.berechneKonto(ohneFeld, '2024-12-31', T);
  const r2 = Engine.berechneKonto(explizit367, '2024-12-31', T);
  assert.deepStrictEqual(r1.verrechnungen, r2.verrechnungen);
  assert.strictEqual(r1.verrechnungen[0].aufKosten, 50);
  assert.strictEqual(r1.verrechnungen[0].aufZinsen, 69.86);
});

test('§ 497: Rest nach Kosten und Hauptforderung geht auf Zinsen', () => {
  const konto = konto497Fixture();
  konto.buchungen[3].betrag = 1100;
  const r = Engine.berechneKonto(konto, '2024-12-31', T);
  const v = r.verrechnungen[0];
  assert.strictEqual(v.aufKosten, 50);
  assert.strictEqual(v.aufHauptforderung, 1000);
  assert.strictEqual(v.aufZinsen, 50); // 20 Zinsforderung + 30 laufende Zinsen
  assert.strictEqual(r.summen.zinsforderung.offen, 0);
  assert.strictEqual(r.summen.laufendeZinsen.offen, 19.86);
  assert.strictEqual(r.summen.ueberzahlung, 0);
});

test('verrechnungen enthalten Verteilung je Forderung (§ 367)', () => {
  const konto = { buchungen: [
    hf(1000, '2024-01-01', { art: 'keine' }),
    { id: 'hf2', typ: 'hauptforderung', datum: '2024-02-01', betrag: 500, text: 'HF2',
      verzinsung: { art: 'keine' } },
    { id: 'nf', typ: 'nebenforderung', datum: '2024-01-01', betrag: 50, text: 'Kosten',
      verzinsung: { art: 'keine' } },
    { id: 'z1', typ: 'zahlung', datum: '2024-06-01', betrag: 1200, text: 'Zahlung' },
  ] };
  const r = Engine.berechneKonto(konto, '2024-12-31', T);
  // 1200 → 50 Kosten, 1000 auf HF1 (ältere zuerst), 150 auf HF2
  assert.deepStrictEqual(r.verrechnungen[0].verteilung, [
    { forderungId: 'nf', betrag: 50, feld: 'rest' },
    { forderungId: 'hf-2024-01-01', betrag: 1000, feld: 'rest' },
    { forderungId: 'hf2', betrag: 150, feld: 'rest' },
  ]);
});

test('verteilung bildet § 497-Reihenfolge ab (Hauptforderung vor Zinsen)', () => {
  const r = Engine.berechneKonto(konto497Fixture(), '2024-12-31', T);
  const verteilung = r.verrechnungen[0].verteilung;
  assert.deepStrictEqual(verteilung.map((v) => [v.forderungId, v.betrag]), [
    ['nf', 50], ['hf-2024-01-01', 150],
  ]);
});

test('verteilung erfasst Zahlungen auf laufende Zinsen mit feld zinsOffen', () => {
  const konto = { buchungen: [
    hf(1000, '2024-01-01', fest5('2024-01-01')),
    { id: 'z1', typ: 'zahlung', datum: '2024-07-01', betrag: 524.93, text: 'Zahlung' },
  ] };
  const r = Engine.berechneKonto(konto, '2024-12-31', T);
  // 24,86 Zinsen + 500,07 HF (siehe Test „nach Teiltilgung")
  assert.deepStrictEqual(r.verrechnungen[0].verteilung, [
    { forderungId: 'hf-2024-01-01', betrag: 24.86, feld: 'zinsOffen' },
    { forderungId: 'hf-2024-01-01', betrag: 500.07, feld: 'rest' },
  ]);
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

test('Zahlung vor der ersten Forderung erzeugt Warnung', () => {
  const konto = { buchungen: [
    { id: 'z1', typ: 'zahlung', datum: '2024-01-01', betrag: 500, text: 'Zahlung' },
    hf(1000, '2024-06-01', { art: 'keine' }),
  ] };
  const r = Engine.berechneKonto(konto, '2024-12-31', T);
  assert.strictEqual(r.summen.hauptforderung.offen, 500);
  assert.ok(r.warnungen.some((w) => w.includes('vor der ersten Forderung')));
});

test('Zahlung nach der Forderung erzeugt keine Warnung zu früher Zahlung', () => {
  const konto = { buchungen: [
    hf(1000, '2024-01-01', { art: 'keine' }),
    { id: 'z1', typ: 'zahlung', datum: '2024-06-01', betrag: 500, text: 'Zahlung' },
  ] };
  const r = Engine.berechneKonto(konto, '2024-12-31', T);
  assert.ok(!r.warnungen.some((w) => w.includes('vor der ersten Forderung')));
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
