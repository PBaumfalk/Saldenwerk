// druck.js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'), require('./basiszins.js'), require('./app.js'));
  } else {
    root.Druck = factory(root.Engine, root.Basiszins, root.AppFormat);
  }
})(typeof self !== 'undefined' ? self : this, function (Engine, Basiszins, AppFormat) {
  const { formatDatum } = AppFormat;

  function formatBetragEUR(n) {
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(n) + ' EUR';
  }
  function formatZahl5(n) {
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 5, maximumFractionDigits: 5 })
      .format(n);
  }
  function formatProzent5(n) { return formatZahl5(n) + '%'; }

  function istVerzinst(verzinsung) {
    return !!(verzinsung && verzinsung.art !== 'keine');
  }

  function tageszinsNach(stichtag, konto, ergebnis, tabelle) {
    const folgetag = Engine.addTage(stichtag, 1);
    const buchungById = new Map((konto.buchungen || []).map((b) => [b.id, b]));
    let summe = 0;
    for (const p of ergebnis.posten) {
      if (p.rest <= 0) continue;
      const b = buchungById.get(p.id);
      const v = b && b.verzinsung;
      if (!istVerzinst(v)) continue;
      if (v.ende && v.ende < folgetag) continue;
      if (v.beginn > folgetag) continue;
      let satz = v.satz;
      if (v.art === 'basiszins') {
        const basis = Basiszins.satzAm(folgetag, tabelle);
        if (basis === null) continue;
        satz = Engine.round2(basis + v.satz);
      }
      const nenner = v.methode === 'bank360' ? 360
        : (Engine.istSchaltjahr(Number(folgetag.slice(0, 4))) ? 366 : 365);
      summe += p.rest * (satz / 100) / nenner;
    }
    return { betragProTag: summe, ab: folgetag };
  }

  function spalteFuerBuchung(b) {
    if (b.typ === 'zahlung') return 'zahlung';
    if (b.typ === 'hauptforderung') return 'hauptforderung';
    if (b.typ === 'zinsforderung') return 'hfZinsen';
    return istVerzinst(b.verzinsung) ? 'verzinslKosten' : 'unverzinslKosten';
  }

  function verzinsungsZusatz(verzinsung, stichtag) {
    if (!istVerzinst(verzinsung)) return null;
    const bis = verzinsung.ende && verzinsung.ende < stichtag ? verzinsung.ende : stichtag;
    const zeitraum = `ab dem ${formatDatum(verzinsung.beginn)} bis zum ${formatDatum(bis)}`;
    if (verzinsung.art === 'basiszins') {
      return `verzinst mit ${formatZahl5(verzinsung.satz)} Prozentpunkten über dem Basiszinssatz gem. § 247 BGB ${zeitraum}`;
    }
    return `verzinst mit ${formatZahl5(verzinsung.satz)} % p. a. ${zeitraum}`;
  }

  const SEITE2_KATEGORIEN = ['hauptforderungen', 'zinsenAufHauptforderungen',
    'verzinslicheKosten', 'kostenzinsen', 'unverzinslicheKosten'];

  function chartPunkte(konto, ergebnis) {
    const deltas = new Map();
    const add = (datum, betrag) => deltas.set(datum, (deltas.get(datum) || 0) + betrag);
    for (const b of (konto.buchungen || []).filter((x) => x.datum <= ergebnis.stichtag)) {
      add(b.datum, b.typ === 'zahlung' ? -b.betrag : b.betrag);
    }
    for (const s of ergebnis.staffel) add(s.bis, s.zins);
    const punkte = [];
    let saldo = 0;
    for (const datum of [...deltas.keys()].sort()) {
      saldo = Engine.round2(saldo + deltas.get(datum));
      punkte.push({ datum, saldo });
    }
    if (punkte.length && punkte[punkte.length - 1].datum < ergebnis.stichtag) {
      punkte.push({ datum: ergebnis.stichtag, saldo });
    }
    return punkte;
  }

  function baueSeite2(konto, ergebnis) {
    const buchungById = new Map((konto.buchungen || []).map((b) => [b.id, b]));
    const leer = () => Object.fromEntries(SEITE2_KATEGORIEN.map((k) => [k, 0]));
    const gesamt = leer();
    const offen = leer();
    const addiere = (ziel, key, wert) => { ziel[key] = Engine.round2(ziel[key] + wert); };

    for (const s of ergebnis.staffel) {
      const p = ergebnis.posten.find((x) => x.id === s.forderungId);
      addiere(gesamt, p && p.typ === 'nebenforderung' ? 'kostenzinsen' : 'zinsenAufHauptforderungen', s.zins);
    }
    for (const p of ergebnis.posten) {
      const b = buchungById.get(p.id);
      const key = p.typ === 'hauptforderung' ? 'hauptforderungen'
        : p.typ === 'zinsforderung' ? 'zinsenAufHauptforderungen'
        : istVerzinst(b && b.verzinsung) ? 'verzinslicheKosten' : 'unverzinslicheKosten';
      addiere(gesamt, key, p.betrag);
      addiere(offen, key, p.rest);
      addiere(offen, p.typ === 'nebenforderung' ? 'kostenzinsen' : 'zinsenAufHauptforderungen', p.zinsOffen);
    }

    const getilgt = leer();
    for (const k of SEITE2_KATEGORIEN) getilgt[k] = Engine.round2(gesamt[k] - offen[k]);
    const summe = (o) => Engine.round2(SEITE2_KATEGORIEN.reduce((s, k) => s + o[k], 0));

    return {
      summen: { ...gesamt, gesamt: summe(gesamt) },
      zahlungen: { ...getilgt, ueberschuss: ergebnis.summen.ueberzahlung, gesamt: ergebnis.summen.zahlungen },
      salden: { ...offen, ueberzahlung: ergebnis.summen.ueberzahlung, gesamt: ergebnis.summen.saldo },
    };
  }

  function baueDruckmodell(konto, ergebnis, tabelle) {
    const stichtag = ergebnis.stichtag;
    const buchungen = (konto.buchungen || [])
      .filter((b) => b.datum <= stichtag)
      .slice()
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 :
        (a.typ === 'zahlung' ? 1 : 0) - (b.typ === 'zahlung' ? 1 : 0)));
    const buchungById = new Map(buchungen.map((b) => [b.id, b]));

    const zeilen = [];
    const spaltensummen = { zahlung: 0, hauptforderung: 0, hfZinsen: 0,
      verzinslKosten: 0, kostenzinsen: 0, unverzinslKosten: 0 };
    let saldo = 0;

    const forderungen = buchungen.filter((b) => b.typ !== 'zahlung');
    let fi = 0;
    const pushForderungenBis = (datum) => {
      while (fi < forderungen.length && (datum === null || forderungen[fi].datum <= datum)) {
        const b = forderungen[fi++];
        const spalte = spalteFuerBuchung(b);
        const betrag = Engine.round2(b.betrag);
        saldo = Engine.round2(saldo + betrag);
        spaltensummen[spalte] = Engine.round2(spaltensummen[spalte] + betrag);
        const zusatz = verzinsungsZusatz(b.verzinsung, stichtag);
        zeilen.push({ art: 'buchung', datum: b.datum,
          text: zusatz ? `${b.text} ${zusatz}` : b.text,
          spalte, betrag, gesamtsaldo: saldo });
      }
    };

    const postenById = new Map(ergebnis.posten.map((p) => [p.id, p]));
    const zinsSpalte = (forderungId) => {
      const p = postenById.get(forderungId);
      return p && p.typ === 'nebenforderung' ? 'kostenzinsen' : 'hfZinsen';
    };

    let offeneSegmente = ergebnis.staffel.slice();
    const pushZinsZeilen = (datum, cutoff) => {
      const faellig = offeneSegmente.filter((s) => cutoff === null || s.bis <= cutoff);
      offeneSegmente = cutoff === null ? [] : offeneSegmente.filter((s) => s.bis > cutoff);
      for (const spalte of ['hfZinsen', 'kostenzinsen']) {
        const segs = faellig.filter((s) => zinsSpalte(s.forderungId) === spalte);
        if (!segs.length) continue;
        const betrag = Engine.round2(segs.reduce((sum, s) => sum + s.zins, 0));
        const von = segs.reduce((min, s) => (s.von < min ? s.von : min), segs[0].von);
        const bis = segs.reduce((max, s) => (s.bis > max ? s.bis : max), segs[0].bis);
        saldo = Engine.round2(saldo + betrag);
        spaltensummen[spalte] = Engine.round2(spaltensummen[spalte] + betrag);
        const wort = spalte === 'kostenzinsen' ? 'Kostenzinsen' : 'Zinsen';
        zeilen.push({ art: 'sammel', datum,
          text: `Aufgelaufene ${wort} vom ${formatDatum(Engine.addTage(von, 1))} bis zum ${formatDatum(bis)}`,
          spalte, betrag, gesamtsaldo: saldo });
        for (const s of segs) {
          const posten = postenById.get(s.forderungId);
          zeilen.push({ art: 'detail', datum: null,
            text: `davon ${formatProzent5(s.satzProzent === null ? 0 : s.satzProzent)} Zinsen aus ` +
              `${formatBetragEUR(s.basis)} ab dem ${formatDatum(Engine.addTage(s.von, 1))} bis zum ` +
              `${formatDatum(s.bis)} (${s.tage} Zinstage) aus „${posten ? posten.text : 'Forderung'}"`,
            spalte, betrag: s.zins, gesamtsaldo: null });
        }
      }
    };

    for (const v of ergebnis.verrechnungen) {
      const cutoff = Engine.addTage(v.datum, -1);
      pushForderungenBis(cutoff);
      pushZinsZeilen(cutoff, cutoff);
      const zahlung = buchungById.get(v.zahlungId);
      pushForderungenBis(v.datum);
      const betrag = Engine.round2(v.betrag);
      saldo = Engine.round2(saldo - betrag);
      spaltensummen.zahlung = Engine.round2(spaltensummen.zahlung + betrag);
      zeilen.push({ art: 'buchung', datum: v.datum,
        text: zahlung ? zahlung.text : 'Zahlung',
        spalte: 'zahlung', betrag, gesamtsaldo: saldo });
    }
    pushForderungenBis(null);
    pushZinsZeilen(stichtag, null);

    const saldozeile = { ...spaltensummen, umsatz: saldo, gesamtsaldo: saldo };
    return { kopf: { kontoName: konto.name, stichtag }, zeilen, saldozeile, tageszins: tageszinsNach(stichtag, konto, ergebnis, tabelle), seite2: baueSeite2(konto, ergebnis), chart: chartPunkte(konto, ergebnis) };
  }

  return { formatBetragEUR, formatZahl5, formatProzent5, istVerzinst, spalteFuerBuchung, verzinsungsZusatz, baueDruckmodell };
});
