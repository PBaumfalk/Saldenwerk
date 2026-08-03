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

test('baueDruckmodell: übernimmt Engine-Warnungen ins Modell', () => {
  const T = [{ ab: '2024-01-01', satz: 3.62 }];
  const konto = {
    name: 'K',
    buchungen: [{ id: 'hf1', typ: 'hauptforderung', datum: '2024-01-05', betrag: 1000, text: 'HF',
      verzinsung: { art: 'basiszins', satz: 5, methode: 'kalender', beginn: '2024-01-06', ende: null } }],
  };
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31', T);
  const m = Druck.baueDruckmodell(konto, ergebnis, T);
  assert.ok(m.warnungen.some((w) => w.includes('kein Basiszinssatz hinterlegt')));
});

test('baueDruckmodell: ergänzt Hinweis auf ignorierte Buchungen', () => {
  const konto = unverzinstesKonto();
  konto.buchungen.push({ id: 'sp1', typ: 'hauptforderung', datum: '2025-06-01', betrag: 10, text: 'spät', verzinsung: null });
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  assert.ok(m.warnungen.some((w) => w.includes('1 Buchung(en) nach dem Stichtag')));
});

test('baueDruckmodell: ohne Auffälligkeiten keine Warnungen', () => {
  const konto = unverzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  assert.deepStrictEqual(m.warnungen, []);
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

test('tageszins: fester Zinssatz, offener Rest, Folgetag im Normaljahr', () => {
  const konto = verzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  // Nur HF offen und verzinst: 1000 × 10 % / 365 (2025 ist kein Schaltjahr)
  assert.strictEqual(m.tageszins.ab, '2025-01-01');
  assert.ok(Math.abs(m.tageszins.betragProTag - 1000 * 0.10 / 365) < 1e-9);
});

test('tageszins: Basiszins-Verzinsung nutzt Tabelle am Folgetag', () => {
  const konto = {
    name: 'Basiszins',
    buchungen: [{ id: 'hf1', typ: 'hauptforderung', datum: '2024-01-01', betrag: 1000, text: 'HF',
      verzinsung: { art: 'basiszins', satz: 5, methode: 'kalender', beginn: '2024-01-01', ende: null } }],
  };
  const ergebnis = Engine.berechneKonto(konto, '2024-06-30');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  // Folgetag 01.07.2024: Basiszins 3,37 + 5 = 8,37 %; 2024 ist Schaltjahr → 366
  assert.ok(Math.abs(m.tageszins.betragProTag - 1000 * 0.0837 / 366) < 1e-9);
});

test('tageszins: 0 bei getilgtem Rest, Verzinsungsende vor Folgetag und unverzinsten Posten', () => {
  const konto = {
    name: 'Null',
    buchungen: [
      { id: 'hf1', typ: 'hauptforderung', datum: '2024-01-01', betrag: 500, text: 'HF beendet',
        verzinsung: { art: 'fest', satz: 10, methode: 'kalender', beginn: '2024-01-01', ende: '2024-06-30' } },
      { id: 'nf1', typ: 'nebenforderung', datum: '2024-01-01', betrag: 100, text: 'Unverzinst', verzinsung: null },
    ],
  };
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  assert.strictEqual(m.tageszins.betragProTag, 0);
});

test('seite2: Summen, Zahlungen und Salden je Kategorie', () => {
  const konto = verzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);

  assert.deepStrictEqual(m.seite2.summen, {
    hauptforderungen: 1000, zinsenAufHauptforderungen: 100.00, verzinslicheKosten: 200,
    kostenzinsen: 4.97, unverzinslicheKosten: 100, gesamt: 1404.97,
  });
  assert.deepStrictEqual(m.seite2.zahlungen, {
    hauptforderungen: 0, zinsenAufHauptforderungen: 0, verzinslicheKosten: 200,
    kostenzinsen: 0, unverzinslicheKosten: 100, ueberschuss: 0, gesamt: 300,
  });
  assert.deepStrictEqual(m.seite2.salden, {
    hauptforderungen: 1000, zinsenAufHauptforderungen: 100.00, verzinslicheKosten: 0,
    kostenzinsen: 4.97, unverzinslicheKosten: 0, ueberzahlung: 0, gesamt: 1104.97,
  });
});

test('seite2: Invarianten — Summen − Salden = Zahlungen, Salden-Gesamt = Engine-Saldo', () => {
  const konto = verzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  for (const k of ['hauptforderungen', 'zinsenAufHauptforderungen', 'verzinslicheKosten', 'kostenzinsen', 'unverzinslicheKosten']) {
    assert.strictEqual(Engine.round2(m.seite2.summen[k] - m.seite2.salden[k]), m.seite2.zahlungen[k], k);
  }
  assert.strictEqual(m.seite2.salden.gesamt, ergebnis.summen.saldo);
});

test('seite2: Überzahlung erscheint in Zahlungen und Salden', () => {
  const konto = {
    name: 'Überzahlt',
    buchungen: [
      { id: 'hf1', typ: 'hauptforderung', datum: '2024-01-01', betrag: 100, text: 'HF', verzinsung: null },
      { id: 'z1', typ: 'zahlung', datum: '2024-02-01', betrag: 150, text: 'Zahlung', verzinsung: null },
    ],
  };
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  assert.strictEqual(m.seite2.zahlungen.ueberschuss, 50);
  assert.strictEqual(m.seite2.zahlungen.gesamt, 150);
  assert.strictEqual(m.seite2.salden.ueberzahlung, 50);
  assert.strictEqual(m.seite2.salden.gesamt, -50);
});

test('seite2: Zinsforderung wird in zinsenAufHauptforderungen kategorisiert', () => {
  const konto = {
    name: 'Mit Zinsforderung',
    buchungen: [
      { id: 'hf1', typ: 'hauptforderung', datum: '2024-01-01', betrag: 1000, text: 'Hauptforderung', verzinsung: null },
      { id: 'zf1', typ: 'zinsforderung', datum: '2024-06-01', betrag: 50, text: 'Titulierte Zinsen', verzinsung: null },
    ],
  };
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);

  // Zinsforderung soll in zinsenAufHauptforderungen landen, nicht in hauptforderungen
  assert.strictEqual(m.seite2.summen.hauptforderungen, 1000);
  assert.strictEqual(m.seite2.summen.zinsenAufHauptforderungen, 50);
  assert.strictEqual(m.seite2.salden.hauptforderungen, 1000);
  assert.strictEqual(m.seite2.salden.zinsenAufHauptforderungen, 50);
});

