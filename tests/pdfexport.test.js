const test = require('node:test');
const assert = require('node:assert');
const Pdfexport = require('../pdfexport.js');
const Druck = require('../druck.js');
const Engine = require('../engine.js');

function modellFixture() {
  const konto = {
    name: 'Mandant ./. Schuldner',
    aktenzeichen: '12 C 345/26',
    buchungen: [
      { id: 'hf1', typ: 'hauptforderung', datum: '2024-01-05', betrag: 1000, text: 'Rechnung', verzinsung: null },
      { id: 'z1', typ: 'zahlung', datum: '2024-03-01', betrag: 300, text: 'Zahlung', verzinsung: null },
    ],
  };
  return Druck.baueDruckmodell(konto, Engine.berechneKonto(konto, '2024-12-31'));
}

test('baueTabellenKonfig: 10 Spalten mit Breiten in Summe 100', () => {
  const k = Pdfexport.baueTabellenKonfig(modellFixture());
  assert.strictEqual(k.head.length, 10);
  assert.strictEqual(k.head[0], 'Datum');
  assert.strictEqual(k.head[9], 'Gesamtsaldo');
  assert.strictEqual(k.spaltenProzent.length, 10);
  assert.strictEqual(Engine.round2(k.spaltenProzent.reduce((s, p) => s + p, 0)), 100);
});

test('baueTabellenKonfig: Zeilen-Mapping mit Arten und Saldozeile', () => {
  const k = Pdfexport.baueTabellenKonfig(modellFixture());
  // 2 Buchungszeilen + Saldozeile
  assert.strictEqual(k.body.length, 3);
  assert.deepStrictEqual(k.arten, ['buchung', 'buchung', 'saldo']);
  assert.strictEqual(k.body[0][0], '05.01.2024');
  assert.strictEqual(k.body[0][3], '1.000,00 EUR'); // Spalte Hauptforderung
  assert.strictEqual(k.body[1][2], '300,00 EUR'); // Spalte Zahlung
  assert.strictEqual(k.body[1][8], '-300,00 EUR'); // Umsatz negativ
  assert.ok(k.body[2][0].startsWith('Saldo per'));
  assert.strictEqual(k.body[2][9], '700,00 EUR');
});

test('baueSeite2Konfig: drei Summenblöcke mit Gesamtzeilen', () => {
  const k = Pdfexport.baueSeite2Konfig(modellFixture());
  assert.deepStrictEqual(k.bloecke.map((b) => b.titel), ['Summen', 'Zahlungen', 'Salden']);
  const salden = k.bloecke[2];
  assert.deepStrictEqual(salden.zeilen[salden.zeilen.length - 1], ['Gesamtsaldo:', '700,00 EUR']);
  assert.ok(k.tageszins.includes('EUR ab dem'));
});

// ── Kopfbalken ────────────────────────────────────────────────────────────
//
// Früher saßen die Kopffelder auf festen Bruchteilen der Seitenbreite, ohne
// dass je eine Textbreite gemessen wurde. Bei Parteinamen der Form
// "Nachname, Vorname ./. Nachname, Vorname" schob sich das dritte Feld
// zwangsläufig in das vierte — der Fehler war deterministisch, nicht zufällig.

const messe = (t) => t.length * 0.5; // grobe Näherung für 8pt Helvetica

function ueberlappt(layout, messfn) {
  for (const zeile of layout.zeilen) {
    for (let i = 1; i < zeile.length; i++) {
      const ende = zeile[i - 1].x + messfn(zeile[i - 1].text) * (layout.groesse / 8);
      if (zeile[i].x < ende) return true;
    }
  }
  return false;
}

test('balkenLayout: Felder überlappen nie, auch bei langen Namen nicht', () => {
  const faelle = [
    ['Forderungskonto: Kurz', 'Az.: 1 C 2/26', 'Berechnungsstand: 16.09.2026'],
    ['Forderungskonto: Baumfalk, Patrick ./. von Schmeling, Timo',
      'Az.: ZENCJ/01/23-PBA-AR', 'Berechnungsstand: 16.09.2026'],
    ['Forderungskonto: ' + 'X'.repeat(200), 'Az.: ' + 'Y'.repeat(120),
      'Z'.repeat(150), 'Berechnungsstand: 16.09.2026'],
  ];
  for (const texte of faelle) {
    const l = Pdfexport.balkenLayout(texte, 269, messe, 8);
    assert.ok(!ueberlappt(l, messe), `Überlappung bei: ${texte[0].slice(0, 40)}`);
    const gesetzt = l.zeilen.reduce((s, z) => s + z.length, 0);
    assert.strictEqual(gesetzt, texte.length, 'es müssen alle Felder gesetzt werden');
  }
});

test('balkenLayout: passt es, bleibt es einzeilig und in voller Größe', () => {
  const l = Pdfexport.balkenLayout(
    ['Forderungskonto: Muster', 'Az.: 1 C 2/26', 'Berechnungsstand: 16.09.2026'], 269, messe, 8);
  assert.strictEqual(l.zeilen.length, 1);
  assert.strictEqual(l.groesse, 8);
  assert.strictEqual(l.zeilen[0][0].x, 0, 'das erste Feld steht links');
});

test('balkenLayout: passt es nicht, wird umbrochen statt abgeschnitten', () => {
  const texte = ['A'.repeat(400), 'B'.repeat(400), 'C'.repeat(400)];
  const l = Pdfexport.balkenLayout(texte, 269, messe, 8);
  assert.ok(l.zeilen.length > 1, 'es muss umbrochen werden');
  const alle = l.zeilen.flat().map((f) => f.text);
  assert.deepStrictEqual(alle, texte, 'kein Feld darf verloren gehen oder gekürzt werden');
});

test('balkenLayout: ein einzelnes Feld stürzt nicht ab', () => {
  const l = Pdfexport.balkenLayout(['Nur eins'], 269, messe, 8);
  assert.strictEqual(l.zeilen.length, 1);
  assert.strictEqual(l.zeilen[0][0].x, 0);
});
