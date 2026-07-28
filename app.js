(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AppFormat = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function formatEUR(n) {
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(n) + ' €';
  }
  function parseBetrag(s) {
    if (typeof s !== 'string' || !s.trim()) return null;
    let t = s.trim().replace(/\s|€/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
    return Number(t);
  }
  function formatDatum(isoStr) {
    const [j, m, t] = isoStr.split('-');
    return `${t}.${m}.${j}`;
  }
  function parseDatum(s) {
    if (typeof s !== 'string' || !s) return null;
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    let j, mo, t;
    if (m) { [, j, mo, t] = m; }
    else {
      m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
      if (!m) return null;
      [, t, mo, j] = m;
    }
    const iso = `${j}-${String(mo).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
    const d = new Date(iso + 'T00:00:00Z');
    return d.toISOString().slice(0, 10) === iso ? iso : null;
  }

  const EXPORT_BUCHUNG_TYPEN = ['hauptforderung', 'nebenforderung', 'zinsforderung', 'zahlung'];
  const EXPORT_VERZINSUNG_ARTEN = ['fest', 'basiszins'];
  const EXPORT_VERZINSUNG_METHODEN = ['kalender', 'bank360'];

  function verzinsungFehlerText(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object' || Array.isArray(v)) {
      return 'Feld „verzinsung" hat ein ungültiges Format.';
    }
    if (v.art === 'keine') return null;
    if (!EXPORT_VERZINSUNG_ARTEN.includes(v.art)) {
      return `Verzinsungsart „${v.art}" ist unbekannt.`;
    }
    if (typeof v.satz !== 'number' || !isFinite(v.satz)) {
      return 'Zinssatz der Verzinsung ist keine gültige Zahl.';
    }
    const beginn = parseDatum(v.beginn);
    if (!beginn) {
      return 'Verzinsungsbeginn fehlt oder ist ungültig.';
    }
    if (v.ende !== null && v.ende !== undefined) {
      const ende = parseDatum(v.ende);
      if (!ende) {
        return 'Verzinsungsende ist ungültig.';
      }
      if (ende < beginn) {
        return 'Das Ende der Verzinsung darf nicht vor dem Beginn liegen.';
      }
    }
    if (!EXPORT_VERZINSUNG_METHODEN.includes(v.methode)) {
      return `Zinsmethode „${v.methode}" ist unbekannt.`;
    }
    return null;
  }

  function validiereExport(objekt) {
    if (!objekt || typeof objekt !== 'object' || Array.isArray(objekt)) {
      return { ok: false, fehler: 'Die Datei enthält kein gültiges JSON-Objekt.' };
    }
    if (objekt.version !== 1) {
      return { ok: false, fehler: 'Unbekannte oder fehlende Versionsnummer (erwartet: 1).' };
    }
    if (!Array.isArray(objekt.konten)) {
      return { ok: false, fehler: 'Das Feld „konten" fehlt oder ist keine Liste.' };
    }
    for (let i = 0; i < objekt.konten.length; i++) {
      const konto = objekt.konten[i];
      const bezeichnung = `Konto ${i + 1}`;
      if (!konto || typeof konto !== 'object') {
        return { ok: false, fehler: `${bezeichnung}: ungültiges Format.` };
      }
      if (typeof konto.name !== 'string') {
        return { ok: false, fehler: `${bezeichnung}: Feld „name" fehlt oder ist kein Text.` };
      }
      if (!Array.isArray(konto.buchungen)) {
        return { ok: false, fehler: `${bezeichnung} („${konto.name}"): Feld „buchungen" fehlt oder ist keine Liste.` };
      }
      for (let j = 0; j < konto.buchungen.length; j++) {
        const b = konto.buchungen[j];
        const buchungsBezeichnung = `${bezeichnung} („${konto.name}"), Buchung ${j + 1}`;
        if (!b || typeof b !== 'object') {
          return { ok: false, fehler: `${buchungsBezeichnung}: ungültiges Format.` };
        }
        if (!EXPORT_BUCHUNG_TYPEN.includes(b.typ)) {
          return { ok: false, fehler: `${buchungsBezeichnung}: unbekannter Buchungstyp „${b.typ}".` };
        }
        if (!parseDatum(b.datum)) {
          return { ok: false, fehler: `${buchungsBezeichnung}: ungültiges Datum.` };
        }
        if (typeof b.betrag !== 'number' || !isFinite(b.betrag) || b.betrag <= 0) {
          return { ok: false, fehler: `${buchungsBezeichnung}: Betrag muss eine Zahl größer als 0 sein.` };
        }
        const verzinsungFehler = verzinsungFehlerText(b.verzinsung);
        if (verzinsungFehler) {
          return { ok: false, fehler: `${buchungsBezeichnung}: ${verzinsungFehler}` };
        }
      }
    }
    return { ok: true, fehler: null, konten: objekt.konten };
  }

  return { formatEUR, parseBetrag, formatDatum, parseDatum, validiereExport };
});

