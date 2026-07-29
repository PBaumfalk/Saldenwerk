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

    for (const v of ergebnis.verrechnungen) {
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

    const saldozeile = { ...spaltensummen, umsatz: saldo, gesamtsaldo: saldo };
    return { kopf: { kontoName: konto.name, stichtag }, zeilen, saldozeile };
  }

  return { formatBetragEUR, formatZahl5, formatProzent5, istVerzinst, spalteFuerBuchung, verzinsungsZusatz, baueDruckmodell };
});
