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

  return { addTage, tageKalender, tageBank360, jahresSegmente, istSchaltjahr, round2, heute };
});