if (typeof document !== 'undefined') {
(function () {
  const { formatEUR, parseBetrag, formatDatum, parseDatum, validiereExport } = window.AppFormat;
  const STORAGE_KEY = 'forderungskonto.v1';

  const App = {
    state: { konten: [], aktivesKontoId: null, basiszinsOverrides: [] },

    speichern() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(App.state));
      } catch (e) {
        console.error('Speichern fehlgeschlagen', e);
      }
    },

    laden() {
      const roh = localStorage.getItem(STORAGE_KEY);
      if (!roh) return;
      try {
        const daten = JSON.parse(roh);
        App.state.konten = Array.isArray(daten.konten) ? daten.konten : [];
        App.state.aktivesKontoId = daten.aktivesKontoId || null;
        App.state.basiszinsOverrides = Array.isArray(daten.basiszinsOverrides) ? daten.basiszinsOverrides : [];
      } catch (e) {
        App.state = { konten: [], aktivesKontoId: null, basiszinsOverrides: [] };
        ladeFehlerRohdaten = roh;
      }
    },

    aktivesKonto() {
      return App.state.konten.find((k) => k.id === App.state.aktivesKontoId) || null;
    },

    zeigeAnsicht(name) {
      if ((name === 'buchungen' || name === 'report') && !App.aktivesKonto()) {
        zeigeHinweis('Bitte zuerst ein Konto öffnen.');
        name = 'konten';
      }
      document.querySelectorAll('.view').forEach((el) => {
        el.classList.toggle('active', el.id === 'view-' + name);
      });
      document.querySelectorAll('.appnav__btn').forEach((btn) => {
        const aktiv = btn.getAttribute('data-view') === name;
        btn.classList.toggle('active', aktiv);
        if (aktiv) btn.setAttribute('aria-current', 'page');
        else btn.removeAttribute('aria-current');
      });
      if (name === 'konten') renderKontenListe();
      if (name === 'buchungen') {
        const k = App.aktivesKonto();
        if (k) document.getElementById('kontoName').value = k.name;
        App.renderBuchungen?.();
      }
      if (name === 'report') App.renderReport?.();
      if (name === 'basiszins') App.renderBasiszins?.();
    },

    bestaetige(text, cb) {
      const dialog = document.getElementById('confirmDialog');
      const okBtn = document.getElementById('confirmOk');
      const abbrechenBtn = document.getElementById('confirmAbbrechen');
      document.getElementById('confirmText').textContent = text;

      let bestaetigt = false;
      function onOk() { bestaetigt = true; dialog.close(); }
      function onAbbrechen() { dialog.close(); }
      function onClose() {
        okBtn.removeEventListener('click', onOk);
        abbrechenBtn.removeEventListener('click', onAbbrechen);
        dialog.removeEventListener('close', onClose);
        if (bestaetigt) cb();
      }
      okBtn.addEventListener('click', onOk);
      abbrechenBtn.addEventListener('click', onAbbrechen);
      dialog.addEventListener('close', onClose);
      dialog.showModal();
    },
  };

  let ladeFehlerRohdaten = null;

  function zeigeHinweis(text) {
    window.alert(text);
  }

  function renderLadeFehler(container) {
    if (!ladeFehlerRohdaten) return;
    const box = document.createElement('div');
    box.className = 'karte';
    box.innerHTML =
      '<p><strong>Gespeicherte Daten konnten nicht gelesen werden.</strong> ' +
      'Die App startet mit einem leeren Zustand, damit nichts überschrieben wird.</p>';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--sekundaer';
    btn.textContent = 'Rohdaten sichern';
    btn.addEventListener('click', () => {
      const blob = new Blob([ladeFehlerRohdaten], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'forderungskonto-rohdaten.json';
      a.click();
      URL.revokeObjectURL(url);
    });
    box.appendChild(btn);
    container.appendChild(box);
  }

  function neueBuchungenTiefkopie(buchungen) {
    return buchungen.map((b) => {
      const kopie = JSON.parse(JSON.stringify(b));
      kopie.id = crypto.randomUUID();
      return kopie;
    });
  }

  function ladeExportDatei(daten, dateiname) {
    const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dateiname;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportiereKonto(konto) {
    ladeExportDatei({ version: 1, konten: [konto] }, `forderungskonto-${konto.name}.json`);
  }

  function exportiereAlleKonten() {
    ladeExportDatei({ version: 1, konten: App.state.konten }, `forderungskonten-${Engine.heute()}.json`);
  }

  function kontenMeldungElement() {
    let el = document.getElementById('kontenMeldung');
    if (!el) {
      el = document.createElement('div');
      el.id = 'kontenMeldung';
      el.className = 'fehlerbereich';
      el.setAttribute('role', 'status');
      document.querySelector('#view-konten .werkzeugleiste').insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function zeigeKontenMeldung(text, istFehler) {
    const el = kontenMeldungElement();
    el.textContent = text;
    el.classList.toggle('fehlerbereich--erfolg', !istFehler);
  }

  function importiereDatei(datei) {
    const reader = new FileReader();
    reader.onload = () => {
      let objekt;
      try {
        objekt = JSON.parse(reader.result);
      } catch (e) {
        zeigeKontenMeldung('Die Datei enthält kein gültiges JSON.', true);
        return;
      }
      const ergebnis = validiereExport(objekt);
      if (!ergebnis.ok) {
        zeigeKontenMeldung(ergebnis.fehler, true);
        return;
      }
      const importierteKonten = ergebnis.konten.map((konto) => ({
        id: crypto.randomUUID(),
        name: konto.name,
        createdAt: (typeof konto.createdAt === 'string' && parseDatum(konto.createdAt)) || Engine.heute(),
        updatedAt: Engine.heute(),
        buchungen: neueBuchungenTiefkopie(konto.buchungen),
      }));
      App.state.konten.push(...importierteKonten);
      App.speichern();
      renderKontenListe();
      zeigeKontenMeldung(`${importierteKonten.length} Konten importiert.`, false);
    };
    reader.onerror = () => {
      zeigeKontenMeldung('Die Datei konnte nicht gelesen werden.', true);
    };
    reader.readAsText(datei);
  }

  function renderKontenListe() {
    const container = document.getElementById('kontenListe');
    container.innerHTML = '';
    renderLadeFehler(container);
    App.state.konten.forEach((konto) => {
      const karte = document.createElement('div');
      karte.className = 'karte';

      const titel = document.createElement('h3');
      titel.textContent = konto.name;
      karte.appendChild(titel);

      const info = document.createElement('p');
      info.className = 'hinweistext';
      info.textContent = `${konto.buchungen.length} Buchung(en) · geändert am ${formatDatum(konto.updatedAt)}`;
      karte.appendChild(info);

      const aktionen = document.createElement('div');
      aktionen.className = 'werkzeugleiste';

      const btnOeffnen = document.createElement('button');
      btnOeffnen.type = 'button';
      btnOeffnen.className = 'btn btn--primaer';
      btnOeffnen.textContent = 'Öffnen';
      btnOeffnen.addEventListener('click', () => {
        App.state.aktivesKontoId = konto.id;
        App.speichern();
        App.zeigeAnsicht('buchungen');
      });

      const btnDuplizieren = document.createElement('button');
      btnDuplizieren.type = 'button';
      btnDuplizieren.className = 'btn btn--sekundaer';
      btnDuplizieren.textContent = 'Duplizieren';
      btnDuplizieren.addEventListener('click', () => {
        const kopie = {
          id: crypto.randomUUID(),
          name: konto.name + ' (Kopie)',
          createdAt: Engine.heute(),
          updatedAt: Engine.heute(),
          buchungen: neueBuchungenTiefkopie(konto.buchungen),
        };
        App.state.konten.push(kopie);
        App.speichern();
        renderKontenListe();
      });

      const btnLoeschen = document.createElement('button');
      btnLoeschen.type = 'button';
      btnLoeschen.className = 'btn btn--gefahr';
      btnLoeschen.textContent = 'Löschen';
      btnLoeschen.addEventListener('click', () => {
        App.bestaetige(`Konto „${konto.name}" wirklich löschen?`, () => {
          App.state.konten = App.state.konten.filter((k) => k.id !== konto.id);
          if (App.state.aktivesKontoId === konto.id) App.state.aktivesKontoId = null;
          App.speichern();
          renderKontenListe();
        });
      });

      const btnExportieren = document.createElement('button');
      btnExportieren.type = 'button';
      btnExportieren.className = 'btn btn--sekundaer';
      btnExportieren.textContent = 'Exportieren';
      btnExportieren.addEventListener('click', () => exportiereKonto(konto));

      aktionen.append(btnOeffnen, btnDuplizieren, btnExportieren, btnLoeschen);
      karte.appendChild(aktionen);
      container.appendChild(karte);
    });
  }

  function initNavigation() {
    document.querySelectorAll('.appnav__btn').forEach((btn) => {
      btn.addEventListener('click', () => App.zeigeAnsicht(btn.getAttribute('data-view')));
    });
  }

  function initKontenAnsicht() {
    document.getElementById('btnNeuesKonto').addEventListener('click', () => {
      const konto = {
        id: crypto.randomUUID(),
        name: 'Neues Forderungskonto',
        createdAt: Engine.heute(),
        updatedAt: Engine.heute(),
        buchungen: [],
      };
      App.state.konten.push(konto);
      App.state.aktivesKontoId = konto.id;
      App.speichern();
      App.zeigeAnsicht('buchungen');
    });

    document.getElementById('btnExportAlle').addEventListener('click', () => {
      exportiereAlleKonten();
    });

    const importInput = document.getElementById('importDatei');
    importInput.addEventListener('change', () => {
      const datei = importInput.files[0];
      importInput.value = '';
      if (datei) importiereDatei(datei);
    });
  }

  function initKontoName() {
    const eingabe = document.getElementById('kontoName');
    eingabe.addEventListener('input', () => {
      const konto = App.aktivesKonto();
      if (!konto) return;
      konto.name = eingabe.value.slice(0, 80);
      konto.updatedAt = Engine.heute();
      App.speichern();
    });
  }

  const TYP_LABEL = {
    hauptforderung: 'Hauptforderung',
    nebenforderung: 'Nebenforderung',
    zinsforderung: 'Zinsforderung',
    zahlung: 'Zahlung',
  };

  App.aktuelleTabelle = function () {
    return Basiszins.mitOverrides(App.state.basiszinsOverrides || []);
  };

  let dialogTyp = null;
  let dialogBuchungId = null;
  let fBeginnManuell = false;

  function buchungDialogFelder() {
    return {
      dialog: document.getElementById('buchungDialog'),
      titel: document.querySelector('#buchungDialog .dialog__titel'),
      fVerzinsung: document.getElementById('fVerzinsung'),
      fDatum: document.getElementById('fDatum'),
      fBetrag: document.getElementById('fBetrag'),
      fText: document.getElementById('fText'),
      fArt: document.getElementById('fArt'),
      fSatzLabel: document.getElementById('fSatzLabel'),
      fSatz: document.getElementById('fSatz'),
      fBeginn: document.getElementById('fBeginn'),
      fEnde: document.getElementById('fEnde'),
      fMethode: document.getElementById('fMethode'),
      fFehler: document.getElementById('fFehler'),
    };
  }

  function aktualisiereArtSichtbarkeit() {
    const f = buchungDialogFelder();
    const versteckt = f.fArt.value === 'keine';
    f.fSatz.closest('.feld').hidden = versteckt;
    f.fBeginn.closest('.feld-gruppe').hidden = versteckt;
    f.fMethode.closest('.feld').hidden = versteckt;
    f.fSatzLabel.textContent = f.fArt.value === 'basiszins'
      ? 'Prozentpunkte über Basiszins'
      : 'Zinssatz (% p.a.)';
  }

  App.oeffneBuchungDialog = function (typ, buchungId) {
    const f = buchungDialogFelder();
    const konto = App.aktivesKonto();
    if (!konto) return;

    dialogTyp = typ;
    dialogBuchungId = buchungId || null;
    fBeginnManuell = false;
    f.fFehler.textContent = '';
    f.titel.textContent = TYP_LABEL[typ] || typ;
    f.fVerzinsung.hidden = !(typ === 'hauptforderung' || typ === 'nebenforderung');

    const buchung = buchungId ? konto.buchungen.find((b) => b.id === buchungId) : null;

    if (buchung) {
      f.fDatum.value = buchung.datum;
      f.fBetrag.value = formatEUR(buchung.betrag).replace(' €', '');
      f.fText.value = buchung.text;
      fBeginnManuell = true;
      if (buchung.verzinsung && buchung.verzinsung.art !== 'keine') {
        f.fArt.value = buchung.verzinsung.art;
        f.fSatz.value = formatEUR(buchung.verzinsung.satz).replace(' €', '');
        f.fBeginn.value = buchung.verzinsung.beginn;
        f.fEnde.value = buchung.verzinsung.ende || '';
        f.fMethode.value = buchung.verzinsung.methode;
      } else {
        f.fArt.value = 'keine';
        f.fSatz.value = '';
        f.fBeginn.value = buchung.datum;
        f.fEnde.value = '';
        f.fMethode.value = 'kalender';
      }
    } else {
      const heute = Engine.heute();
      f.fDatum.value = heute;
      f.fBetrag.value = '';
      f.fText.value = '';
      f.fArt.value = 'keine';
      f.fSatz.value = '';
      f.fBeginn.value = heute;
      f.fEnde.value = '';
      f.fMethode.value = 'kalender';
    }

    aktualisiereArtSichtbarkeit();
    f.dialog.showModal();
  };

  function validiereBuchungDialog() {
    const f = buchungDialogFelder();
    const fehler = [];

    if (!f.fDatum.value || !parseDatum(f.fDatum.value)) {
      fehler.push('Bitte ein gültiges Datum angeben.');
    }
    const betrag = parseBetrag(f.fBetrag.value);
    if (betrag === null || betrag <= 0) {
      fehler.push('Bitte einen Betrag größer als 0 angeben.');
    }
    if (!f.fVerzinsung.hidden && f.fArt.value !== 'keine') {
      const satz = parseBetrag(f.fSatz.value);
      if (satz === null) fehler.push('Bitte einen gültigen Zinssatz angeben.');
      if (!f.fBeginn.value || !parseDatum(f.fBeginn.value)) {
        fehler.push('Bitte einen gültigen Verzinsungsbeginn angeben.');
      }
      if (f.fEnde.value && f.fBeginn.value && f.fEnde.value < f.fBeginn.value) {
        fehler.push('Das Ende der Verzinsung darf nicht vor dem Beginn liegen.');
      }
    }
    return fehler;
  }

  function speichereBuchungDialog() {
    const f = buchungDialogFelder();
    const konto = App.aktivesKonto();
    if (!konto) return;

    const betrag = parseBetrag(f.fBetrag.value);
    let verzinsung = null;
    if (!f.fVerzinsung.hidden) {
      if (f.fArt.value === 'keine') {
        verzinsung = { art: 'keine' };
      } else {
        verzinsung = {
          art: f.fArt.value,
          satz: parseBetrag(f.fSatz.value),
          beginn: f.fBeginn.value,
          ende: f.fEnde.value || null,
          methode: f.fMethode.value,
        };
      }
    }

    if (dialogBuchungId) {
      const buchung = konto.buchungen.find((b) => b.id === dialogBuchungId);
      buchung.datum = f.fDatum.value;
      buchung.betrag = betrag;
      buchung.text = f.fText.value.trim();
      buchung.verzinsung = verzinsung;
    } else {
      konto.buchungen.push({
        id: crypto.randomUUID(),
        typ: dialogTyp,
        datum: f.fDatum.value,
        betrag,
        text: f.fText.value.trim(),
        verzinsung,
      });
    }
    konto.updatedAt = Engine.heute();
    App.speichern();
    App.renderBuchungen();
  }

  App.renderBuchungen = function () {
    const konto = App.aktivesKonto();
    const body = document.getElementById('buchungenBody');
    const saldoZeile = document.getElementById('buchungenSaldo');
    body.innerHTML = '';
    saldoZeile.innerHTML = '';
    if (!konto) return;

    const buchungen = konto.buchungen
      .map((b, i) => ({ b, i }))
      .sort((x, y) => (x.b.datum < y.b.datum ? -1 : x.b.datum > y.b.datum ? 1 : x.i - y.i))
      .map((x) => x.b);

    const ergebnis = Engine.berechneKonto(konto, Engine.heute(), App.aktuelleTabelle());
    const postenById = new Map(ergebnis.posten.map((p) => [p.id, p]));

    buchungen.forEach((b) => {
      const tr = document.createElement('tr');

      const tdDatum = document.createElement('td');
      tdDatum.textContent = formatDatum(b.datum);
      tr.appendChild(tdDatum);

      const tdText = document.createElement('td');
      tdText.textContent = b.text;
      tr.appendChild(tdText);

      const tdTyp = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'badge' + (b.typ === 'zahlung' ? ' badge--zahlung' : '');
      badge.textContent = TYP_LABEL[b.typ] || b.typ;
      tdTyp.appendChild(badge);
      tr.appendChild(tdTyp);

      const istZahlung = b.typ === 'zahlung';
      const tdBetrag = document.createElement('td');
      tdBetrag.className = 'num';
      tdBetrag.textContent = formatEUR(istZahlung ? -Math.abs(b.betrag) : b.betrag);
      if (istZahlung) tdBetrag.classList.add('zahlung', 'betrag--zahlung');
      tr.appendChild(tdBetrag);

      const posten = postenById.get(b.id);

      const tdZinsen = document.createElement('td');
      tdZinsen.className = 'num';
      tdZinsen.textContent = posten ? formatEUR(posten.zinsOffen) : '–';
      tr.appendChild(tdZinsen);

      const tdRest = document.createElement('td');
      tdRest.className = 'num';
      tdRest.textContent = posten ? formatEUR(posten.rest) : '–';
      tr.appendChild(tdRest);

      const tdAktionen = document.createElement('td');
      tdAktionen.className = 'aktionen-spalte';
      const btnBearbeiten = document.createElement('button');
      btnBearbeiten.type = 'button';
      btnBearbeiten.className = 'btn-icon';
      btnBearbeiten.textContent = '✎';
      btnBearbeiten.setAttribute('aria-label', 'Buchung bearbeiten');
      btnBearbeiten.addEventListener('click', () => App.oeffneBuchungDialog(b.typ, b.id));
      const btnLoeschen = document.createElement('button');
      btnLoeschen.type = 'button';
      btnLoeschen.className = 'btn-icon';
      btnLoeschen.textContent = '🗑';
      btnLoeschen.setAttribute('aria-label', 'Buchung löschen');
      btnLoeschen.addEventListener('click', () => {
        App.bestaetige(`Buchung „${b.text}" wirklich löschen?`, () => {
          konto.buchungen = konto.buchungen.filter((x) => x.id !== b.id);
          konto.updatedAt = Engine.heute();
          App.speichern();
          App.renderBuchungen();
        });
      });
      tdAktionen.append(btnBearbeiten, btnLoeschen);
      tr.appendChild(tdAktionen);

      body.appendChild(tr);
    });

    const tdLabel = document.createElement('td');
    tdLabel.colSpan = 5;
    tdLabel.textContent = 'Saldo heute';
    const tdSaldo = document.createElement('td');
    tdSaldo.className = 'num betrag--offen';
    tdSaldo.textContent = formatEUR(ergebnis.summen.saldo);
    const tdLeer = document.createElement('td');
    saldoZeile.append(tdLabel, tdSaldo, tdLeer);
  };

  function formatProzent(n) {
    if (n === null || n === undefined) return '–';
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      .format(n) + ' %';
  }

  function formatPP(n) {
    return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(n) + ' PP';
  }

  function reportKopfZeile(spalten) {
    const tr = document.createElement('tr');
    spalten.forEach(({ label, klasse }) => {
      const th = document.createElement('th');
      th.scope = 'col';
      if (klasse) th.className = klasse;
      th.textContent = label;
      tr.appendChild(th);
    });
    return tr;
  }

  function reportZeile(zellen) {
    const tr = document.createElement('tr');
    zellen.forEach(({ text, klasse, colSpan }) => {
      const td = document.createElement('td');
      if (klasse) td.className = klasse;
      if (colSpan) td.colSpan = colSpan;
      td.textContent = text;
      tr.appendChild(td);
    });
    return tr;
  }

  function baueReportTabelle(spalten) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tabellen-wrapper report-tabelle';
    const table = document.createElement('table');
    table.className = 'tabelle tabelle--report';
    const thead = document.createElement('thead');
    thead.appendChild(reportKopfZeile(spalten));
    const tbody = document.createElement('tbody');
    const tfoot = document.createElement('tfoot');
    tfoot.className = 'report-tabelle__fuss';
    table.append(thead, tbody, tfoot);
    wrapper.appendChild(table);
    return { wrapper, tbody, tfoot };
  }

  const REPORT_ROEMISCH = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

  function reportAbschnittsUeberschrift(titel, zaehler) {
    zaehler.n += 1;
    const h2 = document.createElement('h2');
    h2.className = 'report-abschnitt__titel';
    const nummer = document.createElement('span');
    nummer.className = 'report-abschnitt__nummer';
    nummer.textContent = `${REPORT_ROEMISCH[zaehler.n - 1] || zaehler.n}.`;
    const titelSpan = document.createElement('span');
    titelSpan.textContent = titel;
    h2.append(nummer, titelSpan);
    return h2;
  }

  function renderReportKopf(container, konto, ergebnis) {
    const kopf = document.createElement('div');
    kopf.className = 'report-kopf';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'report-kopf__eyebrow';
    eyebrow.textContent = 'Saldenaufstellung';
    const h2 = document.createElement('h2');
    h2.className = 'report-kopf__name';
    h2.textContent = konto.name;
    const meta = document.createElement('p');
    meta.className = 'report-kopf__meta';
    meta.textContent = `Stichtag: ${formatDatum(ergebnis.stichtag)} · erstellt am ${formatDatum(Engine.heute())}`;
    kopf.append(eyebrow, h2, meta);
    container.appendChild(kopf);
  }

  function renderReportWarnungen(container, ergebnis) {
    const meldungen = [...ergebnis.warnungen];
    if (ergebnis.ignorierteBuchungen > 0) {
      meldungen.push(`${ergebnis.ignorierteBuchungen} Buchung(en) nach dem Stichtag wurden nicht berücksichtigt.`);
    }
    if (!meldungen.length) return;
    const box = document.createElement('div');
    box.className = 'report-hinweisbox';
    const ul = document.createElement('ul');
    meldungen.forEach((text) => {
      const li = document.createElement('li');
      li.textContent = text;
      ul.appendChild(li);
    });
    box.appendChild(ul);
    container.appendChild(box);
  }

  const REPORT_FORDERUNGS_TYPEN = [
    { typ: 'hauptforderung', label: 'Hauptforderung' },
    { typ: 'nebenforderung', label: 'Nebenforderung' },
    { typ: 'zinsforderung', label: 'Zinsforderung' },
  ];

  function renderReportForderungen(container, ergebnis, zaehler) {
    const typenMitPosten = REPORT_FORDERUNGS_TYPEN.filter(({ typ }) =>
      ergebnis.posten.some((p) => p.typ === typ));
    if (!typenMitPosten.length) return;

    const section = document.createElement('section');
    section.className = 'report-abschnitt';
    section.appendChild(reportAbschnittsUeberschrift('Forderungsaufstellung', zaehler));

    typenMitPosten.forEach(({ typ, label }) => {
      const posten = ergebnis.posten.filter((p) => p.typ === typ);
      const gruppe = document.createElement('div');
      gruppe.className = 'report-teilgruppe';
      const h3 = document.createElement('h3');
      h3.textContent = label;
      gruppe.appendChild(h3);

      const { wrapper, tbody, tfoot } = baueReportTabelle([
        { label: 'Datum' }, { label: 'Text' },
        { label: 'Betrag', klasse: 'num' }, { label: 'Offen', klasse: 'num' },
      ]);
      posten.forEach((p) => {
        tbody.appendChild(reportZeile([
          { text: formatDatum(p.datum) },
          { text: p.text },
          { text: formatEUR(p.betrag), klasse: 'num' },
          { text: formatEUR(p.rest), klasse: 'num' },
        ]));
      });
      const summe = ergebnis.summen[typ];
      tfoot.appendChild(reportZeile([
        { text: 'Zwischensumme', colSpan: 2 },
        { text: formatEUR(summe.gesamt), klasse: 'num' },
        { text: formatEUR(summe.offen), klasse: 'num' },
      ]));
      gruppe.appendChild(wrapper);
      section.appendChild(gruppe);
    });
    container.appendChild(section);
  }

  function renderReportStaffel(container, ergebnis, zaehler) {
    if (!ergebnis.staffel.length) return;
    const postenById = new Map(ergebnis.posten.map((p) => [p.id, p]));
    const gruppen = new Map();
    ergebnis.staffel.forEach((seg) => {
      if (!gruppen.has(seg.forderungId)) gruppen.set(seg.forderungId, []);
      gruppen.get(seg.forderungId).push(seg);
    });

    const section = document.createElement('section');
    section.className = 'report-abschnitt';
    section.appendChild(reportAbschnittsUeberschrift('Zinsstaffel', zaehler));

    const reihenfolge = [...gruppen.keys()].sort((a, b) => {
      const pa = postenById.get(a), pb = postenById.get(b);
      if (!pa || !pb) return 0;
      return pa.datum < pb.datum ? -1 : pa.datum > pb.datum ? 1 : 0;
    });

    reihenfolge.forEach((forderungId) => {
      const posten = postenById.get(forderungId);
      const segmente = gruppen.get(forderungId);
      const gruppe = document.createElement('div');
      gruppe.className = 'report-staffel-gruppe';
      const h3 = document.createElement('h3');
      h3.textContent = posten ? `${posten.text} (${formatDatum(posten.datum)})` : 'Forderung';
      gruppe.appendChild(h3);

      const { wrapper, tbody } = baueReportTabelle([
        { label: 'Zeitraum' }, { label: 'Tage', klasse: 'num' }, { label: 'Basis', klasse: 'num' },
        { label: 'Satz', klasse: 'num' }, { label: 'Zins', klasse: 'num' },
      ]);
      segmente.forEach((seg) => {
        let satzText = formatProzent(seg.satzProzent);
        if (seg.basiszins !== null) {
          const aufschlag = Engine.round2(seg.satzProzent - seg.basiszins);
          satzText += ` (Basiszins ${formatProzent(seg.basiszins)} + ${formatPP(aufschlag)})`;
        }
        tbody.appendChild(reportZeile([
          { text: `${formatDatum(Engine.addTage(seg.von, 1))}–${formatDatum(seg.bis)}` },
          { text: String(seg.tage), klasse: 'num' },
          { text: formatEUR(seg.basis), klasse: 'num' },
          { text: satzText, klasse: 'num' },
          { text: formatEUR(seg.zins), klasse: 'num' },
        ]));
      });
      gruppe.appendChild(wrapper);
      section.appendChild(gruppe);
    });

    const summe = document.createElement('p');
    summe.className = 'report-summenzeile';
    summe.textContent = `Summe laufende Zinsen: ${formatEUR(ergebnis.summen.laufendeZinsen.gesamt)}`;
    section.appendChild(summe);
    container.appendChild(section);
  }

  function renderReportZahlungen(container, ergebnis, zaehler) {
    if (!ergebnis.verrechnungen.length) return;
    const section = document.createElement('section');
    section.className = 'report-abschnitt';
    section.appendChild(reportAbschnittsUeberschrift('Zahlungen & Verrechnung', zaehler));

    const { wrapper, tbody } = baueReportTabelle([
      { label: 'Datum' }, { label: 'Betrag', klasse: 'num' }, { label: 'Kosten', klasse: 'num' },
      { label: 'Zinsen', klasse: 'num' }, { label: 'Hauptforderung', klasse: 'num' },
      { label: 'Überschuss', klasse: 'num' },
    ]);
    ergebnis.verrechnungen.forEach((v) => {
      tbody.appendChild(reportZeile([
        { text: formatDatum(v.datum) },
        { text: formatEUR(v.betrag), klasse: 'num' },
        { text: formatEUR(v.aufKosten), klasse: 'num' },
        { text: formatEUR(v.aufZinsen), klasse: 'num' },
        { text: formatEUR(v.aufHauptforderung), klasse: 'num' },
        { text: formatEUR(v.ueberschuss), klasse: 'num' },
      ]));
    });
    section.appendChild(wrapper);
    container.appendChild(section);
  }

  function renderReportEndsaldo(container, ergebnis, zaehler) {
    const s = ergebnis.summen;
    const section = document.createElement('section');
    section.className = 'report-abschnitt';
    section.appendChild(reportAbschnittsUeberschrift('Endsaldo', zaehler));

    const box = document.createElement('div');
    box.className = 'report-endsaldo';
    const zeilen = [
      ['Offene Hauptforderung', s.hauptforderung.offen],
      ['Offene Nebenforderung', s.nebenforderung.offen],
      ['Offene Zinsforderung', s.zinsforderung.offen],
      ['Offene laufende Zinsen', s.laufendeZinsen.offen],
    ];
    if (s.ueberzahlung > 0) {
      zeilen.push(['− Überzahlung', -s.ueberzahlung]);
    }
    zeilen.forEach(([label, wert]) => {
      const zeile = document.createElement('div');
      zeile.className = 'report-endsaldo__zeile';
      const spanLabel = document.createElement('span');
      spanLabel.textContent = label;
      const spanWert = document.createElement('span');
      spanWert.textContent = formatEUR(wert);
      zeile.append(spanLabel, spanWert);
      box.appendChild(zeile);
    });

    const gesamt = document.createElement('div');
    gesamt.className = 'report-endsaldo__zeile report-endsaldo__gesamt';
    const spanLabel = document.createElement('span');
    spanLabel.textContent = 'Gesamtsaldo zum Stichtag';
    const spanWert = document.createElement('span');
    spanWert.textContent = formatEUR(s.saldo);
    gesamt.append(spanLabel, spanWert);
    box.appendChild(gesamt);

    section.appendChild(box);
    container.appendChild(section);
  }

  App.renderReport = function () {
    const konto = App.aktivesKonto();
    const container = document.getElementById('reportInhalt');
    container.innerHTML = '';
    if (!konto) return;

    const stichtagInput = document.getElementById('reportStichtag');
    if (!stichtagInput.value) stichtagInput.value = Engine.heute();
    const stichtag = parseDatum(stichtagInput.value) || Engine.heute();

    if (!konto.buchungen.length) {
      renderReportKopf(container, konto, { stichtag });
      const hinweis = document.createElement('p');
      hinweis.className = 'hinweistext';
      hinweis.textContent = 'Für dieses Konto sind noch keine Buchungen erfasst.';
      container.appendChild(hinweis);
      return;
    }

    const ergebnis = Engine.berechneKonto(konto, stichtag, App.aktuelleTabelle());
    const zaehler = { n: 0 };

    renderReportKopf(container, konto, ergebnis);
    renderReportWarnungen(container, ergebnis);
    renderReportForderungen(container, ergebnis, zaehler);
    renderReportStaffel(container, ergebnis, zaehler);
    renderReportZahlungen(container, ergebnis, zaehler);
    renderReportEndsaldo(container, ergebnis, zaehler);
  };

  function initReportAnsicht() {
    const input = document.getElementById('reportStichtag');
    input.value = Engine.heute();
    input.addEventListener('change', () => App.renderReport());
    document.getElementById('btnDrucken').addEventListener('click', () => window.print());
  }

  function basiszinsFehlerElement() {
    let el = document.getElementById('basiszinsFehler');
    if (!el) {
      el = document.createElement('div');
      el.id = 'basiszinsFehler';
      el.className = 'fehlerbereich';
      el.setAttribute('role', 'alert');
      document.getElementById('basiszinsForm').insertAdjacentElement('afterend', el);
    }
    return el;
  }

  App.renderBasiszins = function () {
    const body = document.getElementById('basiszinsBody');
    body.innerHTML = '';
    const overrides = App.state.basiszinsOverrides || [];
    const overrideAbs = new Set(overrides.map((o) => o.ab));
    const eintraege = Basiszins.mitOverrides(overrides)
      .slice()
      .sort((a, b) => (a.ab < b.ab ? 1 : a.ab > b.ab ? -1 : 0));

    eintraege.forEach((eintrag) => {
      const tr = document.createElement('tr');

      const tdAb = document.createElement('td');
      tdAb.textContent = formatDatum(eintrag.ab);
      tr.appendChild(tdAb);

      const tdSatz = document.createElement('td');
      tdSatz.className = 'num';
      tdSatz.textContent = formatProzent(eintrag.satz);
      tr.appendChild(tdSatz);

      const tdAktionen = document.createElement('td');
      tdAktionen.className = 'aktionen-spalte';

      const istOverride = overrideAbs.has(eintrag.ab);
      const badge = document.createElement('span');
      badge.className = 'badge' + (istOverride ? ' badge--zahlung' : '');
      badge.textContent = istOverride ? 'angepasst' : 'eingebaut';
      tdAktionen.appendChild(badge);

      if (istOverride) {
        const btnZuruecksetzen = document.createElement('button');
        btnZuruecksetzen.type = 'button';
        btnZuruecksetzen.className = 'btn btn--sekundaer';
        btnZuruecksetzen.textContent = 'Zurücksetzen';
        btnZuruecksetzen.addEventListener('click', () => {
          App.state.basiszinsOverrides = (App.state.basiszinsOverrides || [])
            .filter((o) => o.ab !== eintrag.ab);
          App.speichern();
          App.renderBasiszins();
        });
        tdAktionen.appendChild(btnZuruecksetzen);
      }

      tr.appendChild(tdAktionen);
      body.appendChild(tr);
    });
  };

  function istHalbjahresStichtag(iso) {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return false;
    const [, monat, tag] = m;
    return (monat === '01' && tag === '01') || (monat === '07' && tag === '01');
  }

  function initBasiszinsAnsicht() {
    const abInput = document.getElementById('basiszinsAb');
    const satzInput = document.getElementById('basiszinsSatz');
    document.getElementById('basiszinsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fehlerEl = basiszinsFehlerElement();
      fehlerEl.textContent = '';

      const ab = parseDatum(abInput.value);
      const satz = parseBetrag(satzInput.value);
      const fehler = [];
      if (!ab) {
        fehler.push('Bitte ein gültiges Datum angeben.');
      } else if (!istHalbjahresStichtag(ab)) {
        fehler.push('Das Datum muss der 1. Januar oder 1. Juli eines Jahres sein.');
      }
      if (satz === null) {
        fehler.push('Bitte einen gültigen Zinssatz angeben.');
      }
      if (fehler.length) {
        fehlerEl.textContent = fehler.join(' ');
        return;
      }

      const overrides = (App.state.basiszinsOverrides || []).filter((o) => o.ab !== ab);
      overrides.push({ ab, satz });
      App.state.basiszinsOverrides = overrides;
      App.speichern();
      abInput.value = '';
      satzInput.value = '';
      App.renderBasiszins();
    });
  }

  function initBuchungenAnsicht() {
    document.getElementById('btnNeuHF').addEventListener('click', () => App.oeffneBuchungDialog('hauptforderung'));
    document.getElementById('btnNeuNF').addEventListener('click', () => App.oeffneBuchungDialog('nebenforderung'));
    document.getElementById('btnNeuZF').addEventListener('click', () => App.oeffneBuchungDialog('zinsforderung'));
    document.getElementById('btnNeuZahlung').addEventListener('click', () => App.oeffneBuchungDialog('zahlung'));

    const f = buchungDialogFelder();
    f.fArt.addEventListener('change', aktualisiereArtSichtbarkeit);
    f.fDatum.addEventListener('input', () => {
      if (!fBeginnManuell) f.fBeginn.value = f.fDatum.value;
    });
    f.fBeginn.addEventListener('input', () => {
      fBeginnManuell = true;
    });

    document.getElementById('btnBuchungAbbrechen').addEventListener('click', () => {
      f.dialog.close();
    });

    document.getElementById('buchungForm').addEventListener('submit', (e) => {
      const fehler = validiereBuchungDialog();
      if (fehler.length) {
        e.preventDefault();
        f.fFehler.textContent = fehler.join(' ');
        return;
      }
      speichereBuchungDialog();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    App.laden();
    initNavigation();
    initKontenAnsicht();
    initKontoName();
    initBuchungenAnsicht();
    initReportAnsicht();
    initBasiszinsAnsicht();
    App.zeigeAnsicht('konten');
  });

  window.App = App;
})();
}
