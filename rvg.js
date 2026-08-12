// Gebührenrechner nach RVG/GKG, Stand KostRÄG 2025 (in Kraft seit 01.06.2025).
// Werte: § 13 RVG, § 34 GKG, KV 1100/1210 GKG, Nr. 2300/3100/3104/7002/7008 VV RVG.
// Angaben ohne Gewähr — bei Gesetzesänderungen die Tabellen unten pflegen.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Rvg = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const STAND = { gueltigAb: '2025-06-01', quelle: 'KostRÄG 2025' };

  const RVG_TABELLE = {
    grundbetrag: 51.5, grundwert: 500,
    stufen: [
      { bisWert: 2000, schritt: 500, erhoehung: 41.5 },
      { bisWert: 10000, schritt: 1000, erhoehung: 59.5 },
      { bisWert: 25000, schritt: 3000, erhoehung: 55.0 },
      { bisWert: 50000, schritt: 5000, erhoehung: 86.0 },
      { bisWert: 200000, schritt: 15000, erhoehung: 99.5 },
      { bisWert: 500000, schritt: 30000, erhoehung: 140.0 },
      { bisWert: Infinity, schritt: 50000, erhoehung: 175.0 },
    ],
  };

  const GKG_TABELLE = {
    grundbetrag: 40.0, grundwert: 500,
    stufen: [
      { bisWert: 2000, schritt: 500, erhoehung: 21.0 },
      { bisWert: 10000, schritt: 1000, erhoehung: 22.5 },
      { bisWert: 25000, schritt: 3000, erhoehung: 30.5 },
      { bisWert: 50000, schritt: 5000, erhoehung: 40.5 },
      { bisWert: 200000, schritt: 15000, erhoehung: 140.0 },
      { bisWert: 500000, schritt: 30000, erhoehung: 210.0 },
      { bisWert: Infinity, schritt: 50000, erhoehung: 210.0 },
    ],
  };

  const MINDESTGEBUEHR_RVG = 15; // § 13 Abs. 3 RVG
  const MINDESTBETRAG_KV1100 = 38; // KV 1100 GKG
  const AUSLAGENPAUSCHALE_MAX = 20; // Nr. 7002 VV RVG
  const UST_SATZ = 0.19; // Nr. 7008 VV RVG
  const VERZUGSPAUSCHALE = 40; // § 288 Abs. 5 BGB

  function round2(x) {
    return Math.round((x + Number.EPSILON) * 100) / 100;
  }

  function formatWert(betrag) {
    return betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  function formatFaktor(faktor) {
    return String(faktor).replace('.', ',');
  }

  function wertgebuehr(wert, tabelle) {
    let gebuehr = tabelle.grundbetrag;
    let grenze = tabelle.grundwert;
    for (const stufe of tabelle.stufen) {
      if (wert <= grenze) break;
      const bis = Math.min(wert, stufe.bisWert);
      const schritte = Math.ceil((bis - grenze) / stufe.schritt);
      gebuehr = round2(gebuehr + schritte * stufe.erhoehung);
      grenze = stufe.bisWert;
    }
    return gebuehr;
  }

  const rvgGebuehr = (wert) => wertgebuehr(wert, RVG_TABELLE);
  const gkgGebuehr = (wert) => wertgebuehr(wert, GKG_TABELLE);
  const mahngerichtskosten = (wert) => Math.max(MINDESTBETRAG_KV1100, round2(0.5 * gkgGebuehr(wert)));

  function rvgBetrag(faktor, wert) {
    return Math.max(MINDESTGEBUEHR_RVG, round2(faktor * rvgGebuehr(wert)));
  }

  function auslagenpauschale(gebuehrenSumme) {
    return Math.min(AUSLAGENPAUSCHALE_MAX, round2(gebuehrenSumme * 0.2));
  }

  function baueNebenforderungen(eingaben) {
    const wert = eingaben.gegenstandswert;
    if (typeof wert !== 'number' || !isFinite(wert) || wert <= 0) {
      throw new Error('Gegenstandswert muss eine Zahl größer als 0 sein.');
    }
    const datum = eingaben.datum;
    if (typeof datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
      throw new Error('Datum muss im Format JJJJ-MM-TT vorliegen.');
    }
    const buchungen = [];
    const hinweise = [];
    const wertZusatz = ` (Wert: ${formatWert(wert)})`;
    const buchung = (text, betrag) => {
      if (!Number.isFinite(betrag)) {
        throw new Error(`Gebührenbetrag für „${text}" ist keine gültige Zahl.`);
      }
      if (betrag > 0) buchungen.push({ typ: 'nebenforderung', datum, betrag, text, verzinsung: null });
    };
    const phase = (gebuehren, mitPauschale, mitUst) => {
      const gebuehrenSumme = round2(gebuehren.reduce((s, [, b]) => s + b, 0));
      gebuehren.forEach(([text, betrag]) => buchung(text, betrag));
      let steuerbar = gebuehrenSumme;
      if (mitPauschale && gebuehrenSumme > 0) {
        const pauschale = auslagenpauschale(gebuehrenSumme);
        buchung('Auslagenpauschale Nr. 7002 VV RVG', pauschale);
        steuerbar = round2(steuerbar + pauschale);
      }
      if (mitUst && steuerbar > 0) {
        buchung('19 % USt Nr. 7008 VV RVG', round2(steuerbar * UST_SATZ));
      }
    };

    const v = eingaben.vorgerichtlich || {};
    if (v.aktiv) {
      const faktor = v.faktor;
      if (typeof faktor !== 'number' || !isFinite(faktor) || faktor <= 0) {
        throw new Error('Faktor der Geschäftsgebühr muss eine Zahl größer als 0 sein.');
      }
      if (faktor > 1.3) {
        hinweise.push('Ein Faktor über 1,3 ist nach Anm. zu Nr. 2300 VV RVG nur bei umfangreicher oder schwieriger Tätigkeit zulässig.');
      }
      phase([[`${formatFaktor(faktor)} Geschäftsgebühr Nr. 2300 VV RVG${wertZusatz}`, rvgBetrag(faktor, wert)]],
        v.auslagenpauschale, v.umsatzsteuer);
    }

    const g = eingaben.gerichtlich || {};
    if (g.aktiv) {
      const mahnverfahren = g.verfahrensart === 'mahnverfahren';
      const gebuehren = [];
      if (g.verfahrensgebuehr) {
        let faktor = 1.3;
        let zusatz = '';
        if (g.anrechnung) {
          faktor = round2(1.3 - Math.min(Math.max(g.anrechnungsFaktor || 0, 0) / 2, 0.75));
          zusatz = ' nach Anrechnung gem. Vorbem. 3 Abs. 4 VV RVG';
        }
        gebuehren.push([`${formatFaktor(faktor)} Verfahrensgebühr Nr. 3100 VV RVG${zusatz}${wertZusatz}`, rvgBetrag(faktor, wert)]);
      }
      if (g.terminsgebuehr && !mahnverfahren) {
        gebuehren.push([`1,2 Terminsgebühr Nr. 3104 VV RVG${wertZusatz}`, rvgBetrag(1.2, wert)]);
      }
      phase(gebuehren, g.auslagenpauschale, g.umsatzsteuer);
      if (g.gerichtskosten) {
        if (mahnverfahren) {
          buchung(`Gerichtskosten Mahnverfahren KV 1100 GKG (0,5)${wertZusatz}`, mahngerichtskosten(wert));
        } else {
          buchung(`Gerichtskosten KV 1210 GKG (3,0)${wertZusatz}`, round2(3 * gkgGebuehr(wert)));
        }
      }
    }

    if (eingaben.verzugspauschale) {
      buchung('Verzugspauschale § 288 Abs. 5 BGB', VERZUGSPAUSCHALE);
      hinweise.push('Die Verzugspauschale gilt nur, wenn der Schuldner kein Verbraucher ist, und ist auf Rechtsverfolgungskosten anzurechnen (§ 288 Abs. 5 S. 3 BGB).');
    }

    hinweise.push(`Gebührenstand: ${STAND.quelle} (ab 01.06.2025) — Angaben ohne Gewähr, bitte prüfen.`);
    return { buchungen, hinweise };
  }

  return { STAND, RVG_TABELLE, GKG_TABELLE, wertgebuehr, rvgGebuehr, gkgGebuehr,
    mahngerichtskosten, baueNebenforderungen };
});
