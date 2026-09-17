const test = require('node:test');
const assert = require('node:assert');
const Engine = require('../engine.js');

const T = [
  { ab: '2023-07-01', satz: 3.12 }, { ab: '2024-01-01', satz: 3.62 },
  { ab: '2024-07-01', satz: 3.37 },
];

test('fester Zins, kalender, innerhalb eines Jahres', () => {
  // 1000 EUR, 5 %, 01.03.2023 (inkl.) bis 31.03.2023 => von exkl. = 2023-02-28, 31 Tage
  const r = Engine.zinsSegmente({ basis: 1000, von: '2023-02-28', bis: '2023-03-31',
    art: 'fest', satz: 5, methode: 'kalender' });
  assert.strictEqual(r.segmente.length, 1);
  assert.strictEqual(r.segmente[0].tage, 31);
  assert.strictEqual(r.segmente[0].nenner, 365);
  assert.strictEqual(r.summe, 4.25); // 1000*0.05*31/365 = 4.2466 -> 4.25
});

test('fester Zins über Jahresgrenze splittet 365/366', () => {
  const r = Engine.zinsSegmente({ basis: 10000, von: '2023-12-01', bis: '2024-01-31',
    art: 'fest', satz: 4, methode: 'kalender' });
  assert.strictEqual(r.segmente.length, 2);
  assert.deepStrictEqual([r.segmente[0].tage, r.segmente[0].nenner], [30, 365]);
  assert.deepStrictEqual([r.segmente[1].tage, r.segmente[1].nenner], [31, 366]);
  // 10000*0.04*30/365=32.88 ; 10000*0.04*31/366=33.88 -> 66.76
  assert.strictEqual(r.summe, 66.76);
});

test('bank360 rechnet mit Nenner 360 ohne Jahres-Split', () => {
  const r = Engine.zinsSegmente({ basis: 9000, von: '2023-12-01', bis: '2024-01-31',
    art: 'fest', satz: 4, methode: 'bank360' });
  assert.strictEqual(r.segmente.length, 1);
  assert.strictEqual(r.segmente[0].nenner, 360);
  assert.strictEqual(r.segmente[0].tage, 59); // 30E/360: Dez (excl. 1.) 29 + Jan 30
  assert.strictEqual(r.summe, 59.0); // 9000*0.04*59/360
});

test('basiszins splittet am Halbjahreswechsel', () => {
  // 5 PP über Basiszins, 01.06.2024 (inkl.) bis 31.07.2024 => von exkl. 2024-05-31
  const r = Engine.zinsSegmente({ basis: 1000, von: '2024-05-31', bis: '2024-07-31',
    art: 'basiszins', satz: 5, methode: 'kalender', tabelle: T });
  assert.strictEqual(r.segmente.length, 2);
  assert.strictEqual(r.segmente[0].satzProzent, 8.62); // 3.62 + 5
  assert.strictEqual(r.segmente[0].tage, 30);
  assert.strictEqual(r.segmente[1].satzProzent, 8.37); // 3.37 + 5
  assert.strictEqual(r.segmente[1].tage, 31);
  assert.strictEqual(r.warnungen.length, 0);
});

test('basiszins vor Tabellenbeginn warnt und rechnet 0', () => {
  const r = Engine.zinsSegmente({ basis: 1000, von: '2023-01-31', bis: '2023-08-31',
    art: 'basiszins', satz: 5, methode: 'kalender', tabelle: T });
  assert.ok(r.warnungen.length >= 1);
  assert.strictEqual(r.segmente[0].satzProzent, null);
  assert.strictEqual(r.segmente[0].zins, 0);
});

test('basiszins nach letztem Eintrag nutzt letzten Satz und warnt', () => {
  const r = Engine.zinsSegmente({ basis: 1000, von: '2025-01-31', bis: '2025-03-31',
    art: 'basiszins', satz: 5, methode: 'kalender', tabelle: T });
  assert.strictEqual(r.segmente[0].satzProzent, 8.37);
  assert.ok(r.warnungen.some((w) => w.includes('letzte')));
});

test('negativer Basiszins ergibt Satz unter Aufschlag', () => {
  const r = Engine.zinsSegmente({ basis: 1000, von: '2020-01-31', bis: '2020-02-29',
    art: 'basiszins', satz: 5, methode: 'kalender',
    tabelle: [{ ab: '2020-01-01', satz: -0.88 }] });
  assert.strictEqual(r.segmente[0].satzProzent, 4.12);
});

