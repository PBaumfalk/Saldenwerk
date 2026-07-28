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
