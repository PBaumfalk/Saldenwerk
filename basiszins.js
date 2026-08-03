(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Basiszins = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TABELLE = [
    { ab: '2002-01-01', satz: 2.57 }, { ab: '2002-07-01', satz: 2.47 },
    { ab: '2003-01-01', satz: 1.97 }, { ab: '2003-07-01', satz: 1.22 },
    { ab: '2004-01-01', satz: 1.14 }, { ab: '2004-07-01', satz: 1.13 },
    { ab: '2005-01-01', satz: 1.21 }, { ab: '2005-07-01', satz: 1.17 },
    { ab: '2006-01-01', satz: 1.37 }, { ab: '2006-07-01', satz: 1.95 },
    { ab: '2007-01-01', satz: 2.70 }, { ab: '2007-07-01', satz: 3.19 },
    { ab: '2008-01-01', satz: 3.32 }, { ab: '2008-07-01', satz: 3.19 },
    { ab: '2009-01-01', satz: 1.62 }, { ab: '2009-07-01', satz: 0.12 },
    { ab: '2010-01-01', satz: 0.12 }, { ab: '2010-07-01', satz: 0.12 },
    { ab: '2011-01-01', satz: 0.12 }, { ab: '2011-07-01', satz: 0.37 },
    { ab: '2012-01-01', satz: 0.12 }, { ab: '2012-07-01', satz: 0.12 },
    { ab: '2013-01-01', satz: -0.13 }, { ab: '2013-07-01', satz: -0.38 },
    { ab: '2014-01-01', satz: -0.63 }, { ab: '2014-07-01', satz: -0.73 },
    { ab: '2015-01-01', satz: -0.83 }, { ab: '2015-07-01', satz: -0.83 },
    { ab: '2016-01-01', satz: -0.83 }, { ab: '2016-07-01', satz: -0.88 },
    { ab: '2017-01-01', satz: -0.88 }, { ab: '2017-07-01', satz: -0.88 },
    { ab: '2018-01-01', satz: -0.88 }, { ab: '2018-07-01', satz: -0.88 },
    { ab: '2019-01-01', satz: -0.88 }, { ab: '2019-07-01', satz: -0.88 },
    { ab: '2020-01-01', satz: -0.88 }, { ab: '2020-07-01', satz: -0.88 },
    { ab: '2021-01-01', satz: -0.88 }, { ab: '2021-07-01', satz: -0.88 },
    { ab: '2022-01-01', satz: -0.88 }, { ab: '2022-07-01', satz: -0.88 },
    { ab: '2023-01-01', satz: 1.62 }, { ab: '2023-07-01', satz: 3.12 },
    { ab: '2024-01-01', satz: 3.62 }, { ab: '2024-07-01', satz: 3.37 },
    { ab: '2025-01-01', satz: 2.27 }, { ab: '2025-07-01', satz: 1.27 },
    { ab: '2026-01-01', satz: 1.27 }, { ab: '2026-07-01', satz: 1.52 },
  ];

  function satzAm(datum, tabelle) {
    const t = tabelle || TABELLE;
    let gefunden = null;
    for (const e of t) {
      if (e.ab <= datum) gefunden = e.satz; else break;
    }
    return gefunden;
  }

  function deckungsEnde(tabelle) {
    if (!tabelle || !tabelle.length) return null;
    const letzter = tabelle[tabelle.length - 1];
    return letzter.ab.slice(5) === '01-01'
      ? letzter.ab.slice(0, 4) + '-06-30'
      : letzter.ab.slice(0, 4) + '-12-31';
  }

  function mitOverrides(overrides) {
    const map = new Map(TABELLE.map((e) => [e.ab, e.satz]));
    for (const o of overrides || []) map.set(o.ab, o.satz);
    return [...map.entries()]
      .map(([ab, satz]) => ({ ab, satz }))
      .sort((a, b) => (a.ab < b.ab ? -1 : 1));
  }

  return { TABELLE, satzAm, deckungsEnde, mitOverrides };
});
