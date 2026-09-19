// WebMCP-Anmeldung (webmcp.js): Registrierung, pseudonyme Schemata und die
// Abbildung der Fehlercodes aus kern.js.
//
// Einen Browser mit document.modelContext gibt es in der CI nicht. Geprüft
// wird deshalb gegen einen nachgebauten Kontext — und zusätzlich der Weg, den
// der Browser wirklich geht: die Skripte in der Reihenfolge aus index.html,
// ohne require, mit Selbststart.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Kern = require('../kern.js');
const Webmcp = require('../webmcp.js');

const WURZEL = path.join(__dirname, '..');
const STICHTAG = '2026-08-12';
const NAMEN = ['saldenwerk_konto_berechnen', 'saldenwerk_antragstext',
  'saldenwerk_rvg_nebenforderungen', 'saldenwerk_basiszins'];

const KONTO = () => ({
  stichtag: STICHTAG,
  buchungen: [
    { typ: 'hauptforderung', datum: '2024-03-15', betrag: 5000,
      verzinsung: { art: 'basiszins', satz: 5, beginn: '2024-04-16' } },
    { typ: 'zahlung', datum: '2024-09-01', betrag: 1500 },
  ],
});

function kontext(verhalten) {
  const tools = [];
  return {
    tools,
    registerTool(tool, optionen) {
      if (verhalten) verhalten(tool);
      tools.push({ tool, optionen });
      return Promise.resolve();
    },
  };
}

const tool = (name) => Webmcp.baueTools(Kern).find((t) => t.name === name);

async function fehlerVon(versprechen) {
  try { await versprechen; } catch (e) { return e; }
  assert.fail('Das Werkzeug hätte ablehnen müssen.');
}

// ── Registrierung ──────────────────────────────────────────────────────────

test('meldet vier Werkzeuge über document.modelContext an', async () => {
  const k = kontext();
  const r = await Webmcp.registriere({ document: { modelContext: k } }, Kern);
  assert.deepStrictEqual(r.angemeldet, NAMEN);
  assert.deepStrictEqual(k.tools.map((t) => t.tool.name), NAMEN);
});

test('document.modelContext hat Vorrang, navigator.modelContext ist der Rückfall', async () => {
  const neu = kontext();
  const alt = kontext();
  await Webmcp.registriere({ document: { modelContext: neu }, navigator: { modelContext: alt } }, Kern);
  assert.strictEqual(neu.tools.length, 4);
  assert.strictEqual(alt.tools.length, 0);

  const nurAlt = kontext();
  const r = await Webmcp.registriere({ document: {}, navigator: { modelContext: nurAlt } }, Kern);
  assert.strictEqual(nurAlt.tools.length, 4);
  assert.strictEqual(r.grund, null);
});

test('ohne Agent geschieht nichts', async () => {
  for (const umgebung of [undefined, {}, { document: {}, navigator: {} },
    { document: { modelContext: {} } }]) {
    const r = await Webmcp.registriere(umgebung, Kern);
    assert.deepStrictEqual(r.angemeldet, []);
    assert.strictEqual(r.grund, 'kein-agent');
  }
});

test('Konfig.webmcp: false schaltet die Anmeldung ab', async () => {
  const k = kontext();
  const r = await Webmcp.registriere({ document: { modelContext: k } }, Kern, { webmcp: false });
  assert.strictEqual(r.grund, 'abgeschaltet');
  assert.strictEqual(k.tools.length, 0);
});

test('jedes Werkzeug ist readOnly und vollständig beschrieben', () => {
  for (const t of Webmcp.baueTools(Kern)) {
    assert.match(t.name, /^[a-z_]{1,128}$/);
    assert.ok(t.description.length > 40, t.name);
    assert.strictEqual(t.annotations.readOnlyHint, true, t.name);
    assert.strictEqual(typeof t.execute, 'function');
    assert.strictEqual(t.inputSchema.type, 'object');
    // Muss als JSON übertragbar sein.
    assert.doesNotThrow(() => JSON.stringify(t.inputSchema));
  }
});

test('ein abgelehntes Werkzeug hält die übrigen nicht auf, und nichts wird geworfen', async () => {
  const k = kontext((t) => { if (t.name === NAMEN[1]) throw new Error('InvalidStateError'); });
  const r = await Webmcp.registriere({ document: { modelContext: k } }, Kern);
  assert.deepStrictEqual(r.angemeldet, NAMEN.filter((n) => n !== NAMEN[1]));

  const kaputt = { registerTool: () => Promise.reject(new Error('nein')) };
  const leer = await Webmcp.registriere({ document: { modelContext: kaputt } }, Kern);
  assert.strictEqual(leer.grund, 'abgelehnt');
});

