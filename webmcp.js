// webmcp.js — meldet die Rechenfunktionen aus kern.js bei Browser-Agenten an.
//
// WebMCP (W3C Community Group Draft, Stand 17.09.2026) lässt eine Seite
// Werkzeuge bereitstellen, die ein Agent im Browser des Nutzers aufrufen
// kann. Die API liegt auf document.modelContext; ältere Umsetzungen kannten
// navigator.modelContext. Gibt es keines von beiden, tut dieses Modul nichts.
//
// Drei Regeln, auf die sich Handbuch-Kapitel 13 und die Datenschutzerklärung
// stützen — tests/doku-versprechen.test.js bindet die Texte an diese Datei:
//
//  1. Die Werkzeuge rechnen ausschließlich mit dem, was der Agent übergibt.
//     Dieses Modul liest weder gespeicherte Konten noch die Oberfläche und
//     öffnet keine Netzverbindung. Es kennt nur Kern.
//  2. Die Schemata sind pseudonym: Beträge, Daten, Zinssätze, Schalter.
//     Es gibt kein Feld für Namen, Aktenzeichen oder freien Text, und
//     unbekannte Felder werden verworfen, bevor gerechnet wird.
//  3. Alle Werkzeuge sind readOnlyHint: true — sie ändern nichts, weder in
//     der App noch im Speicher.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Webmcp = factory();
    // Selbststart nur im Browser. Fehler bleiben hier: WebMCP ist eine
    // Zugabe und darf den Start der App unter keinen Umständen stören.
    try {
      root.Webmcp.registriere(root, root.Kern, root.Konfig).catch(function () {});
    } catch (e) { /* bewusst leer */ }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  const INTERNER_FEHLER = 'INTERNER_FEHLER';

  // ── Schemata ─────────────────────────────────────────────────────────────

  const DATUM = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
  const datum = (description) => Object.assign({ description }, DATUM);

  const VERZINSUNG = {
    type: 'object',
    description: 'Verzinsung der Forderung. Fehlt sie, wird die Buchung nicht verzinst. ' +
      'Bei Zahlungen ohne Bedeutung.',
    additionalProperties: false,
    required: ['art'],
    properties: {
      art: { type: 'string', enum: ['keine', 'basiszins', 'fest'],
        description: 'basiszins: satz in Prozentpunkten über dem Basiszinssatz (§ 288 BGB: 5 oder 9). ' +
          'fest: satz in Prozent pro Jahr.' },
      satz: { type: 'number', description: 'Zinssatz, siehe art.' },
      beginn: datum('Erster Zinstag (JJJJ-MM-TT).'),
      ende: datum('Letzter Zinstag (JJJJ-MM-TT); weglassen für laufende Verzinsung.'),
      methode: { type: 'string', enum: ['kalender', 'bank360'],
        description: 'Zinsmethode, Vorgabe kalender (taggenau, act/act).' },
    },
  };

  const BUCHUNG = {
    type: 'object',
    additionalProperties: false,
    required: ['typ', 'datum', 'betrag'],
    properties: {
      typ: { type: 'string', enum: ['hauptforderung', 'nebenforderung', 'zinsforderung', 'zahlung'] },
      datum: datum('Buchungsdatum (JJJJ-MM-TT); bei Zahlungen der Zahlungseingang.'),
      betrag: { type: 'number', exclusiveMinimum: 0, description: 'Betrag in Euro, stets positiv.' },
      verzinsung: VERZINSUNG,
    },
  };

  const OVERRIDES = {
    type: 'array',
    description: 'Optional: Basiszinssätze, die die eingebaute Tabelle ergänzen oder ersetzen.',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['ab', 'satz'],
      properties: {
        ab: datum('Halbjahresbeginn (1. Januar oder 1. Juli).'),
        satz: { type: 'number', description: 'Basiszinssatz in Prozent.' },
      },
    },
  };

  const KONTO_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['buchungen'],
    properties: {
      buchungen: { type: 'array', minItems: 1, items: BUCHUNG,
        description: 'Forderungen und Zahlungen. Die Antwort benennt sie nach Typ und ' +
          'Reihenfolge, z. B. hauptforderung-1, zahlung-2.' },
      tilgungsreihenfolge: { type: 'string', enum: ['367', '497'],
        description: '367: § 367 BGB (Kosten, Zinsen, Hauptforderung; Vorgabe). ' +
          '497: § 497 Abs. 3 BGB (Verbraucherdarlehen).' },
      stichtag: datum('Berechnungsstichtag (JJJJ-MM-TT); Vorgabe heute.'),
      basiszinsOverrides: OVERRIDES,
    },
  };

  const RVG_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['gegenstandswert', 'datum'],
    properties: {
      gegenstandswert: { type: 'number', exclusiveMinimum: 0, description: 'Gegenstandswert in Euro.' },
      datum: datum('Datum der Auftragserteilung; bestimmt die anzuwendende Gebührentabelle.'),
      verzugspauschale: { type: 'boolean', description: '40 € nach § 288 Abs. 5 BGB.' },
      vorgerichtlich: {
        type: 'object',
        additionalProperties: false,
        properties: {
          aktiv: { type: 'boolean' },
          faktor: { type: 'number', description: 'Faktor der Geschäftsgebühr Nr. 2300 VV RVG, üblich 1,3. Pflicht, wenn aktiv.' },
          auslagenpauschale: { type: 'boolean' },
          umsatzsteuer: { type: 'boolean' },
        },
      },
      gerichtlich: {
        type: 'object',
        additionalProperties: false,
        properties: {
          aktiv: { type: 'boolean' },
          verfahrensart: { type: 'string', enum: ['mahnverfahren', 'klageverfahren'] },
          verfahrensgebuehr: { type: 'boolean' },
          vollstreckungsbescheid: { type: 'boolean', description: '0,5 Nr. 3308 VV RVG, nur Mahnverfahren.' },
          terminsgebuehr: { type: 'boolean' },
          anrechnung: { type: 'boolean', description: 'Anrechnung der Geschäftsgebühr, Vorbem. 3 Abs. 4 VV RVG.' },
          anrechnungsFaktor: { type: 'number' },
          gerichtskosten: { type: 'boolean' },
          auslagenpauschale: { type: 'boolean' },
          umsatzsteuer: { type: 'boolean' },
        },
      },
    },
  };

  const BASISZINS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
      datum: datum('Optional: liefert zusätzlich den an diesem Tag geltenden Satz.'),
      basiszinsOverrides: OVERRIDES,
    },
  };

  // ── Eingaben auf das Schema zurückschneiden ──────────────────────────────

  // Übernimmt nur, was das Schema kennt. Typen prüft weiterhin Kern — ein
  // zweites Regelwerk würde abweichen. Verworfen wird hier, damit ein Agent,
  // der doch einen Namen mitschickt, ihn weder in eine Rechnung noch in eine
  // Fehlermeldung zurückgespiegelt bekommt.
  function beschneide(wert, schema) {
    if (!schema || wert === null || wert === undefined) return wert;
    if (schema.type === 'object') {
      if (typeof wert !== 'object' || Array.isArray(wert)) return wert;
      const aus = {};
      for (const feld of Object.keys(schema.properties || {})) {
        if (Object.prototype.hasOwnProperty.call(wert, feld) && wert[feld] !== undefined) {
          aus[feld] = beschneide(wert[feld], schema.properties[feld]);
        }
      }
      return aus;
    }
    if (schema.type === 'array') {
      return Array.isArray(wert) ? wert.map((w) => beschneide(w, schema.items)) : wert;
    }
    return wert;
  }

  // Baut aus der pseudonymen Eingabe das Dateiformat V1. Name und
  // Buchungstexte sind feste Platzhalter; Kennungen entstehen aus Typ und
  // Reihenfolge.
  function baueKonto(eingabe) {
    const zaehler = {};
    const roh = Array.isArray(eingabe.buchungen) ? eingabe.buchungen : [];
    const buchungen = roh.map((b) => {
      if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
      const typ = typeof b.typ === 'string' ? b.typ : 'buchung';
      zaehler[typ] = (zaehler[typ] || 0) + 1;
      const v = b.verzinsung;
      const verzinsung = v && typeof v === 'object' && !Array.isArray(v) && v.art !== 'keine'
        ? Object.assign({ methode: 'kalender' }, v) : v;
      return Object.assign({}, b, {
        id: `${typ}-${zaehler[typ]}`,
        text: `${typ.charAt(0).toUpperCase()}${typ.slice(1)} ${zaehler[typ]}`,
        verzinsung,
      });
    });
    const konto = { id: 'konto', name: 'Konto', buchungen };
    if (eingabe.tilgungsreihenfolge !== undefined) konto.tilgungsreihenfolge = eingabe.tilgungsreihenfolge;
    const objekt = { version: 1, konten: [konto] };
    if (eingabe.basiszinsOverrides !== undefined) objekt.basiszinsOverrides = eingabe.basiszinsOverrides;
    return objekt;
  }

  // ── Fehlerabbildung ──────────────────────────────────────────────────────

  // WebMCP kennt für Fehler nur das abgelehnte Promise. Der Code aus
  // Kern.FEHLERCODES steht deshalb maschinenlesbar in .code und zusätzlich
  // vorn in der Meldung, weil Agenten oft nur die Meldung zu sehen bekommen.
  function alsFehler(code, text) {
    const e = new Error(`${code}: ${text}`);
    e.name = 'SaldenwerkFehler';
    e.code = code;
    return e;
  }

  function pruefe(ergebnis) {
    if (!ergebnis || ergebnis.ok !== true) {
      throw alsFehler((ergebnis && ergebnis.code) || INTERNER_FEHLER,
        (ergebnis && ergebnis.fehler) || 'Die Berechnung ist fehlgeschlagen.');
    }
    return ergebnis;
  }

  function mitBestand(Kern, eingabe, anwendungsfall) {
    if (!Array.isArray(eingabe.buchungen) || eingabe.buchungen.length === 0) {
      throw alsFehler(Kern.FEHLERCODES.KONTO_LEER, 'Es wurden keine Buchungen übergeben.');
    }
    const bestand = pruefe(Kern.ladeBestand(baueKonto(eingabe)));
    return pruefe(anwendungsfall({ bestand, stichtag: eingabe.stichtag }));
  }

  // ── Werkzeuge ────────────────────────────────────────────────────────────

  function baueTools(Kern) {
    const roh = [
      {
        name: 'saldenwerk_konto_berechnen',
        title: 'Forderungskonto berechnen',
        description: 'Berechnet ein Forderungskonto zum Stichtag: Zinsstaffel, Verrechnung der ' +
          'Zahlungen nach § 367 BGB oder § 497 Abs. 3 BGB und offene Salden. Rechnet nur mit den ' +
          'übergebenen Beträgen, Daten und Zinssätzen; es gibt bewusst kein Feld für Namen oder ' +
          'Aktenzeichen. Liest und ändert keine in Saldenwerk gespeicherten Konten.',
        inputSchema: KONTO_SCHEMA,
        rechne: (e) => {
          const b = mitBestand(Kern, e, Kern.berechnung);
          return { stichtag: b.stichtag, ergebnis: b.ergebnis };
        },
      },
      {
        name: 'saldenwerk_antragstext',
        title: 'Antragstext erzeugen',
        description: 'Erzeugt aus denselben Eingaben wie saldenwerk_konto_berechnen den Antragstext ' +
          'für Mahnbescheid oder Klage. Die Parteien erscheinen als „die Schuldnerseite" und ' +
          '„die Gläubigerseite"; Namen setzt der Mensch selbst ein.',
        inputSchema: KONTO_SCHEMA,
        rechne: (e) => {
          const t = mitBestand(Kern, e, Kern.tenor);
          return { stichtag: t.stichtag, text: t.text, hinweis: t.hinweis };
        },
      },
      {
        name: 'saldenwerk_rvg_nebenforderungen',
        title: 'RVG-Nebenforderungen berechnen',
        description: 'Berechnet vorgerichtliche und gerichtliche Rechtsanwaltsgebühren (RVG), ' +
          'Gerichtskosten und die Verzugspauschale als Nebenforderungen aus Gegenstandswert und Datum.',
        inputSchema: RVG_SCHEMA,
        rechne: (e) => {
          const r = pruefe(Kern.rvg(e));
          return { buchungen: r.buchungen, hinweise: r.hinweise, stand: r.stand };
        },
      },
      {
        name: 'saldenwerk_basiszins',
        title: 'Basiszinssatz nachschlagen',
        description: 'Liefert die Tabelle der Basiszinssätze nach § 247 BGB seit 2002 und das Ende ' +
          'ihrer Deckung, auf Wunsch den an einem Tag geltenden Satz.',
        inputSchema: BASISZINS_SCHEMA,
        rechne: (e) => {
          const geladen = pruefe(Kern.ladeBestand({ version: 1, konten: [],
            basiszinsOverrides: e.basiszinsOverrides }));
          const b = pruefe(Kern.basiszins(geladen.basiszinsOverrides));
          const aus = { tabelle: b.tabelle, deckungsEnde: b.deckungsEnde };
          if (e.datum !== undefined) {
            const tag = pruefe(Kern.normalisiereStichtag(e.datum)).stichtag;
            const treffer = b.tabelle.filter((z) => z.ab <= tag).pop();
            aus.datum = tag;
            aus.satz = treffer ? treffer.satz : null;
          }
          return aus;
        },
      },
    ];

    return roh.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { readOnlyHint: true },
      // async: auch ein synchroner Fehler wird zum abgelehnten Promise.
      execute: async (eingabe) => {
        try {
          const istObjekt = eingabe && typeof eingabe === 'object' && !Array.isArray(eingabe);
          return t.rechne(beschneide(istObjekt ? eingabe : {}, t.inputSchema));
        } catch (e) {
          if (e && e.name === 'SaldenwerkFehler') throw e;
          // Programmierfehler: keine Einzelheiten nach außen, sie könnten
          // Eingaben enthalten.
          throw alsFehler(INTERNER_FEHLER, 'Unerwarteter Fehler bei der Berechnung.');
        }
      },
    }));
  }

  // ── Anmeldung ────────────────────────────────────────────────────────────

  function findeKontext(umgebung) {
    const lies = (objekt) => {
      try { return (objekt && objekt.modelContext) || null; } catch (e) { return null; }
    };
    const u = umgebung || {};
    const kontext = lies(u.document) || lies(u.navigator);
    return kontext && typeof kontext.registerTool === 'function' ? kontext : null;
  }

  // Wirft nie. Liefert { angemeldet: [Namen], grund, abmelden }.
  async function registriere(umgebung, Kern, konfig) {
    const nichts = (grund) => ({ angemeldet: [], grund, abmelden: () => {} });
    if (konfig && konfig.webmcp === false) return nichts('abgeschaltet');
    if (!Kern) return nichts('kern-fehlt');
    const kontext = findeKontext(umgebung);
    if (!kontext) return nichts('kein-agent');

    // Abmelden sieht der Entwurf nur über ein AbortSignal vor.
    const Abbruch = (umgebung && umgebung.AbortController) ||
      (typeof AbortController !== 'undefined' ? AbortController : null);
    const abbruch = Abbruch ? new Abbruch() : null;
    const optionen = abbruch ? { signal: abbruch.signal } : {};

    const angemeldet = [];
    for (const tool of baueTools(Kern)) {
      try {
        await kontext.registerTool(tool, optionen);
        angemeldet.push(tool.name);
      } catch (e) { /* ein abgelehntes Werkzeug hält die übrigen nicht auf */ }
    }
    return { angemeldet, grund: angemeldet.length ? null : 'abgelehnt',
      abmelden: () => { if (abbruch) abbruch.abort(); } };
  }

  return { INTERNER_FEHLER, baueTools, findeKontext, registriere };
});
