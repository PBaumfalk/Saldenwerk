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
      const letzter = t.length ? t[t.length - 1] : null;
      const letzteGrenze = letzter
        ? (letzter.ab.slice(5) === '01-01' ? letzter.ab.slice(0, 4) + '-06-30'
                                           : letzter.ab.slice(0, 4) + '-12-31')
        : null;
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

  return { addTage, tageKalender, tageBank360, jahresSegmente, istSchaltjahr, round2, heute, zinsSegmente, halbjahresSegmente };
});
