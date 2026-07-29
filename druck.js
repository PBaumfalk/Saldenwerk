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

  return { formatBetragEUR, formatZahl5, formatProzent5 };
});
