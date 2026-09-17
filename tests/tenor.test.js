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

// ── Zahlungen auf laufende Zinsen (§ 367 BGB) ─────────────────────────────
//
// Früher verschwiegen diese Zahlungen der Antrag vollständig, während die
// Zinsklausel unverändert "seit dem <Verzugsbeginn>" lief. Ein Gericht hätte
// damit auch die bereits bezahlten Zinsen zugesprochen.

test('tenorText: Zahlung auf laufende Zinsen teilt den Zinslauf', () => {
  const k = konto([
    hf(10000, '2023-01-01', { art: 'fest', satz: 5, beginn: '2023-01-01', ende: null, methode: 'kalender' }, 'h1'),
    zahlung(300, '2024-07-01', 'z1'),
  ]);
  const e = Engine.berechneKonto(k, '2026-08-05', T);
  const t = Tenor.tenorText(k, e);

  // Der abgerechnete Zeitraum endet am Vortag der Zahlung …
  assert.ok(t.includes('für die Zeit vom 01.01.2023 bis zum 30.06.2024'), t);
  // … die Zahlung ist ausgewiesen …
  assert.ok(t.includes('abzüglich am 01.07.2024 hierauf gezahlter 300,00 €'), t);
  // … und die unbezifferte Klausel setzt erst am Zahlungstag an.
  assert.ok(t.includes('seit dem 01.07.2024'), t);
  assert.ok(!t.includes('seit dem 01.01.2023'), 'die Klausel läuft noch ab Verzugsbeginn');

  // Der bezifferte Rest muss zu dem passen, was die Engine ausweist:
  // Zinsen bis zum Vortag der Zahlung minus die darauf geleistete Zahlung.
  const bisZahlung = e.staffel
    .filter((s) => s.forderungId === 'h1' && s.bis <= '2024-06-30')
    .reduce((s, x) => s + x.zins, 0);
  const rest = Engine.round2(bisZahlung - 300);
  assert.ok(rest > 0, 'Aufbau des Falls prüfen — der Zeitraum sollte nicht voll getilgt sein');
  assert.ok(t.includes(`nebst ausgerechneter Zinsen von ${rest.toLocaleString('de-DE',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`), t);
});

test('tenorText: deckt die Zahlung den alten Zeitraum vollständig, entfällt der Einschub', () => {
  // Kleine Forderung, große Zahlung auf die Zinsen: Es bleibt nichts
  // Beziffertes übrig, die Klausel setzt aber trotzdem später an.
  const k = konto([
    hf(1000, '2024-01-01', { art: 'fest', satz: 5, beginn: '2024-01-01', ende: null, methode: 'kalender' }, 'h1'),
    zahlung(25, '2024-07-01', 'z1'),
  ]);
  const e = Engine.berechneKonto(k, '2026-08-05', T);
  const auf = e.verrechnungen[0].verteilung.filter((v) => v.feld === 'zinsOffen');
  assert.ok(auf.length, 'die Zahlung sollte auf die Zinsen gehen');
  const t = Tenor.tenorText(k, e);
  assert.ok(!t.includes('nebst ausgerechneter Zinsen'), t);
  assert.ok(t.includes('nebst Zinsen'), t);
});

test('tenorText: endete die Verzinsung vor der Zahlung, läuft keine Klausel weiter', () => {
  const k = konto([
    hf(10000, '2023-01-01', { art: 'fest', satz: 5, beginn: '2023-01-01', ende: '2023-12-31', methode: 'kalender' }, 'h1'),
    zahlung(100, '2024-07-01', 'z1'),
  ]);
  const t = Tenor.tenorText(k, Engine.berechneKonto(k, '2026-08-05', T));
  assert.ok(t.includes('nebst ausgerechneter Zinsen'), t);
  assert.ok(!t.includes('seit dem'), 'es darf keine laufende Zinsklausel mehr geben');
  assert.ok(t.includes('bis zum 31.12.2023'), t);
});

