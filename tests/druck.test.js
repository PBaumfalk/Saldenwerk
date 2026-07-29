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

function verzinstesKonto() {
  return {
    name: 'Verzinst',
    buchungen: [
      { id: 'hf1', typ: 'hauptforderung', datum: '2024-01-01', betrag: 1000, text: 'Rechnung 4711',
        verzinsung: { art: 'fest', satz: 10, methode: 'kalender', beginn: '2024-01-01', ende: null } },
      { id: 'nf1', typ: 'nebenforderung', datum: '2024-01-01', betrag: 100, text: 'Mahnkosten', verzinsung: null },
      { id: 'nf2', typ: 'nebenforderung', datum: '2024-01-01', betrag: 200, text: 'Gerichtskosten',
        verzinsung: { art: 'fest', satz: 5, methode: 'kalender', beginn: '2024-01-01', ende: null } },
      { id: 'z1', typ: 'zahlung', datum: '2024-07-01', betrag: 300, text: 'Zahlung Schuldner', verzinsung: null },
    ],
  };
}

test('baueDruckmodell: Sammelzeilen vor Zahlung und am Stichtag, getrennt nach HF-/Kostenzinsen', () => {
  const konto = verzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);

  const sammel = m.zeilen.filter((z) => z.art === 'sammel');
  assert.deepStrictEqual(sammel.map((z) => [z.datum, z.spalte, z.betrag]), [
    ['2024-06-30', 'hfZinsen', 49.73],
    ['2024-06-30', 'kostenzinsen', 4.97],
    ['2024-12-31', 'hfZinsen', 50.27],
  ]);
  assert.strictEqual(sammel[0].text, 'Aufgelaufene Zinsen vom 01.01.2024 bis zum 30.06.2024');
  assert.strictEqual(sammel[1].text, 'Aufgelaufene Kostenzinsen vom 01.01.2024 bis zum 30.06.2024');

  // Reihenfolge: Buchungen 01.01. → Sammelzeilen 30.06. → Zahlung 01.07. → Sammelzeile 31.12.
  assert.deepStrictEqual(
    m.zeilen.filter((z) => z.art !== 'detail').map((z) => [z.datum, z.spalte]), [
      ['2024-01-01', 'hauptforderung'], ['2024-01-01', 'unverzinslKosten'], ['2024-01-01', 'verzinslKosten'],
      ['2024-06-30', 'hfZinsen'], ['2024-06-30', 'kostenzinsen'],
      ['2024-07-01', 'zahlung'],
      ['2024-12-31', 'hfZinsen'],
    ]);
});

test('baueDruckmodell: Detailzeilen direkt nach ihrer Sammelzeile, Summe konsistent', () => {
  const konto = verzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);

  const idxSammel = m.zeilen.findIndex((z) => z.art === 'sammel');
  const detail = m.zeilen[idxSammel + 1];
  assert.strictEqual(detail.art, 'detail');
  assert.strictEqual(detail.datum, null);
  assert.strictEqual(detail.gesamtsaldo, null);
  assert.strictEqual(detail.spalte, 'hfZinsen');
  assert.strictEqual(detail.betrag, 49.73);
  assert.strictEqual(detail.text,
    'davon 10,00000% Zinsen aus 1.000,00 EUR ab dem 01.01.2024 bis zum 30.06.2024 (182 Zinstage) aus „Rechnung 4711"');

  // Invariante: je Sammelzeile ist die Summe ihrer Detailzeilen gleich dem Sammelbetrag
  const sammelIdx = m.zeilen.map((z, i) => (z.art === 'sammel' ? i : -1)).filter((i) => i >= 0);
  for (const i of sammelIdx) {
    let summe = 0;
    for (let j = i + 1; j < m.zeilen.length && m.zeilen[j].art === 'detail'; j++) summe += m.zeilen[j].betrag;
    assert.strictEqual(Engine.round2(summe), m.zeilen[i].betrag);
  }
});

test('baueDruckmodell: Saldozeile und Endsaldo mit Zinsen (Invariante gegen Engine)', () => {
  const konto = verzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  assert.strictEqual(m.saldozeile.gesamtsaldo, ergebnis.summen.saldo); // 1104.97
  assert.strictEqual(m.saldozeile.hfZinsen, 100.00);
  assert.strictEqual(m.saldozeile.kostenzinsen, 4.97);
});
