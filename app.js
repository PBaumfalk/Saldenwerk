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
    if (!s) return null;
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
  return { formatEUR, parseBetrag, formatDatum, parseDatum };
});

if (typeof document !== 'undefined') {
(function () {
  const { formatEUR, parseBetrag, formatDatum, parseDatum } = window.AppFormat;
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
      document.getElementById('confirmText').textContent = text;
      dialog.showModal();
      const okBtn = document.getElementById('confirmOk');
      const abbrechenBtn = document.getElementById('confirmAbbrechen');
      function schliessen() {
        okBtn.removeEventListener('click', onOk);
        abbrechenBtn.removeEventListener('click', onAbbrechen);
        dialog.close();
      }
      function onOk() { schliessen(); cb(); }
      function onAbbrechen() { schliessen(); }
      okBtn.addEventListener('click', onOk);
      abbrechenBtn.addEventListener('click', onAbbrechen);
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

  function exportiereKonto(konto) {
    const daten = { version: 1, konten: [konto] };
    const blob = new Blob([JSON.stringify(daten, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forderungskonto-${konto.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

    document.getElementById('buchungForm').addEventListener('submit', (e) => {
      const submitter = e.submitter;
      if (!submitter || submitter.value === 'abbrechen') return;
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
    App.zeigeAnsicht('konten');
  });

  window.App = App;
})();
}