test('chart: Punkte monoton nach Datum, letzter Punkt = Saldo am Stichtag', () => {
  const konto = verzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);

  for (let i = 1; i < m.chart.length; i++) assert.ok(m.chart[i - 1].datum < m.chart[i].datum);
  const letzter = m.chart[m.chart.length - 1];
  assert.strictEqual(letzter.datum, '2024-12-31');
  assert.strictEqual(letzter.saldo, ergebnis.summen.saldo);
  assert.deepStrictEqual(m.chart[0], { datum: '2024-01-01', saldo: 1300 });
});

test('chart: Zahlung senkt den Saldo', () => {
  const konto = unverzinstesKonto();
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  const punkt = m.chart.find((p) => p.datum === '2024-03-01');
  assert.strictEqual(punkt.saldo, 800);
});

test('chart: leeres Konto liefert leere Punktliste', () => {
  const konto = { name: 'Leer', buchungen: [] };
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);
  assert.deepStrictEqual(m.chart, []);
});

test('baueDruckmodell: zwei Zahlungen an verschiedenen Daten ergeben drei Sammelzeilen-Phasen', () => {
  const konto = {
    name: 'Zwei Zahlungen',
    buchungen: [
      { id: 'hf1', typ: 'hauptforderung', datum: '2024-01-01', betrag: 1000, text: 'HF',
        verzinsung: { art: 'fest', satz: 10, methode: 'kalender', beginn: '2024-01-01', ende: null } },
      { id: 'z1', typ: 'zahlung', datum: '2024-04-01', betrag: 200, text: 'Zahlung 1', verzinsung: null },
      { id: 'z2', typ: 'zahlung', datum: '2024-08-01', betrag: 300, text: 'Zahlung 2', verzinsung: null },
    ],
  };
  const ergebnis = Engine.berechneKonto(konto, '2024-12-31');
  const m = Druck.baueDruckmodell(konto, ergebnis);

  // (1) Drei Sammelzeilen-Phasen: je vor einer Zahlung und am Stichtag
  const sammel = m.zeilen.filter((z) => z.art === 'sammel');
  assert.deepStrictEqual(sammel.map((z) => z.datum), ['2024-03-31', '2024-07-31', '2024-12-31']);

  // (2) Jede Sammelzeile ist die round2-Summe ihrer Detailzeilen
  const sammelIdx = m.zeilen.map((z, i) => (z.art === 'sammel' ? i : -1)).filter((i) => i >= 0);
  for (const i of sammelIdx) {
    let summe = 0;
    for (let j = i + 1; j < m.zeilen.length && m.zeilen[j].art === 'detail'; j++) summe += m.zeilen[j].betrag;
    assert.strictEqual(Engine.round2(summe), m.zeilen[i].betrag);
  }

  // (3) Invariante: laufender Gesamtsaldo endet beim Engine-Saldo
  assert.strictEqual(m.saldozeile.gesamtsaldo, ergebnis.summen.saldo);

  // (4) Zeilenreihenfolge: Sammelzeile jeweils vor ihrer Zahlungszeile
  const zahlungIdx1 = m.zeilen.findIndex((z) => z.spalte === 'zahlung' && z.datum === '2024-04-01');
  const zahlungIdx2 = m.zeilen.findIndex((z) => z.spalte === 'zahlung' && z.datum === '2024-08-01');
  assert.ok(sammelIdx[0] < zahlungIdx1);
  assert.ok(sammelIdx[1] < zahlungIdx2);
});
