// Antragstext (Tenor) aus Konto und Berechnungsergebnis — für Mahnbescheid/Klageantrag.
//
// Grundsatz: Der Antrag darf nie mehr verlangen, als das Konto ausweist. Zwei
// Fälle, in denen er das früher tat, sind hier ausdrücklich behandelt:
//
// 1. Wurde eine Zahlung nach § 367 BGB auf die laufenden Zinsen verrechnet,
//    reicht es nicht, sie zu verschweigen und die Zinsklausel unverändert
//    "seit dem <Verzugsbeginn>" laufen zu lassen — ein Gericht spräche dann
//    auch die bereits bezahlten Zinsen zu. Der Zinslauf wird deshalb geteilt:
//    ein bezifferter Betrag für die Zeit bis zur Zahlung, und die unbezifferte
//    Klausel setzt erst am Zahlungstag an.
// 2. Unter § 497 Abs. 3 BGB werden die Zinsen zuletzt getilgt. Ist die
//    Hauptforderung ausgeglichen, während Zinsen offen sind, hat kein Posten
//    mehr `rest > 0` — früher kam dann gar kein Antrag zustande.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./app.js'), require('./engine.js'));
  } else {
    root.Tenor = factory(root.AppFormat, root.Engine);
  }
})(typeof self !== 'undefined' ? self : this, function (AppFormat, Engine) {
  const { formatEUR, formatDatum, verrechnungsText } = AppFormat;

  function satzKompakt(satz) {
    return String(satz).replace('.', ',');
  }

  // Zinssatz ohne Zeitraum — für Einschübe und reine Zinsposten.
  function satzText(verzinsung) {
    return verzinsung.art === 'basiszins'
      ? `${satzKompakt(verzinsung.satz)} Prozentpunkte über dem jeweiligen Basiszinssatz`
      : `${satzKompakt(verzinsung.satz)} % p. a.`;
  }

  // `beginnAb` verschiebt den Klauselbeginn nach einer Zahlung auf die Zinsen;
  // `einleitung` ist „nebst" oder — hinter einem Einschub — „sowie nebst".
  function zinsKlausel(verzinsung, stichtag, beginnAb, einleitung) {
    if (!verzinsung || verzinsung.art === 'keine') return '';
    const beginn = beginnAb || verzinsung.beginn;
    const zeitraum = verzinsung.ende && verzinsung.ende < stichtag
      ? `vom ${formatDatum(beginn)} bis zum ${formatDatum(verzinsung.ende)}`
      : `seit dem ${formatDatum(beginn)}`;
    const satz = verzinsung.art === 'basiszins'
      ? `${satzKompakt(verzinsung.satz)} Prozentpunkten über dem jeweiligen Basiszinssatz`
      : `${satzKompakt(verzinsung.satz)} % p. a.`;
    return ` ${einleitung} Zinsen in Höhe von ${satz} ${zeitraum}`;
  }

  // Zahlungen auf die Forderung selbst (feld 'rest').
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

  // Zahlungen auf die laufenden Zinsen dieses Postens (feld 'zinsOffen').
  // Maßgeblich ist die letzte davon: Bis zu ihrem Vortag ist der Zinslauf
  // abgerechnet, ab ihrem Datum läuft er weiter.
  function zinsZahlungen(postenId, verrechnungen) {
    let summe = 0;
    let letztes = null;
    for (const v of verrechnungen) {
      const teil = (v.verteilung || [])
        .filter((e) => e.forderungId === postenId && e.feld === 'zinsOffen')
        .reduce((s, e) => s + e.betrag, 0);
      if (teil > 0) {
        summe = Engine.round2(summe + teil);
        letztes = v.datum;
      }
    }
    return { summe, letztes };
  }

  function zinsenBis(postenId, staffel, bis) {
    return Engine.round2(staffel
      .filter((s) => s.forderungId === postenId && s.bis <= bis)
      .reduce((s, x) => s + x.zins, 0));
  }

  function letzterZinstag(postenId, staffel) {
    let bis = null;
    for (const s of staffel) if (s.forderungId === postenId) bis = s.bis;
    return bis;
  }

  // Posten, dessen Forderung getilgt ist, dessen Zinsen aber offen sind.
  // Der Betrag steht fest — es läuft nichts mehr auf.
  function nurZinsenPunkt(posten, verzinsung, ergebnis) {
    const bis = letzterZinstag(posten.id, ergebnis.staffel);
    const herkunft = verzinsung && verzinsung.art !== 'keine' && bis
      ? ` (${satzText(verzinsung)} aus ${formatEUR(posten.betrag)}` +
        ` vom ${formatDatum(verzinsung.beginn)} bis zum ${formatDatum(bis)})`
      : '';
    return `ausgerechnete Zinsen in Höhe von ${formatEUR(posten.zinsOffen)}${herkunft}`;
  }

  function offenerPunkt(posten, verzinsung, ergebnis) {
    const zahlung = zinsZahlungen(posten.id, ergebnis.verrechnungen);
    const verzinst = verzinsung && verzinsung.art !== 'keine';

    let einschub = '';
    let beginnAb = null;
    let einleitung = 'nebst';
    let laeuftWeiter = true;

    if (verzinst && zahlung.summe > 0) {
      const grenze = Engine.addTage(zahlung.letztes, -1);
      const rest = Engine.round2(zinsenBis(posten.id, ergebnis.staffel, grenze) - zahlung.summe);
      const letzter = letzterZinstag(posten.id, ergebnis.staffel);
      // Endete die Verzinsung bereits vor der Zahlung, gibt es keinen
      // laufenden Zins mehr — dann trägt der Einschub den ganzen Zeitraum.
      laeuftWeiter = Boolean(letzter) && letzter > grenze;
      beginnAb = zahlung.letztes;
      if (rest > 0) {
        const bis = laeuftWeiter ? grenze : letzter || grenze;
        einschub = ` nebst ausgerechneter Zinsen von ${formatEUR(rest)}` +
          ` für die Zeit vom ${formatDatum(verzinsung.beginn)} bis zum ${formatDatum(bis)}` +
          ` (abzüglich am ${formatDatum(zahlung.letztes)} hierauf gezahlter ${formatEUR(zahlung.summe)})`;
        einleitung = 'sowie nebst';
      }
    }

    let kern;
    if (posten.typ === 'nebenforderung') {
      kern = `vorgerichtliche Kosten in Höhe von ${formatEUR(posten.betrag)} (${posten.text})`;
    } else if (posten.typ === 'zinsforderung') {
      kern = `ausgerechnete Zinsen in Höhe von ${formatEUR(posten.betrag)}`;
    } else {
      kern = formatEUR(posten.betrag);
    }

    const zins = laeuftWeiter ? zinsKlausel(verzinsung, ergebnis.stichtag, beginnAb, einleitung) : '';
    return `${kern}${einschub}${zins}${abzugsKlausel(posten, ergebnis.verrechnungen)}`;
  }

  function tenorText(konto, ergebnis) {
    const buchungById = new Map((konto.buchungen || []).map((b) => [b.id, b]));
    // Auch Posten aufnehmen, deren Forderung getilgt ist, auf die aber noch
    // Zinsen offen sind — unter § 497 Abs. 3 BGB ist das der Regelfall.
    const offene = ergebnis.posten
      .filter((p) => p.rest > 0 || p.zinsOffen > 0)
      .slice()
      .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
    if (!offene.length) return null;

    const schuldner = konto.schuldner ? `die Schuldnerseite ${konto.schuldner}` : 'die Schuldnerseite';
    const glaeubiger = konto.glaeubiger ? `die Gläubigerseite ${konto.glaeubiger}` : 'die Gläubigerseite';
    const kopf = `Es wird beantragt, ${schuldner} zu verurteilen, an ${glaeubiger} zu zahlen:`;

    const punkte = offene.map((p, i) => {
      const verzinsung = (buchungById.get(p.id) || {}).verzinsung;
      const rumpf = p.rest > 0
        ? offenerPunkt(p, verzinsung, ergebnis)
        : nurZinsenPunkt(p, verzinsung, ergebnis);
      return `${i + 1}. ${rumpf}`;
    });

    const schluss = `Stand der Berechnung: ${formatDatum(ergebnis.stichtag)}; ${verrechnungsText(konto.tilgungsreihenfolge)}.`;
    return `${kopf}\n\n${punkte.join(',\n\n')}.\n\n${schluss}`;
  }

  return { tenorText };
});