test('abmelden() löst das übergebene AbortSignal aus', async () => {
  const k = kontext();
  const r = await Webmcp.registriere({ document: { modelContext: k } }, Kern);
  const signal = k.tools[0].optionen.signal;
  assert.strictEqual(signal.aborted, false);
  r.abmelden();
  assert.strictEqual(signal.aborted, true);
});

// ── Pseudonyme Schemata ────────────────────────────────────────────────────

const VERBOTEN = /name|glaeubiger|gläubiger|schuldner|aktenzeichen|mandant|partei|text|notiz|bemerkung|adresse|anschrift|^id$|kontoid/i;

function felder(schema, pfad, aus) {
  if (!schema || typeof schema !== 'object') return aus;
  for (const [feld, unter] of Object.entries(schema.properties || {})) {
    aus.push({ feld, pfad: `${pfad}.${feld}`, schema: unter });
    felder(unter, `${pfad}.${feld}`, aus);
  }
  if (schema.items) felder(schema.items, `${pfad}[]`, aus);
  return aus;
}

test('kein Schema hat ein Feld für Namen, Aktenzeichen oder freien Text', () => {
  for (const t of Webmcp.baueTools(Kern)) {
    const alle = felder(t.inputSchema, t.name, []);
    assert.ok(alle.length > 0 || t.name === 'saldenwerk_basiszins');
    for (const f of alle) {
      assert.ok(!VERBOTEN.test(f.feld), `${f.pfad} sieht nach einem Namens- oder Freitextfeld aus`);
      // Freie Zeichenketten gibt es nicht: jede ist Aufzählung oder Datum.
      if (f.schema.type === 'string') {
        assert.ok(f.schema.enum || f.schema.pattern, `${f.pfad} ist eine freie Zeichenkette`);
      }
    }
  }
});

test('jedes Objekt im Schema verbietet zusätzliche Felder', () => {
  const pruefe = (schema, pfad) => {
    if (!schema || typeof schema !== 'object') return;
    if (schema.type === 'object') {
      assert.strictEqual(schema.additionalProperties, false, `${pfad} lässt zusätzliche Felder zu`);
      for (const [feld, unter] of Object.entries(schema.properties || {})) pruefe(unter, `${pfad}.${feld}`);
    }
    if (schema.items) pruefe(schema.items, `${pfad}[]`);
  };
  for (const t of Webmcp.baueTools(Kern)) pruefe(t.inputSchema, t.name);
});

test('schickt ein Agent doch Namen mit, kommen sie nirgends wieder heraus', async () => {
  const eingabe = KONTO();
  Object.assign(eingabe, { name: 'Geheim GmbH ./. Verräter', glaeubiger: 'Geheim GmbH',
    schuldner: 'Vera Verräter', aktenzeichen: '99 C 1/26' });
  Object.assign(eingabe.buchungen[0], { text: 'Rechnung Verräter', id: 'verraeter-1' });
  for (const name of NAMEN.slice(0, 2)) {
    const aus = JSON.stringify(await tool(name).execute(eingabe));
    assert.doesNotMatch(aus, /Geheim|Verr[aä]ter|verraeter|99 C/, name);
  }
  // Auch nicht über eine Fehlermeldung.
  eingabe.stichtag = 'kein-datum';
  const e = await fehlerVon(tool(NAMEN[0]).execute(eingabe));
  assert.doesNotMatch(e.message, /Geheim|Verr[aä]ter|99 C/);
});

// ── Rechnen ────────────────────────────────────────────────────────────────

test('konto_berechnen rechnet wie Kern.berechnung auf demselben Konto', async () => {
  const aus = await tool(NAMEN[0]).execute(KONTO());
  const bestand = Kern.ladeBestand({ version: 1, konten: [{ name: 'Vergleich', buchungen: [
    { id: 'hauptforderung-1', typ: 'hauptforderung', datum: '2024-03-15', betrag: 5000, text: 'x',
      verzinsung: { art: 'basiszins', satz: 5, beginn: '2024-04-16', methode: 'kalender' } },
    { id: 'zahlung-1', typ: 'zahlung', datum: '2024-09-01', betrag: 1500, text: 'x' },
  ] }] });
  const erwartet = Kern.berechnung({ bestand, stichtag: STICHTAG });
  assert.strictEqual(aus.stichtag, STICHTAG);
  assert.deepStrictEqual(aus.ergebnis.summen, erwartet.ergebnis.summen);
  assert.deepStrictEqual(aus.ergebnis.staffel, erwartet.ergebnis.staffel);
  assert.ok(aus.ergebnis.summen.saldo > 3500);
});