// ── Bank 30/360 an Monatsenden ────────────────────────────────────────────
//
// tageBank360 ist korrektes 30E/360 und zählt "Start inklusiv, Ende exklusiv".
// Die Engine erzwingt ihre Konvention "inklusiv/inklusiv" aber, indem sie den
// START um einen Tag zurückschiebt (engine.js: abgerechnetBis = beginn - 1)
// statt das ENDE vorzuschieben. Wegen der Kappung min(tag, 30) ist diese
// Verschiebung an Monatsenden nicht verlustfrei — dort fehlen Zinstage.
//
// Bei gewöhnlichen Daten (Tag 1 bis 30) sind beide Wege identisch; die
// Korrektur ändert also nur Konten, deren Verzinsungsbeginn oder Stichtag auf
// einen Monatsletzten fällt.

test('bank360: Verzinsungsbeginn am 31. eines Monats verliert keinen Tag', () => {
  // Verzinsung ab 31.01.2025 (inkl.) bis 30.06.2026 (inkl.) => von exkl. 30.01.2025.
  // 30E/360: 31.01.2025 bis 01.07.2026 = 511 Tage.
  const r = Engine.zinsSegmente({ basis: 250000, von: '2025-01-30', bis: '2026-06-30',
    art: 'fest', satz: 9.2, methode: 'bank360' });
  assert.strictEqual(r.segmente.length, 1);
  assert.strictEqual(r.segmente[0].tage, 511);
  assert.strictEqual(r.summe, 32647.22); // 250000*0.092*511/360
});

test('bank360: Stichtag am 28.02. zählt den Februar voll', () => {
  // Verzinsung ab 01.01.2026 (inkl.) bis 28.02.2026 (inkl.) => von exkl. 31.12.2025.
  // "Jeder Monat zu 30 Tagen": Januar 30 + Februar 30 = 60.
  const r = Engine.zinsSegmente({ basis: 100000, von: '2025-12-31', bis: '2026-02-28',
    art: 'fest', satz: 5, methode: 'bank360' });
  assert.strictEqual(r.segmente[0].tage, 60);
  assert.strictEqual(r.summe, 833.33); // 100000*0.05*60/360
});

test('bank360: gewöhnliche Daten bleiben unverändert', () => {
  // Der wichtigste Test der Gruppe: Die Korrektur darf die Beträge in Konten
  // ohne Monatsende-Daten NICHT verschieben.
  const r = Engine.zinsSegmente({ basis: 10000, von: '2025-03-14', bis: '2025-09-15',
    art: 'fest', satz: 6, methode: 'bank360' });
  assert.strictEqual(r.segmente[0].tage, 181); // 6 Monate zu 30 plus 1 Tag
  assert.strictEqual(r.summe, 301.67);
});

test('bank360: eine Zahlung mitten im Zinslauf teilt die Tage verlustfrei', () => {
  const ganz = Engine.zinsSegmente({ basis: 100000, von: '2025-12-31', bis: '2026-12-31',
    art: 'fest', satz: 5, methode: 'bank360' });
  const teil1 = Engine.zinsSegmente({ basis: 100000, von: '2025-12-31', bis: '2026-03-31',
    art: 'fest', satz: 5, methode: 'bank360' });
  const teil2 = Engine.zinsSegmente({ basis: 100000, von: '2026-03-31', bis: '2026-12-31',
    art: 'fest', satz: 5, methode: 'bank360' });
  assert.strictEqual(ganz.segmente[0].tage, 360);
  assert.strictEqual(teil1.segmente[0].tage + teil2.segmente[0].tage, 360);
});

test('bank360 im vollständigen Konto: Monatsende wirkt bis in den Saldo', () => {
  const konto = { name: 'Monatsende', buchungen: [
    { id: 'hf', typ: 'hauptforderung', datum: '2026-01-01', betrag: 100000, text: 'Darlehen',
      verzinsung: { art: 'fest', satz: 5, beginn: '2026-01-01', ende: null, methode: 'bank360' } },
  ] };
  const e = Engine.berechneKonto(konto, '2026-02-28');
  assert.strictEqual(e.staffel[0].tage, 60);
  assert.strictEqual(e.summen.laufendeZinsen.gesamt, 833.33);
  assert.strictEqual(e.summen.saldo, 100833.33);
});
