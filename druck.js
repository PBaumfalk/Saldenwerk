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

  return { formatBetragEUR, formatZahl5, formatProzent5, istVerzinst, spalteFuerBuchung, verzinsungsZusatz };
});
