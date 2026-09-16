// Hält den Rechenweg von kern.js mit dem der Browser-App deckungsgleich.
//
// app.js orchestriert seit 1.0.0 selbst (App.aktuelleTabelle bei app.js:806,
// Tenor bei app.js:1412, Druckmodell bei app.js:1740). Diese Orchestrierung
// wird bewusst NICHT umgebaut — ein UI-Refactoring gegen null DOM-Tests wäre
// riskanter als die Dopplung. Stattdessen spiegelt dieser Test den Pfad der
// App nach und verlangt identische Ergebnisse.
//
// Schlägt er fehl, liefern Browser und Schnittstelle zur selben Datei
// verschiedene Beträge — und das fiele sonst niemandem auf, weil beide
// plausibel aussehen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Kern = require('../kern.js');
const Engine = require('../engine.js');
const Basiszins = require('../basiszins.js');
const Druck = require('../druck.js');
const Tenor = require('../tenor.js');
const AppFormat = require('../app.js');

const STICHTAG = '2026-08-12';
const ERSTELLT_AM = '2026-08-12';

// Exakt der Weg, den app.js geht.
function appPfad(objekt, kontoIndex, stichtag) {
  const geprueft = AppFormat.validiereExport(objekt);
  assert.ok(geprueft.ok, geprueft.fehler);
  const konto = geprueft.konten[kontoIndex];
  const tabelle = Basiszins.mitOverrides(geprueft.basiszinsOverrides || []);
  const ergebnis = Engine.berechneKonto(konto, stichtag, tabelle);
  return {
    konto, tabelle, ergebnis,
    modell: Druck.baueDruckmodell(konto, ergebnis, tabelle),
    tenor: Tenor.tenorText(konto, ergebnis),
  };
}

const BEISPIEL = () => JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'docs', 'beispiel-konto.json'), 'utf8'));

// Zweiter Fall mit den Merkmalen, die im Beispielkonto fehlen: § 497 Abs. 3
// BGB, Bankmethode, fester Zinssatz, Zinsforderung, Basiszins-Override.
function sonderfall() {
  return {
    version: 1,
    basiszinsOverrides: [{ ab: '2025-01-01', satz: 4.5 }, { ab: '2026-07-01', satz: 0.25 }],
    konten: [{
      id: 'verbraucherdarlehen',
      name: 'Bank ./. Verbraucher',
      aktenzeichen: '7 O 12/25',
      tilgungsreihenfolge: '497',
      buchungen: [
        { id: 'hf-1', typ: 'hauptforderung', datum: '2024-11-30', betrag: 12500.55,
          text: 'Restdarlehen',
          verzinsung: { art: 'basiszins', satz: 2.5, beginn: '2024-12-01', ende: null, methode: 'kalender' } },
        { id: 'hf-2', typ: 'hauptforderung', datum: '2025-03-15', betrag: 800,
          text: 'Weitere Valuta',
          verzinsung: { art: 'fest', satz: 8.25, beginn: '2025-03-16', ende: '2026-03-15', methode: 'bank360' } },
        { id: 'nf-1', typ: 'nebenforderung', datum: '2025-01-10', betrag: 137.9,
          text: 'Kündigungskosten', verzinsung: { art: 'keine' } },
        { id: 'zf-1', typ: 'zinsforderung', datum: '2025-01-10', betrag: 415.2,
          text: 'Rückständige Vertragszinsen', verzinsung: { art: 'keine' } },
        { id: 'z-1', typ: 'zahlung', datum: '2025-06-30', betrag: 2000, text: 'Teilzahlung' },
        { id: 'z-2', typ: 'zahlung', datum: '2026-02-14', betrag: 750.5, text: 'Teilzahlung' },
      ],
    }],
  };
}

const FAELLE = [
  ['Beispielkonto (§ 367 BGB, Kalendermethode)', BEISPIEL],
  ['Sonderfall (§ 497 Abs. 3 BGB, Bank 30/360, Overrides)', sonderfall],
];

for (const [name, baue] of FAELLE) {
  test(`${name}: Basiszins-Tabelle identisch`, () => {
    const objekt = baue();
    const b = Kern.ladeBestand(objekt);
    assert.deepStrictEqual(b.tabelle, appPfad(objekt, 0, STICHTAG).tabelle);
  });

  test(`${name}: Engine-Ergebnis identisch`, () => {
    const objekt = baue();
    const kern = Kern.berechnung({ bestand: Kern.ladeBestand(objekt), stichtag: STICHTAG });
    assert.deepStrictEqual(kern.ergebnis, appPfad(objekt, 0, STICHTAG).ergebnis);
  });

  test(`${name}: Druckmodell identisch`, () => {
    const objekt = baue();
    const kern = Kern.report({
      bestand: Kern.ladeBestand(objekt), stichtag: STICHTAG, erstelltAm: ERSTELLT_AM });
    assert.deepStrictEqual(kern.modell, appPfad(objekt, 0, STICHTAG).modell);
  });

  test(`${name}: Antragstext identisch`, () => {
    const objekt = baue();
    const kern = Kern.tenor({ bestand: Kern.ladeBestand(objekt), stichtag: STICHTAG });
    assert.strictEqual(kern.text, appPfad(objekt, 0, STICHTAG).tenor);
  });
}

test('Sonderfall rechnet wirklich anders als der Regelfall', () => {
  // Absicherung gegen einen Sonderfall, der die Sonderpfade gar nicht auslöst:
  // Ein Test, der versehentlich zweimal dasselbe prüft, ist wertlos.
  const objekt = sonderfall();
  const ergebnis = appPfad(objekt, 0, STICHTAG).ergebnis;
  assert.ok(ergebnis.staffel.some((s) => s.nenner === 360), 'keine Bank-30/360-Segmente');
  assert.ok(ergebnis.staffel.some((s) => s.nenner === 365 || s.nenner === 366),
    'keine Kalender-Segmente');
  assert.ok(ergebnis.verrechnungen.length >= 2, 'zu wenige Verrechnungen');
  // § 497 Abs. 3 BGB: die erste Zahlung bedient die Hauptforderung vor den Zinsen.
  const erste = ergebnis.verrechnungen[0];
  assert.ok(erste.aufHauptforderung > 0, 'Hauptforderung wurde nicht bedient');
});

test('Basiszins-Overrides wirken sich auf das Ergebnis aus', () => {
  // Wäre mitOverrides wirkungslos, liefe der Äquivalenztest ins Leere.
  const ohne = sonderfall();
  delete ohne.basiszinsOverrides;
  const mit = sonderfall();
  assert.notDeepStrictEqual(
    Kern.berechnung({ bestand: Kern.ladeBestand(mit), stichtag: STICHTAG }).ergebnis.summen,
    Kern.berechnung({ bestand: Kern.ladeBestand(ohne), stichtag: STICHTAG }).ergebnis.summen);
});
