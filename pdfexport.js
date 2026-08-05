// PDF-Export der Forderungsaufstellung aus dem Druckmodell (jsPDF + autotable).
// Die reinen Konfig-Funktionen sind node-testbar; erzeugePdf braucht window.jspdf.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'), require('./druck.js'), require('./app.js'));
  } else {
    root.Pdfexport = factory(root.Engine, root.Druck, root.AppFormat);
  }
})(typeof self !== 'undefined' ? self : this, function (Engine, Druck, AppFormat) {
  const { formatDatum, verrechnungsText } = AppFormat;

  const SPALTEN = ['zahlung', 'hauptforderung', 'hfZinsen', 'verzinslKosten', 'kostenzinsen', 'unverzinslKosten'];
  const KOPF = ['Datum', 'Bezeichnung', 'Zahlung', 'Hauptforderung', 'HF-Zinsen', 'Verzinsl. Kosten',
    'Kostenzinsen', 'Unverzinsl. Kosten', 'Umsatz', 'Gesamtsaldo'];
  const SPALTEN_PROZENT = [6.5, 26, 8.5, 8.5, 8.5, 8.5, 8.5, 8.5, 8.25, 8.25];

  function baueTabellenKonfig(modell) {
    const body = [];
    const arten = [];
    modell.zeilen.forEach((z) => {
      const zeile = [
        z.datum ? formatDatum(z.datum) : '',
        z.text,
      ];
      SPALTEN.forEach((key) => zeile.push(key === z.spalte ? Druck.formatBetragEUR(z.betrag) : ''));
      zeile.push(Druck.formatBetragEUR(z.spalte === 'zahlung' ? -z.betrag : z.betrag));
      zeile.push(z.gesamtsaldo === null ? '' : Druck.formatBetragEUR(z.gesamtsaldo));
      body.push(zeile);
      arten.push(z.art);
    });
    const saldozeile = [`Saldo per ${formatDatum(modell.kopf.stichtag)}`, ''];
    SPALTEN.forEach((key) => saldozeile.push(Druck.formatBetragEUR(modell.saldozeile[key])));
    saldozeile.push(Druck.formatBetragEUR(modell.saldozeile.umsatz));
    saldozeile.push(Druck.formatBetragEUR(modell.saldozeile.gesamtsaldo));
    body.push(saldozeile);
    arten.push('saldo');
    return { head: KOPF, body, arten, spaltenProzent: SPALTEN_PROZENT };
  }

  const SEITE2_LABELS = [
    ['hauptforderungen', 'Hauptforderungen:'],
    ['zinsenAufHauptforderungen', 'Zinsen auf Hauptforderungen:'],
    ['verzinslicheKosten', 'Verzinsliche Kosten:'],
    ['kostenzinsen', 'Kostenzinsen:'],
    ['unverzinslicheKosten', 'Unverzinsliche Kosten:'],
  ];

  function seite2Block(titel, werte, gesamtLabel, extraZeilen) {
    const zeilen = SEITE2_LABELS.map(([key, label]) => [label, Druck.formatBetragEUR(werte[key])]);
    (extraZeilen || []).forEach(([label, wert]) => zeilen.push([label, Druck.formatBetragEUR(wert)]));
    zeilen.push([gesamtLabel, Druck.formatBetragEUR(werte.gesamt)]);
    return { titel, zeilen };
  }

  function baueSeite2Konfig(modell) {
    const s2 = modell.seite2;
    return {
      titel: `Forderungskonto per ${formatDatum(modell.kopf.stichtag)}`,
      untertitel: `Stand des Forderungskontos per ${formatDatum(modell.kopf.stichtag)}`,
      bloecke: [
        seite2Block('Summen', s2.summen, 'Gesamtsumme:'),
        seite2Block('Zahlungen', s2.zahlungen, 'Summe Zahlungen:',
          s2.zahlungen.ueberschuss > 0 ? [['Überschuss (nicht verrechnet):', s2.zahlungen.ueberschuss]] : []),
        seite2Block('Salden', s2.salden, 'Gesamtsaldo:',
          s2.salden.ueberzahlung > 0 ? [['− Überzahlung:', s2.salden.ueberzahlung]] : []),
      ],
      tageszins: `Tageszins: ${Druck.formatZahl5(modell.tageszins.betragProTag)} EUR ab dem ${formatDatum(modell.tageszins.ab)}`,
    };
  }

  function fusszeilenTexte(modell, erstelltAm) {
    return [
      `Erstellt am ${formatDatum(erstelltAm)}`,
      `Gesamtsaldo: ${Druck.formatBetragEUR(modell.saldozeile.gesamtsaldo)}`,
      `Tageszins: ${Druck.formatZahl5(modell.tageszins.betragProTag)} EUR ab dem ${formatDatum(modell.tageszins.ab)}`,
      verrechnungsText(modell.kopf.tilgungsreihenfolge),
    ];
  }

  function balkenTexte(modell) {
    const teile = [`Forderungskonto: ${modell.kopf.kontoName}`];
    if (modell.kopf.aktenzeichen) teile.push(`Az.: ${modell.kopf.aktenzeichen}`);
    if (modell.kopf.glaeubiger || modell.kopf.schuldner) {
      teile.push(`${modell.kopf.glaeubiger || '–'} ./. ${modell.kopf.schuldner || '–'}`);
    }
    teile.push(`Berechnungsstand: ${formatDatum(modell.kopf.stichtag)}`);
    return teile;
  }

  // Nur im Browser mit geladenem vendor/jspdf nutzbar.
  function erzeugePdf(modell) {
    const jspdf = typeof window !== 'undefined' && window.jspdf;
    if (!jspdf) throw new Error('jsPDF ist nicht geladen.');
    const doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const seitenBreite = doc.internal.pageSize.getWidth();
    const seitenHoehe = doc.internal.pageSize.getHeight();
    const rand = 12;
    const nutzBreite = seitenBreite - 2 * rand;
    const erstelltAm = Engine.heute();
    const fussTexte = fusszeilenTexte(modell, erstelltAm);

    const zeichneFuss = () => {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setDrawColor(150);
      doc.line(rand, seitenHoehe - 10, seitenBreite - rand, seitenHoehe - 10);
      doc.text(fussTexte[0], rand, seitenHoehe - 6);
      doc.text(fussTexte[1], rand + nutzBreite * 0.3, seitenHoehe - 6);
      doc.text(fussTexte[2], rand + nutzBreite * 0.55, seitenHoehe - 6);
      doc.text(fussTexte[3], seitenBreite - rand, seitenHoehe - 6, { align: 'right' });
      doc.setFont('helvetica', 'normal');
    };

    // Seite 1: Titel, Kopfbalken, Warnungen, Tabelle
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`Forderungsaufstellung per ${formatDatum(modell.kopf.stichtag)}`, seitenBreite / 2, rand + 4, { align: 'center' });

    doc.setFontSize(8);
    doc.setFillColor(224, 224, 224);
    doc.rect(rand, rand + 8, nutzBreite, 6, 'F');
    const balken = balkenTexte(modell);
    balken.forEach((text, i) => {
      const x = rand + 2 + (nutzBreite - 4) * (i / Math.max(balken.length - 1, 1));
      doc.text(text, i === balken.length - 1 ? seitenBreite - rand - 2 : x, rand + 12,
        i === balken.length - 1 ? { align: 'right' } : undefined);
    });
    doc.setFont('helvetica', 'normal');

    let startY = rand + 17;
    if (modell.warnungen.length) {
      doc.setFontSize(7);
      const zeilen = modell.warnungen.map((w) => `• ${w}`);
      const hoehe = zeilen.length * 3.4 + 3;
      doc.setDrawColor(0);
      doc.rect(rand, startY, nutzBreite, hoehe);
      zeilen.forEach((z, i) => doc.text(z, rand + 2, startY + 3.5 + i * 3.4));
      startY += hoehe + 2;
    }

    const konfig = baueTabellenKonfig(modell);
    const arten = konfig.arten;
    doc.autoTable({
      head: [konfig.head],
      body: konfig.body,
      startY,
      margin: { left: rand, right: rand, bottom: 14 },
      styles: { font: 'helvetica', fontSize: 6.5, cellPadding: 0.8, overflow: 'linebreak' },
      headStyles: { fillColor: [224, 224, 224], textColor: 0, fontStyle: 'bold', halign: 'center' },
      columnStyles: Object.fromEntries(konfig.spaltenProzent.map((p, i) =>
        [i, { cellWidth: (nutzBreite * p) / 100, halign: i >= 2 ? 'right' : 'left' }])),
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const art = arten[data.row.index];
        if (art === 'detail') {
          data.cell.styles.fontStyle = 'italic';
          data.cell.styles.textColor = [80, 80, 80];
        } else if (art === 'saldo') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [213, 234, 213];
        }
        if (data.column.index === 9 && data.cell.raw) data.cell.styles.fontStyle = 'bold';
      },
      didDrawPage: zeichneFuss,
    });

    // Seite 2: Summenblöcke + Chart
    doc.addPage('a4', 'landscape');
    const s2 = baueSeite2Konfig(modell);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(s2.titel, seitenBreite / 2, rand + 4, { align: 'center' });

    const blockBreite = nutzBreite * 0.38;
    let y = rand + 12;
    doc.setFontSize(9);
    doc.setFillColor(213, 234, 213);
    doc.rect(rand, y, blockBreite, 6, 'F');
    doc.text(s2.untertitel, rand + blockBreite / 2, y + 4, { align: 'center' });
    y += 9;
    doc.setFontSize(8);
    s2.bloecke.forEach((block) => {
      doc.setFont('helvetica', 'bold');
      doc.text(block.titel, rand + 2, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      block.zeilen.forEach(([label, wert], i) => {
        const letzte = i === block.zeilen.length - 1;
        if (letzte) doc.setFont('helvetica', 'bold');
        doc.text(label, rand + 2, y);
        doc.text(wert, rand + blockBreite - 2, y, { align: 'right' });
        if (letzte) doc.setFont('helvetica', 'normal');
        y += 3.8;
      });
      y += 2.5;
    });
    doc.setFont('helvetica', 'bold');
    doc.text(s2.tageszins, rand + 2, y);
    doc.setFont('helvetica', 'normal');

    const geo = Druck.chartGeometrie(modell.chart);
    if (!geo.leer) {
      const chartX = rand + blockBreite + 8;
      const chartBreite = nutzBreite - blockBreite - 8;
      const chartHoehe = chartBreite * (geo.hoehe / geo.breite);
      const chartY = rand + 12;
      const sx = (v) => chartX + (v / geo.breite) * chartBreite;
      const sy = (v) => chartY + (v / geo.hoehe) * chartHoehe;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Salden-Entwicklung', chartX + chartBreite / 2, chartY - 2, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setDrawColor(150);
      geo.yLinien.forEach((l) => {
        doc.line(sx(geo.plot.x), sy(l.y), sx(geo.plot.x + geo.breiteInnen), sy(l.y));
        doc.text(l.label, sx(geo.plot.x - 6), sy(l.y) + 1, { align: 'right' });
      });
      geo.xLinien.forEach((l) => {
        doc.line(sx(l.x), sy(geo.plot.y), sx(l.x), sy(geo.plot.y + geo.hoeheInnen));
        doc.text(l.label, sx(l.x), sy(geo.plot.y + geo.hoeheInnen) + 4, { align: 'center' });
      });
      doc.setDrawColor(51);
      doc.rect(sx(geo.plot.x), sy(geo.plot.y), (geo.breiteInnen / geo.breite) * chartBreite,
        (geo.hoeheInnen / geo.hoehe) * chartHoehe);
      doc.setDrawColor(210, 35, 60);
      doc.setLineWidth(0.5);
      for (let i = 1; i < geo.punkte.length; i++) {
        doc.line(sx(geo.punkte[i - 1].x), sy(geo.punkte[i - 1].y), sx(geo.punkte[i].x), sy(geo.punkte[i].y));
      }
      doc.setLineWidth(0.2);
    }
    zeichneFuss();

    return doc.output('arraybuffer');
  }

  return { baueTabellenKonfig, baueSeite2Konfig, erzeugePdf };
});
