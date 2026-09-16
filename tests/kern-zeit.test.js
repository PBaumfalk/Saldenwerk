// Zeitzonen-Verhalten der Kern-Schicht.
//
// Engine.heute() nutzt bewusst die lokalen Datumsteile statt toISOString();
// Commit 63c0c6f hat genau das repariert („zwischen 0 und 2 Uhr nachts lieferte
// das Programm als heute den Vortag"). Kern.normalisiereStichtag erbt dieses
// Verhalten und muss es behalten — sonst trägt jede servergenerierte
// Forderungsaufstellung nachts einen falschen Stichtag.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const Kern = require('../kern.js');
const Engine = require('../engine.js');

const KERN_PFAD = JSON.stringify(path.join(__dirname, '..', 'kern.js'));

function inUmgebung(skript, zeitzone) {
  return execFileSync(process.execPath, ['-e', skript], {
    env: Object.assign({}, process.env, { TZ: zeitzone }),
    encoding: 'utf8',
  });
}

test('Stichtag-Default folgt der lokalen Zeitzone, nicht UTC', () => {
  // 23:30 UTC ist in Europe/Berlin bereits der Folgetag (Sommerzeit).
  const skript = `
    const Real = Date;
    const fest = new Real('2026-08-11T23:30:00Z');
    global.Date = class extends Real {
      constructor(...a) { super(...(a.length ? a : [fest.getTime()])); }
    };
    const Kern = require(${KERN_PFAD});
    process.stdout.write(Kern.normalisiereStichtag(null).stichtag);
  `;
  assert.strictEqual(inUmgebung(skript, 'Europe/Berlin'), '2026-08-12');
  assert.strictEqual(inUmgebung(skript, 'UTC'), '2026-08-11');
  // Auckland liegt zu diesem Zeitpunkt zwölf Stunden vor UTC.
  assert.strictEqual(inUmgebung(skript, 'Pacific/Auckland'), '2026-08-12');
});

test('ein ausdrücklicher Stichtag ist von der Zeitzone unabhängig', () => {
  const skript = `
    const Kern = require(${KERN_PFAD});
    process.stdout.write(Kern.normalisiereStichtag('2026-08-12').stichtag + '|' +
                         Kern.normalisiereStichtag('12.08.2026').stichtag);
  `;
  for (const zone of ['Europe/Berlin', 'UTC', 'Pacific/Auckland', 'America/Los_Angeles']) {
    assert.strictEqual(inUmgebung(skript, zone), '2026-08-12|2026-08-12', `Zeitzone ${zone}`);
  }
});

test('Berechnungen sind bei festem Stichtag zeitzonenunabhängig', () => {
  const skript = `
    const fs = require('node:fs');
    const path = require('node:path');
    const Kern = require(${KERN_PFAD});
    const datei = path.join(path.dirname(${KERN_PFAD}), 'docs', 'beispiel-konto.json');
    const b = Kern.ladeBestand(JSON.parse(fs.readFileSync(datei, 'utf8')));
    const r = Kern.berechnung({ bestand: b, stichtag: '2026-08-12' });
    process.stdout.write(String(r.ergebnis.summen.saldo));
  `;
  const erwartet = inUmgebung(skript, 'Europe/Berlin');
  assert.match(erwartet, /^\d+(\.\d+)?$/);
  for (const zone of ['UTC', 'Pacific/Auckland', 'America/Los_Angeles']) {
    assert.strictEqual(inUmgebung(skript, zone), erwartet, `Zeitzone ${zone}`);
  }
});

test('Kern.normalisiereStichtag und Engine.heute stimmen überein', () => {
  assert.strictEqual(Kern.normalisiereStichtag(null).stichtag, Engine.heute());
});