test('antragstext nennt die Parteien nur als Seiten', async () => {
  const aus = await tool(NAMEN[1]).execute(KONTO());
  assert.match(aus.text, /die Schuldnerseite zu verurteilen, an die Gläubigerseite zu zahlen/);
  assert.match(aus.text, /5\.000,00 €/);
});

test('rvg_nebenforderungen liefert die Buchungen aus Kern.rvg', async () => {
  const eingabe = { gegenstandswert: 5000, datum: '2025-01-01',
    vorgerichtlich: { aktiv: true, faktor: 1.3, auslagenpauschale: true, umsatzsteuer: true } };
  const aus = await tool(NAMEN[2]).execute(eingabe);
  assert.deepStrictEqual(aus.buchungen, Kern.rvg(eingabe).buchungen);
  assert.strictEqual(aus.buchungen.length, 3);
});

test('basiszins liefert Tabelle, Deckungsende und auf Wunsch den Satz eines Tages', async () => {
  const ohne = await tool(NAMEN[3]).execute({});
  assert.strictEqual(ohne.tabelle[0].ab, '2002-01-01');
  assert.match(ohne.deckungsEnde, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(!('satz' in ohne));
  const mit = await tool(NAMEN[3]).execute({ datum: '2025-02-01' });
  assert.strictEqual(mit.satz, 2.27);
  assert.strictEqual((await tool(NAMEN[3]).execute({ datum: '2001-05-01' })).satz, null);
});

test('die Antworten sind als JSON übertragbar', async () => {
  for (const [name, eingabe] of [[NAMEN[0], KONTO()], [NAMEN[1], KONTO()], [NAMEN[3], undefined]]) {
    const aus = await tool(name).execute(eingabe);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(aus)), aus, name);
  }
});

// ── Fehlerabbildung ────────────────────────────────────────────────────────

test('Benutzerfehler aus kern.js werden zu abgelehnten Promises mit demselben Code', async () => {
  const mitStichtag = (stichtag) => Object.assign(KONTO(), { stichtag });
  const faelle = [
    [NAMEN[0], {}, 'KONTO_LEER'],
    [NAMEN[0], { buchungen: [] }, 'KONTO_LEER'],
    [NAMEN[0], 'unsinn', 'KONTO_LEER'],
    [NAMEN[0], { buchungen: [{ typ: 'geschenk', datum: '2024-01-01', betrag: 1 }] }, 'BESTAND_UNGUELTIG'],
    [NAMEN[0], { buchungen: [{ typ: 'zahlung', datum: '2024-01-01', betrag: -1 }] }, 'BESTAND_UNGUELTIG'],
    [NAMEN[0], { buchungen: [null] }, 'BESTAND_UNGUELTIG'],
    [NAMEN[0], Object.assign(KONTO(), { tilgungsreihenfolge: '366' }), 'BESTAND_UNGUELTIG'],
    [NAMEN[1], mitStichtag('31.02.2026'), 'STICHTAG_UNGUELTIG'],
    [NAMEN[0], mitStichtag('2150-01-01'), 'STICHTAG_UNGUELTIG'],
    [NAMEN[2], { gegenstandswert: -1, datum: '2025-01-01' }, 'RVG_EINGABE_UNGUELTIG'],
    [NAMEN[2], { gegenstandswert: 100, datum: '2025-01-01', vorgerichtlich: { aktiv: true } }, 'RVG_EINGABE_UNGUELTIG'],
    [NAMEN[3], { basiszinsOverrides: [{ ab: '2026-03-01', satz: 1 }] }, 'BESTAND_UNGUELTIG'],
    [NAMEN[3], { datum: 'gestern' }, 'STICHTAG_UNGUELTIG'],
  ];
  for (const [name, eingabe, code] of faelle) {
    const e = await fehlerVon(tool(name).execute(eingabe));
    assert.strictEqual(e.code, code, `${name} ${JSON.stringify(eingabe)}: ${e.message}`);
    assert.ok(Object.values(Kern.FEHLERCODES).includes(e.code));
    assert.strictEqual(e.name, 'SaldenwerkFehler');
    assert.ok(e.message.startsWith(`${code}: `), 'der Code steht vorn in der Meldung');
    assert.ok(e.message.length > code.length + 10, 'die deutsche Meldung aus kern.js bleibt erhalten');
  }
});

