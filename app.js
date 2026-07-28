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

  document.addEventListener('DOMContentLoaded', () => {
    App.laden();
    initNavigation();
    initKontenAnsicht();
    initKontoName();
    App.zeigeAnsicht('konten');
  });

  window.App = App;
})();
}
