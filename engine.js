(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./basiszins.js'));
  else root.Engine = factory(root.Basiszins);
})(typeof self !== 'undefined' ? self : this, function (Basiszins) {
  const TAG_MS = 86400000;
  const d = (s) => new Date(s + 'T00:00:00Z');
  const iso = (x) => x.toISOString().slice(0, 10);

  function addTage(s, n) { const x = d(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); }
  function tageKalender(von, bis) { return Math.round((d(bis) - d(von)) / TAG_MS); }
  function istSchaltjahr(j) { return (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0; }
  function round2(x) { return Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100) / 100; }
  function heute() { return iso(new Date()); }

  function tageBank360(von, bis) {
    const [y1, m1, t1] = von.split('-').map(Number);
    const [y2, m2, t2] = bis.split('-').map(Number);
    return (y2 - y1) * 360 + (m2 - m1) * 30 + (Math.min(t2, 30) - Math.min(t1, 30));
  }

  // Zeitraum (von exkl., bis inkl.] an Jahresgrenzen splitten.
  function jahresSegmente(von, bis) {
    const segs = [];
    let start = von;
    while (start < bis) {
      const jahr = Number(addTage(start, 1).slice(0, 4));
      const jahresEnde = jahr + '-12-31';
      const ende = bis < jahresEnde ? bis : jahresEnde;
      segs.push({ von: start, bis: ende, jahr, tage: tageKalender(start, ende) });
      start = ende;
    }
    return segs;
  }

  // Halbjahresgrenzen (Sätze ab 1.1./1.7.): Grenzen bei JJJJ-12-31 und JJJJ-06-30.
  function halbjahresSegmente(von, bis) {
    const segs = [];
    let start = von;
    while (start < bis) {
      const erster = addTage(start, 1); // erster gezählter Tag
      const jahr = Number(erster.slice(0, 4));
      const grenze = erster <= jahr + '-06-30' ? jahr + '-06-30' : jahr + '-12-31';
      const ende = bis < grenze ? bis : grenze;
      segs.push({ von: start, bis: ende });
      start = ende;
    }
    return segs;
  }

  function zinsSegmente({ basis, von, bis, art, satz, methode, tabelle }) {
    const warnungen = [];
    const segmente = [];
    if (!(bis > von) || !(basis > 0)) return { segmente, summe: 0, warnungen };
    const t = tabelle || Basiszins.TABELLE;

    // Grob-Segmente: je konstantem Satz
    const grob = art === 'basiszins' ? halbjahresSegmente(von, bis) : [{ von, bis }];
    if (art === 'basiszins') {
      const letzteGrenze = Basiszins.deckungsEnde(t);
      if (letzteGrenze && bis > letzteGrenze) {
        warnungen.push('Für Zeiträume nach dem ' + letzteGrenze +
          ' ist noch kein Basiszinssatz hinterlegt – der letzte bekannte Satz wird verwendet.');
      }
    }

    for (const g of grob) {
      let satzProzent = satz;
      let basiszins = null;
      if (art === 'basiszins') {
        basiszins = Basiszins.satzAm(addTage(g.von, 1), t);
        if (basiszins === null) {
          if (!warnungen.some((w) => w.includes('vor Beginn'))) {
            warnungen.push('Zeitraum liegt vor Beginn der Basiszins-Tabelle – Zins wird dort mit 0 angesetzt.');
          }
          segmente.push({ von: g.von, bis: g.bis, tage: tageKalender(g.von, g.bis),
            nenner: null, satzProzent: null, basiszins: null, zins: 0 });
          continue;
        }
        satzProzent = round2(basiszins + satz);
      }
      const fein = methode === 'kalender' ? jahresSegmente(g.von, g.bis)
                                          : [{ von: g.von, bis: g.bis }];
      for (const f of fein) {
        const tage = methode === 'kalender' ? f.tage : tageBank360(f.von, f.bis);
        const nenner = methode === 'kalender' ? (istSchaltjahr(f.jahr) ? 366 : 365) : 360;
        const zins = round2(basis * (satzProzent / 100) * (tage / nenner));
        segmente.push({ von: f.von, bis: f.bis, tage, nenner, satzProzent, basiszins, zins });
      }
    }
    const summe = round2(segmente.reduce((s, x) => s + x.zins, 0));
    return { segmente, summe, warnungen };
  }

  function berechneKonto(konto, stichtag, tabelle) {
    const warnungen = [];
    const staffel = [];
    const verrechnungen = [];
    const alle = (konto.buchungen || []).filter((b) => b.datum <= stichtag);
    const ignorierteBuchungen = (konto.buchungen || []).length - alle.length;

    const posten = alle.filter((b) => b.typ !== 'zahlung').map((b) => {
      const verzinst = b.verzinsung && b.verzinsung.art !== 'keine';
      return {
        buchung: b, rest: round2(b.betrag), zinsOffen: 0,
        abgerechnetBis: verzinst ? addTage(b.verzinsung.beginn, -1) : null,
      };
    });
    const zahlungen = alle.filter((b) => b.typ === 'zahlung');
    const nachDatum = (a, b) => (a.buchung.datum < b.buchung.datum ? -1 : 1);
    const vom = (typ) => posten.filter((p) => p.buchung.typ === typ).sort(nachDatum);

    if (posten.length) {
      const ersteForderung = posten.reduce((min, p) =>
        (p.buchung.datum < min ? p.buchung.datum : min), posten[0].buchung.datum);
      if (zahlungen.some((z) => z.datum < ersteForderung)) {
        warnungen.push('Mindestens eine Zahlung liegt vor der ersten Forderung – bitte Datum prüfen.');
      }
    }

    function accrueBis(ziel) {
      for (const p of posten) {
        if (p.abgerechnetBis === null || p.rest <= 0) continue;
        const v = p.buchung.verzinsung;
        const ende = v.ende && v.ende < ziel ? v.ende : ziel;
        if (ende <= p.abgerechnetBis) continue;
        const r = zinsSegmente({ basis: p.rest, von: p.abgerechnetBis, bis: ende,
          art: v.art, satz: v.satz, methode: v.methode, tabelle });
        for (const s of r.segmente) staffel.push({ forderungId: p.buchung.id, basis: p.rest, ...s });
        for (const w of r.warnungen) if (!warnungen.includes(w)) warnungen.push(w);
        p.zinsOffen = round2(p.zinsOffen + r.summe);
        p.abgerechnetBis = ende;
      }
    }

    let ueberzahlung = 0;
    for (const z of zahlungen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0))) {
      accrueBis(addTage(z.datum, -1));
      let rest = round2(z.betrag);
      const verteilung = [];
      const stufe = (liste, feld) => {
        let sum = 0;
        for (const p of liste) {
          if (rest <= 0) break;
          const offen = p[feld];
          if (offen <= 0) continue;
          const t = Math.min(offen, rest);
          p[feld] = round2(offen - t);
          rest = round2(rest - t);
          sum = round2(sum + t);
          verteilung.push({ forderungId: p.buchung.id, betrag: t, feld });
        }
        return sum;
      };
      const aufKosten = stufe(vom('nebenforderung'), 'rest');
      const zinsStufe = () => round2(stufe(vom('zinsforderung'), 'rest') +
        stufe(posten.filter((p) => p.zinsOffen > 0).sort(nachDatum), 'zinsOffen'));
      // § 497 Abs. 3 BGB (Verbraucherdarlehen): Hauptforderung vor Zinsen
      let aufZinsen, aufHauptforderung;
      if (konto.tilgungsreihenfolge === '497') {
        aufHauptforderung = stufe(vom('hauptforderung'), 'rest');
        aufZinsen = zinsStufe();
      } else {
        aufZinsen = zinsStufe();
        aufHauptforderung = stufe(vom('hauptforderung'), 'rest');
      }
      if (rest > 0) {
        ueberzahlung = round2(ueberzahlung + rest);
        if (!warnungen.some((w) => w.includes('Überzahlung'))) {
          warnungen.push('Überzahlung: Zahlungen übersteigen die offenen Forderungen.');
        }
      }
      verrechnungen.push({ zahlungId: z.id, datum: z.datum, betrag: round2(z.betrag),
        aufKosten, aufZinsen, aufHauptforderung, ueberschuss: rest > 0 ? rest : 0, verteilung });
    }
    accrueBis(stichtag);

    const summe = (typ, feld) => round2(vom(typ).reduce((s, p) =>
      s + (feld === 'gesamt' ? p.buchung.betrag : p.rest), 0));
    const laufendGesamt = round2(staffel.reduce((s, x) => s + x.zins, 0));
    const laufendOffen = round2(posten.reduce((s, p) => s + p.zinsOffen, 0));
    const summen = {
      hauptforderung: { gesamt: summe('hauptforderung', 'gesamt'), offen: summe('hauptforderung', 'offen') },
      nebenforderung: { gesamt: summe('nebenforderung', 'gesamt'), offen: summe('nebenforderung', 'offen') },
      zinsforderung: { gesamt: summe('zinsforderung', 'gesamt'), offen: summe('zinsforderung', 'offen') },
      laufendeZinsen: { gesamt: laufendGesamt, offen: laufendOffen },
      zahlungen: round2(zahlungen.reduce((s, z) => s + z.betrag, 0)),
      ueberzahlung,
      saldo: 0,
    };
    summen.saldo = round2(summen.hauptforderung.offen + summen.nebenforderung.offen +
      summen.zinsforderung.offen + summen.laufendeZinsen.offen - ueberzahlung);

    return {
      stichtag, staffel, verrechnungen, warnungen, ignorierteBuchungen, summen,
      posten: posten.map((p) => ({ id: p.buchung.id, typ: p.buchung.typ, datum: p.buchung.datum,
        text: p.buchung.text, betrag: round2(p.buchung.betrag), rest: p.rest, zinsOffen: p.zinsOffen })),
    };
  }

  return { addTage, tageKalender, tageBank360, jahresSegmente, istSchaltjahr, round2, heute, zinsSegmente, halbjahresSegmente, berechneKonto };
});
