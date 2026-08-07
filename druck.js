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
    const warnungen = [...ergebnis.warnungen];
    if (ergebnis.ignorierteBuchungen > 0) {
      warnungen.push(`${ergebnis.ignorierteBuchungen} Buchung(en) nach dem Stichtag wurden nicht berücksichtigt.`);
    }
    return { kopf: { kontoName: konto.name, stichtag,
      aktenzeichen: konto.aktenzeichen || null,
      glaeubiger: konto.glaeubiger || null,
      schuldner: konto.schuldner || null,
      tilgungsreihenfolge: konto.tilgungsreihenfolge === '497' ? '497' : '367' }, zeilen, saldozeile, warnungen, tageszins: tageszinsNach(stichtag, konto, ergebnis, tabelle), seite2: baueSeite2(konto, ergebnis), chart: chartPunkte(konto, ergebnis) };
  }

  // ---- Chart-Geometrie (gemeinsam für SVG im HTML-Export und PDF-Export) ----

  function chartSchritt(maxWert) {
    const stufen = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
    for (const s of stufen) if (maxWert / s <= 18) return s;
    return Math.pow(10, Math.ceil(Math.log10(maxWert / 18)));
  }

  function chartGeometrie(punkte) {
    const B = 760, H = 460, L = 80, R = 15, T = 15, U = 55;
    const basis = { breite: B, hoehe: H, breiteInnen: B - L - R, hoeheInnen: H - T - U,
      plot: { x: L, y: T } };
    if (!punkte || punkte.length < 2) return { ...basis, leer: true, punkte: [], yLinien: [], xLinien: [] };

    const ms = (iso) => new Date(iso + 'T00:00:00Z').getTime();
    const t0 = ms(punkte[0].datum), t1 = ms(punkte[punkte.length - 1].datum);
    const maxSaldo = Math.max(...punkte.map((p) => p.saldo), 1);
    const minSaldo = Math.min(...punkte.map((p) => p.saldo), 0);
    const schritt = chartSchritt(Math.max(maxSaldo - minSaldo, 1));
    const yMin = Math.floor(minSaldo / schritt) * schritt;
    const yMax = Math.ceil(maxSaldo / schritt) * schritt;
    const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (B - L - R);
    const y = (s) => T + (1 - (s - yMin) / (yMax - yMin)) * (H - T - U);

    const yLinien = [];
    for (let s = yMin; s <= yMax; s += schritt) {
      yLinien.push({ y: y(s), label: new Intl.NumberFormat('de-DE').format(s) });
    }
    const xLinien = [];
    const jahr0 = Number(punkte[0].datum.slice(0, 4));
    const jahr1 = Number(punkte[punkte.length - 1].datum.slice(0, 4));
    for (let jahr = jahr0; jahr <= jahr1; jahr++) {
      const t = ms(`${jahr}-01-01`);
      if (t < t0 || t > t1) continue;
      xLinien.push({ x: x(t), label: String(jahr) });
    }
    return { ...basis, leer: false, yLinien, xLinien,
      punkte: punkte.map((p) => ({ x: x(ms(p.datum)), y: y(p.saldo) })) };
  }

  // ---- Eigenständige HTML-Datei (für Ablage/Upload) ----

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Kopie der Druck-Regeln aus styles.css (Abschnitt „Druckansicht
  // Forderungsaufstellung"). Bewusstes Duplikat: die eigenständige HTML-Datei
  // muss ohne styles.css auskommen (fetch scheitert unter file://).
  // Änderungen an styles.css hier nachziehen.
  const DRUCK_CSS = `
body { margin: 16px; font-family: Helvetica, Arial, sans-serif; font-size: 8.5pt; line-height: 1.35; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.druck-titel { text-align: center; font-size: 12pt; margin: 0 0 10pt; }
.druck-balken { display: flex; justify-content: space-between; background: #e0e0e0; font-weight: 700; padding: 3pt 6pt; margin-bottom: 4pt; }
.druck-hinweise { border: 1pt solid #000; padding: 3pt 6pt; margin-bottom: 4pt; font-size: 8pt; }
.druck-hinweise ul { margin: 0; padding-left: 12pt; }
.druck-tabelle { width: 100%; border-collapse: collapse; table-layout: fixed; }
.druck-tabelle th { background: #e0e0e0; font-weight: 700; text-align: center; padding: 3pt 4pt; }
.druck-tabelle td { padding: 2pt 4pt; vertical-align: top; font-size: 8pt; }
.druck-tabelle .num { text-align: right; white-space: nowrap; }
.druck-tabelle .druck-text { overflow-wrap: break-word; }
.druck-zeile--detail { font-style: italic; color: #333; }
.druck-zeile--sammel td, .druck-zeile--buchung td { border-top: 0.5pt solid #ccc; }
.druck-saldo, .druck-saldozeile { font-weight: 700; }
.druck-saldozeile td { background: #d5ead5; border-top: 1pt solid #000; padding: 3pt 4pt; }
.druck-fusszeile { display: flex; justify-content: space-between; font-style: italic; margin-top: 8pt; padding-top: 4pt; border-top: 0.5pt solid #999; }
.druck-seite--zwei { break-before: page; }
.druck-seite2-layout { display: flex; gap: 16pt; align-items: flex-start; }
.druck-uebersicht { flex: 0 0 38%; background: #ececec; padding: 0 0 8pt; }
.druck-uebersicht__titel { background: #d5ead5; font-weight: 700; text-align: center; padding: 3pt 6pt; margin-bottom: 6pt; }
.druck-summenblock { padding: 0 8pt; margin-bottom: 8pt; }
.druck-summenblock h3 { font-size: 9pt; margin: 6pt 0 3pt; }
.druck-summenzeile { display: flex; justify-content: space-between; padding: 1pt 0; }
.druck-summenzeile--gesamt { font-weight: 700; border-top: 0.5pt solid #999; margin-top: 2pt; padding-top: 2pt; }
.druck-uebersicht__tageszins { font-weight: 700; padding: 0 8pt; margin: 4pt 0 0; }
.druck-chartbox { flex: 1 1 auto; }
.druck-chartbox__titel { text-align: center; font-size: 10pt; margin: 0 0 4pt; }
.druck-chart { width: 100%; height: auto; }
@page { size: A4 landscape; margin: 12mm; }
@media print { .druck-tabelle tr { break-inside: avoid; } }
`;

  const HTML_SPALTEN = ['zahlung', 'hauptforderung', 'hfZinsen', 'verzinslKosten', 'kostenzinsen', 'unverzinslKosten'];
  const HTML_SPALTEN_LABELS = ['Zahlung', 'Hauptforderung', 'HF-Zinsen', 'Verzinsl. Kosten',
    'Kostenzinsen', 'Unverzinsl. Kosten'];

  function chartSvgString(punkte) {
    const g = chartGeometrie(punkte);
    if (g.leer) return '';
    const teile = [`<svg viewBox="0 0 ${g.breite} ${g.hoehe}" class="druck-chart" role="img" aria-label="Salden-Entwicklung" xmlns="http://www.w3.org/2000/svg">`];
    g.yLinien.forEach((l) => {
      teile.push(`<line x1="${g.plot.x}" y1="${l.y}" x2="${g.plot.x + g.breiteInnen}" y2="${l.y}" stroke="#999" stroke-width="0.5" stroke-dasharray="3 3"/>`);
      teile.push(`<text x="${g.plot.x - 6}" y="${l.y + 3}" text-anchor="end" font-size="11">${escapeHtml(l.label)}</text>`);
    });
    g.xLinien.forEach((l) => {
      teile.push(`<line x1="${l.x}" y1="${g.plot.y}" x2="${l.x}" y2="${g.plot.y + g.hoeheInnen}" stroke="#999" stroke-width="0.5" stroke-dasharray="3 3"/>`);
      teile.push(`<text x="${l.x}" y="${g.plot.y + g.hoeheInnen + 16}" text-anchor="middle" font-size="11">${escapeHtml(l.label)}</text>`);
    });
    teile.push(`<rect x="${g.plot.x}" y="${g.plot.y}" width="${g.breiteInnen}" height="${g.hoeheInnen}" fill="none" stroke="#333" stroke-width="0.75"/>`);
    teile.push(`<polyline points="${g.punkte.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#d2233c" stroke-width="1.5"/>`);
    teile.push('</svg>');
    return teile.join('');
  }

  function htmlFusszeile(modell, erstelltAm) {
    const { verrechnungsText } = AppFormat;
    return `<div class="druck-fusszeile"><span>Erstellt am ${escapeHtml(formatDatum(erstelltAm))}</span>` +
      `<span>Gesamtsaldo: ${escapeHtml(formatBetragEUR(modell.saldozeile.gesamtsaldo))}</span>` +
      `<span>Tageszins: ${escapeHtml(formatZahl5(modell.tageszins.betragProTag))} EUR ab dem ${escapeHtml(formatDatum(modell.tageszins.ab))}</span>` +
      `<span>${escapeHtml(verrechnungsText(modell.kopf.tilgungsreihenfolge))}</span></div>`;
  }

  function htmlSummenBlock(titel, werte, gesamtLabel, extraZeilen) {
    const labels = [
      ['hauptforderungen', 'Hauptforderungen:'],
      ['zinsenAufHauptforderungen', 'Zinsen auf Hauptforderungen:'],
      ['verzinslicheKosten', 'Verzinsliche Kosten:'],
      ['kostenzinsen', 'Kostenzinsen:'],
      ['unverzinslicheKosten', 'Unverzinsliche Kosten:'],
    ];
    const zeilen = labels.map(([key, label]) =>
      `<div class="druck-summenzeile"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatBetragEUR(werte[key]))}</span></div>`);
    (extraZeilen || []).forEach(([label, wert]) => {
      zeilen.push(`<div class="druck-summenzeile"><span>${escapeHtml(label)}</span><span>${escapeHtml(formatBetragEUR(wert))}</span></div>`);
    });
    zeilen.push(`<div class="druck-summenzeile druck-summenzeile--gesamt"><span>${escapeHtml(gesamtLabel)}</span><span>${escapeHtml(formatBetragEUR(werte.gesamt))}</span></div>`);
    return `<div class="druck-summenblock"><h3>${escapeHtml(titel)}</h3>${zeilen.join('')}</div>`;
  }

  function druckHtml(modell, erstelltAm) {
    const heute = erstelltAm || Engine.heute();
    const titel = `Forderungsaufstellung per ${formatDatum(modell.kopf.stichtag)}`;

    const balken = [`<span>Forderungskonto: ${escapeHtml(modell.kopf.kontoName)}</span>`];
    if (modell.kopf.aktenzeichen) balken.push(`<span>Az.: ${escapeHtml(modell.kopf.aktenzeichen)}</span>`);
    if (modell.kopf.glaeubiger || modell.kopf.schuldner) {
      balken.push(`<span>${escapeHtml(modell.kopf.glaeubiger || '–')} ./. ${escapeHtml(modell.kopf.schuldner || '–')}</span>`);
    }
    balken.push(`<span>Berechnungsstand: ${escapeHtml(formatDatum(modell.kopf.stichtag))}</span>`);

    const hinweise = modell.warnungen.length
      ? `<div class="druck-hinweise"><ul>${modell.warnungen.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`
      : '';

    const colgroup = '<colgroup>' + [6.5, 26, 8.5, 8.5, 8.5, 8.5, 8.5, 8.5, 8.25, 8.25]
      .map((p) => `<col style="width:${p}%">`).join('') + '</colgroup>';
    const kopfzeile = '<tr>' + ['Datum', 'Buchungstext', ...HTML_SPALTEN_LABELS, 'Umsatz', 'Gesamtsaldo']
      .map((l) => `<th>${escapeHtml(l)}</th>`).join('') + '</tr>';
    const zeilen = modell.zeilen.map((z) => {
      const zellen = [
        `<td class="druck-datum">${z.datum ? escapeHtml(formatDatum(z.datum)) : ''}</td>`,
        `<td class="druck-text">${escapeHtml(z.text)}</td>`,
      ];
      HTML_SPALTEN.forEach((key) => {
        zellen.push(`<td class="num">${key === z.spalte ? escapeHtml(formatBetragEUR(z.betrag)) : ''}</td>`);
      });
      zellen.push(`<td class="num">${escapeHtml(formatBetragEUR(z.spalte === 'zahlung' ? -z.betrag : z.betrag))}</td>`);
      zellen.push(`<td class="num druck-saldo">${z.gesamtsaldo === null ? '' : escapeHtml(formatBetragEUR(z.gesamtsaldo))}</td>`);
      return `<tr class="druck-zeile druck-zeile--${z.art}">${zellen.join('')}</tr>`;
    });
    const saldozellen = [
      `<td>Saldo per ${escapeHtml(formatDatum(modell.kopf.stichtag))}</td>`, '<td></td>',
      ...HTML_SPALTEN.map((key) => `<td class="num">${escapeHtml(formatBetragEUR(modell.saldozeile[key]))}</td>`),
      `<td class="num">${escapeHtml(formatBetragEUR(modell.saldozeile.umsatz))}</td>`,
      `<td class="num">${escapeHtml(formatBetragEUR(modell.saldozeile.gesamtsaldo))}</td>`,
    ];
    const seite1 = `<section class="druck-seite"><h1 class="druck-titel">${escapeHtml(titel)}</h1>` +
      `<div class="druck-balken">${balken.join('')}</div>${hinweise}` +
      `<table class="druck-tabelle">${colgroup}<thead>${kopfzeile}</thead><tbody>${zeilen.join('')}` +
      `<tr class="druck-saldozeile">${saldozellen.join('')}</tr></tbody></table>` +
      htmlFusszeile(modell, heute) + '</section>';

    const s2 = modell.seite2;
    const uebersicht = `<div class="druck-uebersicht">` +
      `<div class="druck-uebersicht__titel">Stand des Forderungskontos per ${escapeHtml(formatDatum(modell.kopf.stichtag))}</div>` +
      htmlSummenBlock('Summen', s2.summen, 'Gesamtsumme:') +
      htmlSummenBlock('Zahlungen', s2.zahlungen, 'Summe Zahlungen:',
        s2.zahlungen.ueberschuss > 0 ? [['Überschuss (nicht verrechnet):', s2.zahlungen.ueberschuss]] : []) +
      htmlSummenBlock('Salden', s2.salden, 'Gesamtsaldo:',
        s2.salden.ueberzahlung > 0 ? [['− Überzahlung:', s2.salden.ueberzahlung]] : []) +
      `<p class="druck-uebersicht__tageszins">Tageszins: ${escapeHtml(formatZahl5(modell.tageszins.betragProTag))} EUR ab dem ${escapeHtml(formatDatum(modell.tageszins.ab))}</p></div>`;
    const seite2 = `<section class="druck-seite druck-seite--zwei">` +
      `<h1 class="druck-titel">Forderungskonto per ${escapeHtml(formatDatum(modell.kopf.stichtag))}</h1>` +
      `<div class="druck-seite2-layout">${uebersicht}` +
      `<div class="druck-chartbox"><h3 class="druck-chartbox__titel">Salden-Entwicklung</h3>${chartSvgString(modell.chart)}</div></div>` +
      htmlFusszeile(modell, heute) + '</section>';

    return `<!DOCTYPE html>\n<html lang="de"><head><meta charset="UTF-8">` +
      `<title>${escapeHtml(titel)} – ${escapeHtml(modell.kopf.kontoName)}</title>` +
      `<style>${DRUCK_CSS}</style></head><body>${seite1}${seite2}</body></html>`;
  }

  return { formatBetragEUR, formatZahl5, formatProzent5, istVerzinst, spalteFuerBuchung, verzinsungsZusatz, baueDruckmodell, chartGeometrie, druckHtml };
});