// ── § 497 Abs. 3 BGB: Hauptforderung getilgt, Zinsen offen ────────────────
//
// Dort werden die Zinsen zuletzt getilgt. Früher gab tenorText null zurück,
// und die App meldete "Keine offenen Forderungen" — bei offener Forderung.

test('tenorText: § 497 mit getilgter Hauptforderung und offenen Zinsen', () => {
  const k = konto([
    hf(10000, '2020-01-01', { art: 'fest', satz: 5, beginn: '2020-01-01', ende: null, methode: 'kalender' }, 'h1'),
    zahlung(10000, '2026-01-01', 'z1'),
  ], { tilgungsreihenfolge: '497' });
  const e = Engine.berechneKonto(k, '2026-08-05', T);

  assert.strictEqual(e.posten.filter((p) => p.rest > 0).length, 0, 'Aufbau: keine offene Forderung');
  assert.ok(e.summen.saldo > 0, 'Aufbau: es muss ein Saldo offen sein');

  const t = Tenor.tenorText(k, e);
  assert.ok(t, 'es muss ein Antragstext entstehen');
  assert.ok(t.includes('ausgerechnete Zinsen in Höhe von'), t);
  assert.ok(t.includes('aus 10.000,00 €'), t);
  assert.ok(t.includes('Verrechnung nach § 497 Abs. 3 BGB'), t);

  // Der bezifferte Betrag muss dem offenen Saldo entsprechen.
  const erwartet = e.summen.saldo.toLocaleString('de-DE',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  assert.ok(t.includes(`${erwartet} €`), `Saldo ${erwartet} fehlt im Antrag:\n${t}`);
});

test('tenorText: vollständig ausgeglichenes Konto ergibt weiterhin null', () => {
  const k = konto([
    hf(1000, '2024-01-01', { art: 'keine' }, 'h1'),
    zahlung(1000, '2024-01-01', 'z1'),
  ]);
  const e = Engine.berechneKonto(k, '2026-08-05', T);
  assert.strictEqual(e.summen.saldo, 0);
  assert.strictEqual(Tenor.tenorText(k, e), null);
});

test('tenorText: der Antrag verlangt nie mehr, als das Konto ausweist', () => {
  // Gegenprobe über mehrere Konstellationen: Jeder bezifferte Betrag im
  // Antrag muss sich im Ergebnis wiederfinden.
  const faelle = [
    konto([hf(5000, '2023-03-01', { art: 'fest', satz: 8, beginn: '2023-03-01', ende: null, methode: 'kalender' }, 'h1'),
      zahlung(500, '2024-05-01', 'z1')]),
    konto([hf(5000, '2023-03-01', { art: 'fest', satz: 8, beginn: '2023-03-01', ende: null, methode: 'kalender' }, 'h1'),
      zahlung(3000, '2024-05-01', 'z1')], { tilgungsreihenfolge: '497' }),
    konto([hf(2000, '2022-01-01', { art: 'basiszins', satz: 5, beginn: '2022-01-01', ende: null, methode: 'kalender' }, 'h1'),
      zahlung(80, '2023-01-01', 'z1'), zahlung(80, '2024-01-01', 'z2')]),
  ];
  for (const k of faelle) {
    const e = Engine.berechneKonto(k, '2026-08-05', T);
    const t = Tenor.tenorText(k, e);
    assert.ok(t, 'Antragstext fehlt');
    // Keine Klausel darf vor dem letzten zinswirksamen Zahlungstag ansetzen.
    const letzteZinszahlung = e.verrechnungen
      .filter((v) => (v.verteilung || []).some((x) => x.feld === 'zinsOffen'))
      .map((v) => v.datum).pop();
    if (letzteZinszahlung) {
      const tag = letzteZinszahlung.slice(8) + '.' + letzteZinszahlung.slice(5, 7) + '.' + letzteZinszahlung.slice(0, 4);
      assert.ok(t.includes(`seit dem ${tag}`) || !t.includes('seit dem'),
        `Klausel setzt nicht am letzten Zinszahlungstag an:\n${t}`);
    }
  }
});
