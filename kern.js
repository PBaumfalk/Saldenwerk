// kern.js — gemeinsame Anwendungsfälle für Browser, REST-API, MCP-Server und CLI.
//
// Diese Schicht liegt zwischen den Fachmodulen und den Oberflächen. Sie kennt
// kein DOM, keine Dateien und keinen Prozess: sie nimmt geparste Objekte
// entgegen und liefert geparste Objekte zurück. Kein Modulzustand — der Server
// beantwortet Anfragen nebenläufig, und node --test lässt Testdateien parallel
// laufen.
//
// Grundregel: Benutzerfehler werden NICHT geworfen, sondern als
// { ok: false, code, fehler } zurückgegeben. Jede Oberfläche bildet `code` auf
// ihren eigenen Kanal ab (HTTP-Status, MCP-isError, Exit-Code), ohne deutsche
// Fehlertexte parsen zu müssen. Geworfen wird nur bei Programmierfehlern.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./app.js'), require('./basiszins.js'),
      require('./engine.js'), require('./druck.js'), require('./tenor.js'), require('./rvg.js'));
  } else {
    root.Kern = factory(root.AppFormat, root.Basiszins, root.Engine, root.Druck, root.Tenor, root.Rvg);
  }
})(typeof self !== 'undefined' ? self : this, function (AppFormat, Basiszins, Engine, Druck, Tenor, Rvg) {
  // Einzige Versionsquelle des Projekts: /api/status, MCP-serverInfo,
  // cli.js --version und .claude-plugin/plugin.json leiten sich hiervon ab.
  // tests/version.test.js hält sie mit CHANGELOG.md und dem Git-Tag gleich.
  const VERSION = '1.1.1';

  const FEHLERCODES = Object.freeze({
    BESTAND_UNGUELTIG: 'BESTAND_UNGUELTIG',
    KONTO_LEER: 'KONTO_LEER',
    KONTO_NICHT_GEFUNDEN: 'KONTO_NICHT_GEFUNDEN',
    KONTO_MEHRDEUTIG: 'KONTO_MEHRDEUTIG',
    STICHTAG_UNGUELTIG: 'STICHTAG_UNGUELTIG',
    RVG_EINGABE_UNGUELTIG: 'RVG_EINGABE_UNGUELTIG',
    BERECHNUNG_ZU_GROSS: 'BERECHNUNG_ZU_GROSS',
  });

  // Obergrenze für die Zahl der Zinssegmente. Gemessen: 201.000 Segmente
  // brauchen rund 0,5 s und erzeugen eine 28 MB große Antwort. Ein
  // realistisches Großkonto mit 10.000 Buchungen kommt auf etwa 130.000
  // Segmente und passt damit; unsinnige Eingaben (Jahrhunderte lange
  // Zinsläufe über hunderte Buchungen) werden abgewiesen, statt den Prozess
  // am Speicher sterben zu lassen und alle parallelen Anfragen mitzureißen.
  const MAX_SEGMENTE = 250000;

  const fehler = (code, text) => ({ ok: false, code, fehler: text });
  const istZahl = (w) => typeof w === 'number' && isFinite(w);

  // ── Fundament ────────────────────────────────────────────────────────────

  // Prüft das Dateiformat V1 und hängt die fertige Basiszins-Tabelle an.
  // Die Validierung selbst bleibt allein bei AppFormat.validiereExport —
  // ein zweites Regelwerk würde unweigerlich abweichen.
  function ladeBestand(objekt) {
    const geprueft = AppFormat.validiereExport(objekt);
    if (!geprueft.ok) return fehler(FEHLERCODES.BESTAND_UNGUELTIG, geprueft.fehler);
    return {
      ok: true,
      konten: geprueft.konten,
      basiszinsOverrides: geprueft.basiszinsOverrides,
      tabelle: Basiszins.mitOverrides(geprueft.basiszinsOverrides),
    };
  }

  function kontoBezeichnung(konto) {
    return konto.id ? `„${konto.name}" (id ${konto.id})` : `„${konto.name}"`;
  }

  // Ohne kontoId das erste Konto — so verhält sich auch die Browser-App.
  // Mit kontoId zuerst exakt über id, dann exakt über name.
  function waehleKonto(bestand, kontoId) {
    const konten = bestand && bestand.konten;
    if (!Array.isArray(konten) || konten.length === 0) {
      return fehler(FEHLERCODES.KONTO_LEER, 'Die Datei enthält kein Konto.');
    }
    if (kontoId === null || kontoId === undefined || kontoId === '') {
      return { ok: true, konto: konten[0] };
    }
    const kennung = String(kontoId);
    // Beide Seiten in Zeichenketten wandeln: validiereExport prüft konto.id
    // nicht, ein Fremdsystem darf also Zahlen liefern. Ein strikter Vergleich
    // ließ ?kontoId=3 an einer id 3 scheitern — mit einer Fehlermeldung, die
    // die gesuchte id im selben Satz als vorhanden auflistete.
    const perId = konten.filter((k) => k.id != null && String(k.id) === kennung);
    if (perId.length === 1) return { ok: true, konto: perId[0] };
    if (perId.length > 1) {
      return fehler(FEHLERCODES.KONTO_MEHRDEUTIG,
        `Mehrere Konten tragen die id „${kennung}".`);
    }
    const perName = konten.filter((k) => String(k.name) === kennung);
    if (perName.length === 1) return { ok: true, konto: perName[0] };
    if (perName.length > 1) {
      return fehler(FEHLERCODES.KONTO_MEHRDEUTIG,
        `Mehrere Konten heißen „${kennung}" – bitte stattdessen die id angeben.`);
    }
    return fehler(FEHLERCODES.KONTO_NICHT_GEFUNDEN,
      `Kein Konto mit id oder Name „${kennung}" gefunden. Vorhanden: ` +
      konten.map(kontoBezeichnung).join(', ') + '.');
  }

  // Ohne Angabe heute (lokale Zeitzone, siehe Engine.heute). Akzeptiert
  // JJJJ-MM-TT und TT.MM.JJJJ und liefert stets JJJJ-MM-TT zurück.
  function normalisiereStichtag(wert) {
    if (wert === null || wert === undefined || wert === '') {
      return { ok: true, stichtag: Engine.heute() };
    }
    const stichtag = AppFormat.parseDatum(wert);
    if (!stichtag) {
      return fehler(FEHLERCODES.STICHTAG_UNGUELTIG,
        `Stichtag „${wert}" ist kein gültiges Datum (erwartet JJJJ-MM-TT oder TT.MM.JJJJ).`);
    }
    if (stichtag < AppFormat.DATUM_VON || stichtag > AppFormat.DATUM_BIS) {
      return fehler(FEHLERCODES.STICHTAG_UNGUELTIG,
        `Stichtag „${wert}" liegt außerhalb des zulässigen Bereichs (1900 bis 2100).`);
    }
    return { ok: true, stichtag };
  }

  // Ein Dateiname für alle Oberflächen: HTTP-Content-Disposition, MCP-Ausgabe,
  // CLI und j-lawyer-Upload. Ohne Leer- und Sonderzeichen, damit er nirgends
  // gequotet werden muss.
  function dateiname(konto, stichtag, endung) {
    const roh = (konto && (konto.aktenzeichen || konto.name)) || 'Forderungskonto';
    const sauber = String(roh)
      .replace(/[^0-9A-Za-zÄÖÜäöüß._-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-._]+|[-._]+$/g, '')
      .slice(0, 80) || 'Forderungskonto';
    const punkt = !endung ? '' : (endung.charAt(0) === '.' ? '' : '.');
    return `Forderungsaufstellung_${sauber}_${stichtag}${punkt}${endung || ''}`;
  }

  // ── Anwendungsfälle ──────────────────────────────────────────────────────

  function vorbereiten(argumente) {
    const a = argumente || {};
    const gewaehlt = waehleKonto(a.bestand, a.kontoId);
    if (!gewaehlt.ok) return gewaehlt;
    const tag = normalisiereStichtag(a.stichtag);
    if (!tag.ok) return tag;
    return { ok: true, konto: gewaehlt.konto, stichtag: tag.stichtag, tabelle: a.bestand.tabelle };
  }

  // Schätzt die Zahl der Zinssegmente, BEVOR gerechnet wird. Jede verzinste
  // Buchung erzeugt etwa zwei Segmente je Jahr (Halbjahres- und Jahressplit).
  // Ohne diese Schranke brachte eine 16 KB große Anfrage den Server mit
  // "heap out of memory" zu Fall und riss alle parallelen Anfragen mit.
  function schaetzeSegmente(konto, stichtag) {
    let summe = 0;
    for (const b of konto.buchungen || []) {
      const v = b.verzinsung;
      if (!v || v.art === 'keine' || !v.beginn) continue;
      const bis = v.ende && v.ende < stichtag ? v.ende : stichtag;
      if (bis <= v.beginn) continue;
      const jahre = (Number(bis.slice(0, 4)) - Number(v.beginn.slice(0, 4))) + 1;
      summe += jahre * 2 + 2;
    }
    return summe;
  }

  function berechnung(argumente) {
    const vor = vorbereiten(argumente);
    if (!vor.ok) return vor;
    const geschaetzt = schaetzeSegmente(vor.konto, vor.stichtag);
    if (geschaetzt > MAX_SEGMENTE) {
      return fehler(FEHLERCODES.BERECHNUNG_ZU_GROSS,
        `Die Berechnung wäre zu umfangreich (geschätzt ${geschaetzt.toLocaleString('de-DE')} Zinssegmente, ` +
        `zulässig sind ${MAX_SEGMENTE.toLocaleString('de-DE')}). Bitte den Stichtag näher legen oder ` +
        'die Verzinsungszeiträume prüfen.');
    }
    return {
      ok: true, konto: vor.konto, stichtag: vor.stichtag, tabelle: vor.tabelle,
      ergebnis: Engine.berechneKonto(vor.konto, vor.stichtag, vor.tabelle),
    };
  }

  // erstelltAm ist übergebbar, damit Tests datumsfest bleiben.
  function report(argumente) {
    const b = berechnung(argumente);
    if (!b.ok) return b;
    const modell = Druck.baueDruckmodell(b.konto, b.ergebnis, b.tabelle);
    const erstelltAm = (argumente && argumente.erstelltAm) || Engine.heute();
    return Object.assign({}, b, { modell, erstelltAm, html: Druck.druckHtml(modell, erstelltAm) });
  }

  // Bewusst ohne Bytes: jsPDF ist umgebungsabhängig. Im Browser erzeugt
  // Pdfexport.erzeugePdf daraus die Datei, in Node pdf-node.js.
  function pdfModell(argumente) {
    const b = berechnung(argumente);
    if (!b.ok) return b;
    return Object.assign({}, b, {
      modell: Druck.baueDruckmodell(b.konto, b.ergebnis, b.tabelle),
      dateiname: dateiname(b.konto, b.stichtag, 'pdf'),
    });
  }

  function tenor(argumente) {
    const b = berechnung(argumente);
    if (!b.ok) return b;
    const text = Tenor.tenorText(b.konto, b.ergebnis);
    return Object.assign({}, b, {
      text,
      hinweis: text ? null : 'Keine offenen Forderungen – es wurde kein Antragstext erzeugt.',
    });
  }

  // rvg.js prüft nur Gegenstandswert, Datum und den Faktor der Geschäftsgebühr
  // selbst und wirft dabei. Alles andere wird hier geprüft, damit keine
  // Oberfläche einen Absturz als Ergebnis ausliefert.
  const ABSCHNITTE = [
    { feld: 'vorgerichtlich',
      bool: ['aktiv', 'auslagenpauschale', 'umsatzsteuer'],
      zahl: ['faktor'] },
    { feld: 'gerichtlich',
      bool: ['aktiv', 'verfahrensgebuehr', 'terminsgebuehr', 'anrechnung',
        'gerichtskosten', 'auslagenpauschale', 'umsatzsteuer'],
      zahl: ['anrechnungsFaktor'] },
  ];
  const VERFAHRENSARTEN = ['mahnverfahren', 'klageverfahren'];

  function pruefeAbschnitt(wert, name, boolFelder, zahlFelder) {
    if (wert === null || wert === undefined) return null;
    if (typeof wert !== 'object' || Array.isArray(wert)) {
      return `Abschnitt „${name}" muss ein Objekt sein.`;
    }
    for (const feld of boolFelder) {
      if (wert[feld] !== undefined && typeof wert[feld] !== 'boolean') {
        return `Feld „${name}.${feld}" muss true oder false sein.`;
      }
    }
    for (const feld of zahlFelder) {
      if (wert[feld] !== undefined && !istZahl(wert[feld])) {
        return `Feld „${name}.${feld}" muss eine Zahl sein.`;
      }
    }
    return null;
  }

  function rvg(eingaben) {
    if (!eingaben || typeof eingaben !== 'object' || Array.isArray(eingaben)) {
      return fehler(FEHLERCODES.RVG_EINGABE_UNGUELTIG, 'Es wurden keine RVG-Eingaben übergeben.');
    }
    if (!istZahl(eingaben.gegenstandswert) || eingaben.gegenstandswert <= 0) {
      return fehler(FEHLERCODES.RVG_EINGABE_UNGUELTIG,
        'Gegenstandswert muss eine Zahl größer als 0 sein.');
    }
    const datum = AppFormat.parseDatum(eingaben.datum);
    if (!datum) {
      return fehler(FEHLERCODES.RVG_EINGABE_UNGUELTIG,
        'Datum muss im Format JJJJ-MM-TT vorliegen.');
    }
    for (const abschnitt of ABSCHNITTE) {
      const text = pruefeAbschnitt(eingaben[abschnitt.feld], abschnitt.feld,
        abschnitt.bool, abschnitt.zahl);
      if (text) return fehler(FEHLERCODES.RVG_EINGABE_UNGUELTIG, text);
    }
    const art = eingaben.gerichtlich && eingaben.gerichtlich.verfahrensart;
    if (art !== undefined && art !== null && !VERFAHRENSARTEN.includes(art)) {
      return fehler(FEHLERCODES.RVG_EINGABE_UNGUELTIG,
        `Verfahrensart „${art}" ist unbekannt (erwartet mahnverfahren oder klageverfahren).`);
    }
    if (eingaben.verzugspauschale !== undefined && typeof eingaben.verzugspauschale !== 'boolean') {
      return fehler(FEHLERCODES.RVG_EINGABE_UNGUELTIG,
        'Feld „verzugspauschale" muss true oder false sein.');
    }
    let ergebnis;
    try {
      // Datum normalisiert weiterreichen: rvg.js akzeptiert nur JJJJ-MM-TT,
      // parseDatum oben nimmt auch TT.MM.JJJJ entgegen.
      // Spread statt Object.assign: Object.assign kopiert über [[Set]], wodurch
      // ein per JSON.parse eingeschleustes „__proto__" den Prototyp-Setter
      // auslöst und Felder an den Prüfungen oben vorbei nach rvg.js schleust.
      // Spread nutzt DefineOwnProperty und legt es als gewöhnliche Property an.
      ergebnis = Rvg.baueNebenforderungen({ ...eingaben, datum });
    } catch (e) {
      return fehler(FEHLERCODES.RVG_EINGABE_UNGUELTIG, e.message);
    }
    return { ok: true, buchungen: ergebnis.buchungen, hinweise: ergebnis.hinweise, stand: Rvg.STAND };
  }

  function basiszins(overrides) {
    const tabelle = Basiszins.mitOverrides(overrides || []);
    return { ok: true, tabelle, deckungsEnde: Basiszins.deckungsEnde(tabelle) };
  }

  // ── Schreibpfad (MCP und CLI; die REST-API bleibt zustandslos) ───────────

  // Baut das Dateiformat V1 und validiert das Ergebnis sofort mit demselben
  // Tor, durch das auch jeder Import geht. Damit kann kein Aufrufer eine
  // ungeprüfte Struktur auf ein Kanzlei-Netzlaufwerk schreiben.
  function baueBestand(argumente) {
    const a = argumente || {};
    const objekt = { version: 1, konten: a.konten || [] };
    if (Array.isArray(a.basiszinsOverrides) && a.basiszinsOverrides.length) {
      objekt.basiszinsOverrides = a.basiszinsOverrides;
    }
    const geprueft = AppFormat.validiereExport(objekt);
    if (!geprueft.ok) return fehler(FEHLERCODES.BESTAND_UNGUELTIG, geprueft.fehler);
    return { ok: true, objekt };
  }

  return {
    VERSION, FEHLERCODES, MAX_SEGMENTE,
    ladeBestand, waehleKonto, normalisiereStichtag, dateiname,
    berechnung, report, pdfModell, tenor, rvg, basiszins, baueBestand,
  };
});