test('BERECHNUNG_ZU_GROSS kommt beim Agenten an, statt den Tab einzufrieren', async () => {
  const buchungen = [];
  for (let i = 0; i < 700; i++) {
    buchungen.push({ typ: 'hauptforderung', datum: '1900-01-02', betrag: 1,
      verzinsung: { art: 'fest', satz: 5, beginn: '1900-01-02' } });
  }
  const e = await fehlerVon(tool(NAMEN[0]).execute({ buchungen, stichtag: '2100-01-01' }));
  assert.strictEqual(e.code, 'BERECHNUNG_ZU_GROSS');
});

test('ein Programmierfehler wird zu INTERNER_FEHLER ohne Einzelheiten', async () => {
  const kaputt = Object.assign({}, Kern, { rvg: () => { throw new Error('Geheim GmbH im Stacktrace'); } });
  const t = Webmcp.baueTools(kaputt).find((x) => x.name === NAMEN[2]);
  const e = await fehlerVon(t.execute({ gegenstandswert: 1, datum: '2025-01-01' }));
  assert.strictEqual(e.code, Webmcp.INTERNER_FEHLER);
  assert.doesNotMatch(e.message, /Geheim/);
});

// ── Der Weg, den der Browser geht ──────────────────────────────────────────

// Lädt die Skripte wie index.html: ohne require, über die globalen Namen.
// Ohne `document` im Kontext bleibt der DOM-Teil von app.js aus; der
// Selbststart läuft deshalb über navigator.modelContext.
function ladeWieImBrowser(global) {
  const index = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
  const skripte = [...index.matchAll(/<script src="([^"]+)"/g)].map((t) => t[1]);
  assert.ok(skripte.indexOf('kern.js') > skripte.indexOf('tenor.js'), 'kern.js braucht Tenor und Druck');
  assert.strictEqual(skripte[skripte.length - 1], 'webmcp.js', 'webmcp.js muss nach kern.js als letztes laden');
  assert.strictEqual(skripte[skripte.length - 2], 'kern.js');
  const ctx = vm.createContext(global);
  ctx.self = ctx;
  for (const datei of skripte) {
    if (/^vendor\/|^(konfig|dateispeicher|pdfexport)\.js$/.test(datei)) continue;
    vm.runInContext(fs.readFileSync(path.join(WURZEL, datei), 'utf8'), ctx, { filename: datei });
  }
  return ctx;
}

test('im Browser meldet der Selbststart die Werkzeuge an, und sie rechnen', async () => {
  const k = kontext();
  const ctx = ladeWieImBrowser({ navigator: { modelContext: k }, Intl, AbortController });
  assert.ok(ctx.Kern && ctx.Webmcp, 'kern.js und webmcp.js müssen ohne require laden');
  await new Promise((fertig) => setImmediate(fertig));
  assert.deepStrictEqual(k.tools.map((t) => t.tool.name), NAMEN);
  const aus = await k.tools[0].tool.execute(KONTO());
  const erwartet = await tool(NAMEN[0]).execute(KONTO());
  assert.deepStrictEqual(JSON.parse(JSON.stringify(aus)), JSON.parse(JSON.stringify(erwartet)));
});

test('im Browser ohne Agent lädt alles still, und Konfig.webmcp: false wirkt', async () => {
  assert.doesNotThrow(() => ladeWieImBrowser({ navigator: {}, Intl }));
  const k = kontext();
  ladeWieImBrowser({ navigator: { modelContext: k }, Konfig: { webmcp: false }, Intl });
  await new Promise((fertig) => setImmediate(fertig));
  assert.strictEqual(k.tools.length, 0);
});

test('ein werfender modelContext-Getter stört den Start nicht', () => {
  const navigator = {};
  Object.defineProperty(navigator, 'modelContext', { get() { throw new Error('SecurityError'); } });
  assert.doesNotThrow(() => ladeWieImBrowser({ navigator, Intl }));
});
