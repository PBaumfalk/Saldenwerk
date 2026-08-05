const test = require('node:test');
const assert = require('node:assert');
const Tenor = require('../tenor.js');
const Engine = require('../engine.js');

const T = [{ ab: '2002-01-01', satz: 2.0 }];

function konto(buchungen, extra) {
  return { name: 'K', glaeubiger: 'Müller GmbH', schuldner: 'Max Meier', buchungen, ...extra };
}
const hf = (betrag, datum, verzinsung, id) => ({
  id: id || 'hf-' + datum, typ: 'hauptforderung', datum, betrag, text: 'Rechnung', verzinsung,
});
const zahlung = (betrag, datum, id) => ({
  id: id || 'z-' + datum, typ: 'zahlung', datum, betrag, text: 'Zahlung', verzinsung: null,
});

function text(k, stichtag) {
  return Tenor.tenorText(k, Engine.berechneKonto(k, stichtag || '2026-08-05', T));
}

test('tenorText: unverzinste Hauptforderung mit Parteien', () => {
  const t = text(konto([hf(1000, '2024-01-15', { art: 'keine' })]));
  assert.ok(t.startsWith('Es wird beantragt, die Schuldnerseite Max Meier zu verurteilen, an die Gläubigerseite Müller GmbH zu zahlen:'));
  assert.ok(t.includes('1. 1.000,00 €'));
  assert.ok(!t.includes('nebst Zinsen'));
  assert.ok(t.includes('Verrechnung nach § 367 BGB'));
});

test('tenorText: Basiszins-Klausel mit kompaktem Satz', () => {
  const t = text(konto([hf(1000, '2024-01-15',
    { art: 'basiszins', satz: 5, beginn: '2024-01-16', ende: null, methode: 'kalender' })]));
  assert.ok(t.includes('nebst Zinsen in Höhe von 5 Prozentpunkten über dem jeweiligen Basiszinssatz seit dem 16.01.2024'));
  assert.ok(!t.includes('5,00000'));
});

test('tenorText: Festzins-Klausel', () => {
  const t = text(konto([hf(1000, '2024-01-15',
    { art: 'fest', satz: 4.5, beginn: '2024-02-01', ende: null, methode: 'kalender' })]));
  assert.ok(t.includes('nebst Zinsen in Höhe von 4,5 % p. a. seit dem 01.02.2024'));
});

test('tenorText: Zinsende in der Vergangenheit ergibt vom/bis', () => {
  const t = text(konto([hf(1000, '2024-01-15',
    { art: 'fest', satz: 4, beginn: '2024-02-01', ende: '2024-06-30', methode: 'kalender' })]));
  assert.ok(t.includes('vom 01.02.2024 bis zum 30.06.2024'));
  assert.ok(!t.includes('seit dem 01.02.2024'));
});

test('tenorText: Teilzahlung als Abzugsklausel', () => {
  const t = text(konto([
    hf(1000, '2024-01-15', { art: 'keine' }),
    zahlung(300, '2024-03-01'),
  ]));
  assert.ok(t.includes('1. 1.000,00 €'));
  assert.ok(t.includes('abzüglich am 01.03.2024 gezahlter 300,00 €'));
});

test('tenorText: zwei Teilzahlungen mit sowie', () => {
  const t = text(konto([
    hf(1000, '2024-01-15', { art: 'keine' }),
    zahlung(300, '2024-03-01'),
    zahlung(200, '2024-04-01'),
  ]));
  assert.ok(t.includes('abzüglich am 01.03.2024 gezahlter 300,00 € sowie am 01.04.2024 gezahlter 200,00 €'));
});

test('tenorText: mehrere Forderungen werden nummeriert, getilgte entfallen', () => {
  const t = text(konto([
    hf(1000, '2024-01-15', { art: 'keine' }, 'hf1'),
    hf(500, '2024-02-15', { art: 'keine' }, 'hf2'),
    { id: 'nf', typ: 'nebenforderung', datum: '2024-03-01', betrag: 167.67,
      text: '1,3 Geschäftsgebühr Nr. 2300 VV RVG', verzinsung: null },
    zahlung(1000, '2024-04-01'),
  ]));
  // Zahlung tilgt Kosten (167,67) und HF1 teilweise (832,33) → HF1 offen, HF2 offen, NF getilgt
  assert.ok(t.includes('1. 1.000,00 €'));
  assert.ok(t.includes('2. 500,00 €'));
  assert.ok(!t.includes('Geschäftsgebühr'));
});

test('tenorText: Nebenforderung als vorgerichtliche Kosten, Zinsforderung als ausgerechnete Zinsen', () => {
  const t = text(konto([
    hf(1000, '2024-01-15', { art: 'keine' }),
    { id: 'nf', typ: 'nebenforderung', datum: '2024-03-01', betrag: 167.67,
      text: '1,3 Geschäftsgebühr Nr. 2300 VV RVG', verzinsung: null },
    { id: 'zf', typ: 'zinsforderung', datum: '2024-03-01', betrag: 55.5,
      text: 'Zinsstaffel Titel', verzinsung: null },
  ]));
  assert.ok(t.includes('vorgerichtliche Kosten in Höhe von 167,67 € (1,3 Geschäftsgebühr Nr. 2300 VV RVG)'));
  assert.ok(t.includes('ausgerechnete Zinsen in Höhe von 55,50 €'));
});

test('tenorText: ohne offene Forderungen null', () => {
  assert.strictEqual(text(konto([
    hf(1000, '2024-01-15', { art: 'keine' }),
    zahlung(1000, '2024-03-01'),
  ])), null);
  assert.strictEqual(text(konto([])), null);
});

test('tenorText: § 497-Konto weist Reihenfolge aus und verteilt korrekt', () => {
  const t = text(konto([
    hf(1000, '2024-01-15', { art: 'fest', satz: 5, beginn: '2024-01-16', ende: null, methode: 'kalender' }),
    zahlung(300, '2024-06-01'),
  ], { tilgungsreihenfolge: '497' }));
  assert.ok(t.includes('§ 497 Abs. 3 BGB'));
  // Bei § 497 geht die Zahlung voll auf die Hauptforderung (keine Zinsen-Tilgung zuerst)
  assert.ok(t.includes('abzüglich am 01.06.2024 gezahlter 300,00 €'));
});

test('tenorText: neutraler Kopf ohne Parteien', () => {
  const k = konto([hf(100, '2024-01-15', { art: 'keine' })]);
  delete k.glaeubiger;
  delete k.schuldner;
  const t = text(k);
  assert.ok(t.startsWith('Es wird beantragt, die Schuldnerseite zu verurteilen, an die Gläubigerseite zu zahlen:'));
});
