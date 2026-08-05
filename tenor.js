// Antragstext (Tenor) aus Konto und Berechnungsergebnis — für Mahnbescheid/Klageantrag.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./app.js'));
  else root.Tenor = factory(root.AppFormat);
})(typeof self !== 'undefined' ? self : this, function (AppFormat) {
  const { formatEUR, formatDatum, verrechnungsText } = AppFormat;

  function satzKompakt(satz) {
    return String(satz).replace('.', ',');
  }

  function zinsKlausel(verzinsung, stichtag) {
    if (!verzinsung || verzinsung.art === 'keine') return '';
    const zeitraum = verzinsung.ende && verzinsung.ende < stichtag
      ? `vom ${formatDatum(verzinsung.beginn)} bis zum ${formatDatum(verzinsung.ende)}`
      : `seit dem ${formatDatum(verzinsung.beginn)}`;
    if (verzinsung.art === 'basiszins') {
      return ` nebst Zinsen in Höhe von ${satzKompakt(verzinsung.satz)} Prozentpunkten über dem jeweiligen Basiszinssatz ${zeitraum}`;
    }
    return ` nebst Zinsen in Höhe von ${satzKompakt(verzinsung.satz)} % p. a. ${zeitraum}`;
  }

  // Zahlungen auf laufende Zinsen (feld 'zinsOffen') erscheinen bewusst nicht als
  // Abzug — die laufenden Zinsen sind im Antrag unbeziffert.
  function abzugsKlausel(posten, verrechnungen) {
    const teile = [];
    for (const v of verrechnungen) {
      const summe = (v.verteilung || [])
        .filter((e) => e.forderungId === posten.id && e.feld === 'rest')
        .reduce((s, e) => s + e.betrag, 0);
      if (summe > 0) teile.push(`am ${formatDatum(v.datum)} gezahlter ${formatEUR(summe)}`);
    }
    return teile.length ? `, abzüglich ${teile.join(' sowie ')}` : '';
  }

  function tenorText(konto, ergebnis) {
    const buchungById = new Map((konto.buchungen || []).map((b) => [b.id, b]));
    const offene = ergebnis.posten
      .filter((p) => p.rest > 0)
      .slice()
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
    if (!offene.length) return null;

    const schuldner = konto.schuldner ? `die Schuldnerseite ${konto.schuldner}` : 'die Schuldnerseite';
    const glaeubiger = konto.glaeubiger ? `die Gläubigerseite ${konto.glaeubiger}` : 'die Gläubigerseite';
    const kopf = `Es wird beantragt, ${schuldner} zu verurteilen, an ${glaeubiger} zu zahlen:`;

    const punkte = offene.map((p, i) => {
      const buchung = buchungById.get(p.id);
      const zins = zinsKlausel(buchung && buchung.verzinsung, ergebnis.stichtag);
      const abzug = abzugsKlausel(p, ergebnis.verrechnungen);
      let kern;
      if (p.typ === 'nebenforderung') kern = `vorgerichtliche Kosten in Höhe von ${formatEUR(p.betrag)} (${p.text})`;
      else if (p.typ === 'zinsforderung') kern = `ausgerechnete Zinsen in Höhe von ${formatEUR(p.betrag)}`;
      else kern = formatEUR(p.betrag);
      return `${i + 1}. ${kern}${zins}${abzug}`;
    });

    const schluss = `Stand der Berechnung: ${formatDatum(ergebnis.stichtag)}; ${verrechnungsText(konto.tilgungsreihenfolge)}.`;
    return `${kopf}\n\n${punkte.join(',\n\n')}.\n\n${schluss}`;
  }

  return { tenorText };
});
