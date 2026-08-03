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
    if (objekt.basiszinsOverrides != null) {
      if (!Array.isArray(objekt.basiszinsOverrides)) {
        return { ok: false, fehler: 'Das Feld „basiszinsOverrides" ist keine Liste.' };
      }
      for (let i = 0; i < objekt.basiszinsOverrides.length; i++) {
        const o = objekt.basiszinsOverrides[i];
        if (!o || typeof o !== 'object' || !parseDatum(o.ab) ||
            typeof o.satz !== 'number' || !isFinite(o.satz)) {
          return { ok: false, fehler: `Basiszins-Override ${i + 1}: ungültiges Format (erwartet Datum „ab" und Zahl „satz").` };
        }
      }
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
      if (konto.tilgungsreihenfolge != null && !['367', '497'].includes(konto.tilgungsreihenfolge)) {
        return { ok: false, fehler: `${bezeichnung} („${konto.name}"): unbekannte Tilgungsreihenfolge „${konto.tilgungsreihenfolge}".` };
      }
      for (const feld of ['aktenzeichen', 'glaeubiger', 'schuldner']) {
        if (konto[feld] != null && typeof konto[feld] !== 'string') {
          return { ok: false, fehler: `${bezeichnung} („${konto.name}"): Feld „${feld}" muss Text sein.` };
        }
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
    return { ok: true, fehler: null, konten: objekt.konten,
      basiszinsOverrides: Array.isArray(objekt.basiszinsOverrides) ? objekt.basiszinsOverrides : [] };
  }

  function backupErinnerungFaellig(meta, heute) {
    if (!meta) return false;
    const aenderungen = meta.aenderungenSeitExport || 0;
    if (!aenderungen) return false;
    if (aenderungen > 50) return true;
    if (!meta.letzterExport) return true;
    const tage = (new Date(heute) - new Date(meta.letzterExport)) / 86400000;
    return tage > 14;
  }

  function verrechnungsText(reihenfolge) {
    return reihenfolge === '497'
      ? 'Verrechnung nach § 497 Abs. 3 BGB'
      : 'Verrechnung nach § 367 BGB';
  }

  return { formatEUR, parseBetrag, formatDatum, parseDatum, validiereExport, verrechnungsText, backupErinnerungFaellig };
});

if (typeof document !== 'undefined') {
(function () {
  const { formatEUR, parseBetrag, formatDatum, parseDatum, validiereExport, verrechnungsText, backupErinnerungFaellig } = window.AppFormat;
  const STORAGE_KEY = 'forderungskonto.v1';
  const META_KEY = 'forderungskonto.meta.v1';

  function ladeMeta() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY)) || null;
    } catch (e) {
      return null;
    }
  }

  function speichereMeta(meta) {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) { /* Meta ist verzichtbar */ }
  }

  const App = {
    state: { konten: [], aktivesKontoId: null, basiszinsOverrides: [] },

    speichern() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(App.state));
      } catch (e) {
        console.error('Speichern fehlgeschlagen', e);
      }
      const meta = ladeMeta() || { letzterExport: null, aenderungenSeitExport: 0 };
      meta.aenderungenSeitExport = (meta.aenderungenSeitExport || 0) + 1;
      speichereMeta(meta);
      if (window.Dateispeicher) Dateispeicher.markiereGeaendert();
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
    ladeExportDatei({ version: 1, konten: App.state.konten,
      basiszinsOverrides: App.state.basiszinsOverrides || [] },
      `forderungskonten-${Engine.heute()}.json`);
    speichereMeta({ letzterExport: Engine.heute(), aenderungenSeitExport: 0 });
    renderKontenListe();
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
      const importierteKonten = ergebnis.konten.map((konto) => {
        const neu = {
          id: crypto.randomUUID(),
          name: konto.name,
          createdAt: (typeof konto.createdAt === 'string' && parseDatum(konto.createdAt)) || Engine.heute(),
          updatedAt: Engine.heute(),
          buchungen: neueBuchungenTiefkopie(konto.buchungen),
        };
        if (konto.tilgungsreihenfolge === '497') neu.tilgungsreihenfolge = '497';
        for (const feld of ['aktenzeichen', 'glaeubiger', 'schuldner']) {
          if (typeof konto[feld] === 'string' && konto[feld]) neu[feld] = konto[feld];
        }
        return neu;
      });
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

  function renderBasiszinsHinweis() {
    const ende = Basiszins.deckungsEnde(App.aktuelleTabelle());
    const faellig = ende && ende < Engine.heute();
    [['view-konten', true], ['view-basiszins', false]].forEach(([viewId, mitButton]) => {
      const view = document.getElementById(viewId);
      let banner = view.querySelector('.app-hinweisbanner--basiszins');
      if (!faellig) {
        if (banner) banner.remove();
        return;
      }
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'app-hinweisbanner app-hinweisbanner--basiszins';
        banner.setAttribute('role', 'status');
        view.querySelector('.ansicht-kopf').insertAdjacentElement('afterend', banner);
      }
      banner.innerHTML = '';
      const text = document.createElement('p');
      text.textContent = `Der Basiszinssatz ist nur bis zum ${formatDatum(ende)} hinterlegt – ` +
        'für spätere Zeiträume wird der letzte bekannte Satz verwendet. ' +
        'Bitte den aktuellen Satz der Bundesbank ergänzen.';
      banner.appendChild(text);
      if (mitButton) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--sekundaer';
        btn.textContent = 'Basiszins pflegen';
        btn.addEventListener('click', () => App.zeigeAnsicht('basiszins'));
        banner.appendChild(btn);
      }
    });
  }

  const kontenFilter = { suchtext: '', sortierung: 'updatedAt' };

  function gefilterteKonten() {
    const suchtext = kontenFilter.suchtext.trim().toLowerCase();
    const passt = (konto) => !suchtext ||
      [konto.name, konto.aktenzeichen, konto.glaeubiger, konto.schuldner]
        .some((wert) => typeof wert === 'string' && wert.toLowerCase().includes(suchtext));
    const fehltZuletzt = (a, b, feld) => {
      if (!a[feld] && !b[feld]) return 0;
      if (!a[feld]) return 1;
      if (!b[feld]) return -1;
      return a[feld].localeCompare(b[feld], 'de');
    };
    const vergleich = {
      updatedAt: (a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0),
      name: (a, b) => a.name.localeCompare(b.name, 'de'),
      aktenzeichen: (a, b) => fehltZuletzt(a, b, 'aktenzeichen'),
    }[kontenFilter.sortierung];
    return App.state.konten.filter(passt).slice().sort(vergleich);
  }

  function kontoMetaZeile(konto) {
    const teile = [];
    if (konto.aktenzeichen) teile.push(`Az. ${konto.aktenzeichen}`);
    if (konto.glaeubiger || konto.schuldner) {
      teile.push(`${konto.glaeubiger || '–'} ./. ${konto.schuldner || '–'}`);
    }
    return teile.join(' · ');
  }

  function renderBackupErinnerung() {
    const view = document.getElementById('view-konten');
    let banner = view.querySelector('.app-hinweisbanner--backup');
    const verbunden = window.Dateispeicher && Dateispeicher.istVerbunden();
    const meta = ladeMeta();
    const faellig = !verbunden && backupErinnerungFaellig(meta, Engine.heute());
    if (!faellig) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'app-hinweisbanner app-hinweisbanner--backup';
      banner.setAttribute('role', 'status');
      view.querySelector('.ansicht-kopf').insertAdjacentElement('afterend', banner);
    }
    banner.innerHTML = '';
    const text = document.createElement('p');
    const letzter = meta && meta.letzterExport
      ? `Letzte Sicherung am ${formatDatum(meta.letzterExport)}.`
      : 'Die Daten wurden noch nie gesichert.';
    text.textContent = `${letzter} Die Daten liegen nur in diesem Browser – bitte per „Alle exportieren" sichern.`;
    banner.appendChild(text);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--sekundaer';
    btn.textContent = 'Alle exportieren';
    btn.addEventListener('click', exportiereAlleKonten);
    banner.appendChild(btn);
  }

  function renderKontenListe() {
    renderBasiszinsHinweis();
    renderBackupErinnerung();
    const container = document.getElementById('kontenListe');
    container.innerHTML = '';
    renderLadeFehler(container);
    const konten = gefilterteKonten();
    if (!konten.length && App.state.konten.length) {
      const leer = document.createElement('p');
      leer.className = 'hinweistext';
      leer.textContent = 'Keine Konten gefunden.';
      container.appendChild(leer);
    }
    konten.forEach((konto) => {
      const karte = document.createElement('div');
      karte.className = 'karte';

      const titel = document.createElement('h3');
      titel.textContent = konto.name;
      karte.appendChild(titel);

      const metaZeile = kontoMetaZeile(konto);
      if (metaZeile) {
        const meta = document.createElement('p');
        meta.className = 'hinweistext karte__meta';
        meta.textContent = metaZeile;
        karte.appendChild(meta);
      }

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
        if (konto.tilgungsreihenfolge === '497') kopie.tilgungsreihenfolge = '497';
        for (const feld of ['aktenzeichen', 'glaeubiger', 'schuldner']) {
          if (typeof konto[feld] === 'string' && konto[feld]) kopie[feld] = konto[feld];
        }
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

    document.getElementById('kontenSuche').addEventListener('input', (e) => {
      kontenFilter.suchtext = e.target.value;
      renderKontenListe();
    });
    document.getElementById('kontenSortierung').addEventListener('change', (e) => {
      kontenFilter.sortierung = e.target.value;
      renderKontenListe();
    });
  }

  function initKontoDialog() {
    const dialog = document.getElementById('kontoDialog');
    const felder = () => ({
      aktenzeichen: document.getElementById('kAktenzeichen'),
      glaeubiger: document.getElementById('kGlaeubiger'),
      schuldner: document.getElementById('kSchuldner'),
      tilgung: document.getElementById('kTilgung'),
    });

    document.getElementById('btnKontoDaten').addEventListener('click', () => {
      const konto = App.aktivesKonto();
      if (!konto) return;
      const f = felder();
      f.aktenzeichen.value = konto.aktenzeichen || '';
      f.glaeubiger.value = konto.glaeubiger || '';
      f.schuldner.value = konto.schuldner || '';
      f.tilgung.value = konto.tilgungsreihenfolge === '497' ? '497' : '367';
      dialog.showModal();
    });

    document.getElementById('btnKontoAbbrechen').addEventListener('click', () => dialog.close());

    document.getElementById('kontoForm').addEventListener('submit', () => {
      const konto = App.aktivesKonto();
      if (!konto) return;
      const f = felder();
      konto.aktenzeichen = f.aktenzeichen.value.trim().slice(0, 120);
      konto.glaeubiger = f.glaeubiger.value.trim().slice(0, 120);
      konto.schuldner = f.schuldner.value.trim().slice(0, 120);
      if (f.tilgung.value === '497') konto.tilgungsreihenfolge = '497';
      else delete konto.tilgungsreihenfolge;
      konto.updatedAt = Engine.heute();
      App.speichern();
      App.renderBuchungen();
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
    const verrechnung = document.createElement('p');
    verrechnung.className = 'report-kopf__meta';
    verrechnung.textContent = verrechnungsText(konto.tilgungsreihenfolge);
    kopf.append(eyebrow, h2);
    const aktenMeta = kontoMetaZeile(konto);
    if (aktenMeta) {
      const akten = document.createElement('p');
      akten.className = 'report-kopf__meta';
      akten.textContent = aktenMeta;
      kopf.appendChild(akten);
    }
    kopf.append(meta, verrechnung);
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
    const btnPdf = document.getElementById('btnPdfExport');
    if (btnPdf) {
      btnPdf.disabled = !konto || !konto.buchungen.length;
      btnPdf.title = btnPdf.disabled
        ? 'Für den Export müssen zuerst Buchungen erfasst werden.'
        : '';
    }
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

  const DRUCK_SPALTEN = ['zahlung', 'hauptforderung', 'hfZinsen', 'verzinslKosten', 'kostenzinsen', 'unverzinslKosten'];
  const DRUCK_SPALTEN_LABELS = ['Zahlung', 'Hauptforderung', 'HF-Zinsen', 'Verzinsl. Kosten',
    'Kostenzinsen', 'Unverzinsl. Kosten'];

  function druckZelle(tag, text, klasse) {
    const el = document.createElement(tag);
    if (klasse) el.className = klasse;
    el.textContent = text;
    return el;
  }

  function renderDruckSeite1(modell) {
    const seite = document.createElement('section');
    seite.className = 'druck-seite';

    const h1 = druckZelle('h1', `Forderungsaufstellung per ${formatDatum(modell.kopf.stichtag)}`, 'druck-titel');
    const balken = document.createElement('div');
    balken.className = 'druck-balken';
    balken.appendChild(druckZelle('span', `Forderungskonto: ${modell.kopf.kontoName}`, ''));
    if (modell.kopf.aktenzeichen) {
      balken.appendChild(druckZelle('span', `Az.: ${modell.kopf.aktenzeichen}`, ''));
    }
    if (modell.kopf.glaeubiger || modell.kopf.schuldner) {
      balken.appendChild(druckZelle('span',
        `${modell.kopf.glaeubiger || '–'} ./. ${modell.kopf.schuldner || '–'}`, ''));
    }
    balken.appendChild(druckZelle('span', `Berechnungsstand: ${formatDatum(modell.kopf.stichtag)}`, ''));
    seite.append(h1, balken);

    if (modell.warnungen.length) {
      const hinweise = document.createElement('div');
      hinweise.className = 'druck-hinweise';
      const ul = document.createElement('ul');
      modell.warnungen.forEach((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        ul.appendChild(li);
      });
      hinweise.appendChild(ul);
      seite.appendChild(hinweise);
    }

    const table = document.createElement('table');
    table.className = 'druck-tabelle';
    // Feste Spaltenbreiten (Summe 100 %): Datum, Bezeichnung, 6 Betragsspalten, Umsatz, Gesamtsaldo.
    const colgroup = document.createElement('colgroup');
    [6.5, 26, 8.5, 8.5, 8.5, 8.5, 8.5, 8.5, 8.25, 8.25].forEach((prozent) => {
      const col = document.createElement('col');
      col.style.width = prozent + '%';
      colgroup.appendChild(col);
    });
    table.appendChild(colgroup);
    const thead = document.createElement('thead');
    const kopfzeile = document.createElement('tr');
    ['Datum', 'Bezeichnung', ...DRUCK_SPALTEN_LABELS, 'Umsatz', 'Gesamtsaldo']
      .forEach((label) => kopfzeile.appendChild(druckZelle('th', label, '')));
    thead.appendChild(kopfzeile);
    const tbody = document.createElement('tbody');

    modell.zeilen.forEach((z) => {
      const tr = document.createElement('tr');
      tr.className = `druck-zeile druck-zeile--${z.art}`;
      tr.appendChild(druckZelle('td', z.datum ? formatDatum(z.datum) : '', 'druck-datum'));
      tr.appendChild(druckZelle('td', z.text, 'druck-text'));
      DRUCK_SPALTEN.forEach((key) => {
        tr.appendChild(druckZelle('td', key === z.spalte ? Druck.formatBetragEUR(z.betrag) : '', 'num'));
      });
      tr.appendChild(druckZelle('td', Druck.formatBetragEUR(z.spalte === 'zahlung' ? -z.betrag : z.betrag), 'num'));
      tr.appendChild(druckZelle('td', z.gesamtsaldo === null ? '' : Druck.formatBetragEUR(z.gesamtsaldo), 'num druck-saldo'));
      tbody.appendChild(tr);
    });

    const saldoTr = document.createElement('tr');
    saldoTr.className = 'druck-saldozeile';
    saldoTr.appendChild(druckZelle('td', `Saldo per ${formatDatum(modell.kopf.stichtag)}`, ''));
    saldoTr.appendChild(druckZelle('td', '', ''));
    DRUCK_SPALTEN.forEach((key) => saldoTr.appendChild(druckZelle('td', Druck.formatBetragEUR(modell.saldozeile[key]), 'num')));
    saldoTr.appendChild(druckZelle('td', Druck.formatBetragEUR(modell.saldozeile.umsatz), 'num'));
    saldoTr.appendChild(druckZelle('td', Druck.formatBetragEUR(modell.saldozeile.gesamtsaldo), 'num'));
    tbody.appendChild(saldoTr);

    table.append(thead, tbody);
    seite.appendChild(table);
    seite.appendChild(renderDruckFusszeile(modell));
    return seite;
  }

  function renderDruckFusszeile(modell) {
    const fuss = document.createElement('div');
    fuss.className = 'druck-fusszeile';
    fuss.append(
      druckZelle('span', `Erstellt am ${formatDatum(Engine.heute())}`, ''),
      druckZelle('span', `Gesamtsaldo: ${Druck.formatBetragEUR(modell.saldozeile.gesamtsaldo)}`, ''),
      druckZelle('span', `Tageszins: ${Druck.formatZahl5(modell.tageszins.betragProTag)} EUR ab dem ${formatDatum(modell.tageszins.ab)}`, ''),
      druckZelle('span', verrechnungsText(modell.kopf.tilgungsreihenfolge), ''));
    return fuss;
  }

  const SEITE2_LABELS = [
    ['hauptforderungen', 'Hauptforderungen:'],
    ['zinsenAufHauptforderungen', 'Zinsen auf Hauptforderungen:'],
    ['verzinslicheKosten', 'Verzinsliche Kosten:'],
    ['kostenzinsen', 'Kostenzinsen:'],
    ['unverzinslicheKosten', 'Unverzinsliche Kosten:'],
  ];

  function druckSummenBlock(titel, werte, gesamtLabel, extraZeilen) {
    const block = document.createElement('div');
    block.className = 'druck-summenblock';
    block.appendChild(druckZelle('h3', titel, ''));
    SEITE2_LABELS.forEach(([key, label]) => {
      const zeile = document.createElement('div');
      zeile.className = 'druck-summenzeile';
      zeile.append(druckZelle('span', label, ''), druckZelle('span', Druck.formatBetragEUR(werte[key]), ''));
      block.appendChild(zeile);
    });
    (extraZeilen || []).forEach(([label, wert]) => {
      const zeile = document.createElement('div');
      zeile.className = 'druck-summenzeile';
      zeile.append(druckZelle('span', label, ''), druckZelle('span', Druck.formatBetragEUR(wert), ''));
      block.appendChild(zeile);
    });
    const gesamt = document.createElement('div');
    gesamt.className = 'druck-summenzeile druck-summenzeile--gesamt';
    gesamt.append(druckZelle('span', gesamtLabel, ''), druckZelle('span', Druck.formatBetragEUR(werte.gesamt), ''));
    block.appendChild(gesamt);
    return block;
  }

  function renderDruckSeite2(modell) {
    const seite = document.createElement('section');
    seite.className = 'druck-seite druck-seite--zwei';
    seite.appendChild(druckZelle('h1', `Forderungskonto per ${formatDatum(modell.kopf.stichtag)}`, 'druck-titel'));

    const layout = document.createElement('div');
    layout.className = 'druck-seite2-layout';

    const uebersicht = document.createElement('div');
    uebersicht.className = 'druck-uebersicht';
    uebersicht.appendChild(druckZelle('div', `Stand des Forderungskontos per ${formatDatum(modell.kopf.stichtag)}`, 'druck-uebersicht__titel'));
    uebersicht.appendChild(druckSummenBlock('Summen', modell.seite2.summen, 'Gesamtsumme:'));
    uebersicht.appendChild(druckSummenBlock('Zahlungen', modell.seite2.zahlungen, 'Summe Zahlungen:',
      modell.seite2.zahlungen.ueberschuss > 0 ? [['Überschuss (nicht verrechnet):', modell.seite2.zahlungen.ueberschuss]] : []));
    uebersicht.appendChild(druckSummenBlock('Salden', modell.seite2.salden, 'Gesamtsaldo:',
      modell.seite2.salden.ueberzahlung > 0 ? [['− Überzahlung:', modell.seite2.salden.ueberzahlung]] : []));
    uebersicht.appendChild(druckZelle('p',
      `Tageszins: ${Druck.formatZahl5(modell.tageszins.betragProTag)} EUR ab dem ${formatDatum(modell.tageszins.ab)}`,
      'druck-uebersicht__tageszins'));

    const chartBox = document.createElement('div');
    chartBox.className = 'druck-chartbox';
    chartBox.appendChild(druckZelle('h3', 'Salden-Entwicklung', 'druck-chartbox__titel'));
    chartBox.appendChild(renderDruckChart(modell.chart));

    layout.append(uebersicht, chartBox);
    seite.appendChild(layout);
    seite.appendChild(renderDruckFusszeile(modell));
    return seite;
  }

  function svgElement(name, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function druckChartSchritt(maxWert) {
    const stufen = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000, 100000];
    for (const s of stufen) if (maxWert / s <= 18) return s;
    return Math.pow(10, Math.ceil(Math.log10(maxWert / 18)));
  }

  function renderDruckChart(punkte) {
    const B = 760, H = 460, L = 80, R = 15, T = 15, U = 55;
    const svg = svgElement('svg', { viewBox: `0 0 ${B} ${H}`, class: 'druck-chart', role: 'img',
      'aria-label': 'Salden-Entwicklung' });
    if (punkte.length < 2) return svg;

    const ms = (iso) => new Date(iso + 'T00:00:00Z').getTime();
    const t0 = ms(punkte[0].datum), t1 = ms(punkte[punkte.length - 1].datum);
    const maxSaldo = Math.max(...punkte.map((p) => p.saldo), 1);
    const minSaldo = Math.min(...punkte.map((p) => p.saldo), 0);
    const schritt = druckChartSchritt(Math.max(maxSaldo - minSaldo, 1));
    const yMin = Math.floor(minSaldo / schritt) * schritt;
    const yMax = Math.ceil(maxSaldo / schritt) * schritt;
    const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (B - L - R);
    const y = (s) => T + (1 - (s - yMin) / (yMax - yMin)) * (H - T - U);

    for (let s = yMin; s <= yMax; s += schritt) {
      svg.appendChild(svgElement('line', { x1: L, y1: y(s), x2: B - R, y2: y(s),
        stroke: '#999', 'stroke-width': 0.5, 'stroke-dasharray': '3 3' }));
      const label = svgElement('text', { x: L - 6, y: y(s) + 3, 'text-anchor': 'end', 'font-size': 11 });
      label.textContent = new Intl.NumberFormat('de-DE').format(s);
      svg.appendChild(label);
    }

    const achsentitel = svgElement('text', { x: 14, y: (H - U + T) / 2, 'font-size': 11,
      'text-anchor': 'middle', transform: `rotate(-90 14 ${(H - U + T) / 2})` });
    achsentitel.textContent = 'Saldo';
    svg.appendChild(achsentitel);

    const jahr0 = Number(punkte[0].datum.slice(0, 4));
    const jahr1 = Number(punkte[punkte.length - 1].datum.slice(0, 4));
    for (let jahr = jahr0; jahr <= jahr1; jahr++) {
      const t = ms(`${jahr}-01-01`);
      if (t < t0 || t > t1) continue;
      svg.appendChild(svgElement('line', { x1: x(t), y1: T, x2: x(t), y2: H - U,
        stroke: '#999', 'stroke-width': 0.5, 'stroke-dasharray': '3 3' }));
      const label = svgElement('text', { x: x(t), y: H - U + 16, 'text-anchor': 'middle', 'font-size': 11 });
      label.textContent = String(jahr);
      svg.appendChild(label);
    }

    svg.appendChild(svgElement('rect', { x: L, y: T, width: B - L - R, height: H - T - U,
      fill: 'none', stroke: '#333', 'stroke-width': 0.75 }));
    svg.appendChild(svgElement('polyline', {
      points: punkte.map((p) => `${x(ms(p.datum)).toFixed(1)},${y(p.saldo).toFixed(1)}`).join(' '),
      fill: 'none', stroke: '#d2233c', 'stroke-width': 1.5 }));

    const legende = svgElement('g', {});
    legende.appendChild(svgElement('rect', { x: B / 2 - 70, y: H - 24, width: 140, height: 20,
      fill: '#fff', stroke: '#333', 'stroke-width': 0.75 }));
    legende.appendChild(svgElement('line', { x1: B / 2 - 60, y1: H - 14, x2: B / 2 - 35, y2: H - 14,
      stroke: '#d2233c', 'stroke-width': 1.5 }));
    const legendeText = svgElement('text', { x: B / 2 - 28, y: H - 10, 'font-size': 11 });
    legendeText.textContent = 'Gesamtsaldo';
    legende.appendChild(legendeText);
    svg.appendChild(legende);
    return svg;
  }

  function renderDruckansicht(modell) {
    const container = document.getElementById('druckansicht');
    container.innerHTML = '';
    container.appendChild(renderDruckSeite1(modell));
    container.appendChild(renderDruckSeite2(modell));
  }

  function raeumeDruckmodusAuf() {
    document.body.classList.remove('druckmodus');
    const stil = document.getElementById('druckQuerformat');
    if (stil) stil.remove();
  }

  function druckeForderungsaufstellung() {
    raeumeDruckmodusAuf();
    const konto = App.aktivesKonto();
    if (!konto || !konto.buchungen.length) return;
    const stichtagInput = document.getElementById('reportStichtag');
    const stichtag = parseDatum(stichtagInput.value) || Engine.heute();
    const tabelle = App.aktuelleTabelle();
    const ergebnis = Engine.berechneKonto(konto, stichtag, tabelle);
    const modell = Druck.baueDruckmodell(konto, ergebnis, tabelle);
    renderDruckansicht(modell);
    document.body.classList.add('druckmodus');
    const stil = document.createElement('style');
    stil.id = 'druckQuerformat';
    stil.media = 'print';
    stil.textContent = '@page { size: A4 landscape; margin: 12mm; }';
    document.head.appendChild(stil);
    window.print();
  }

  function initDruckansicht() {
    document.getElementById('btnPdfExport').addEventListener('click', druckeForderungsaufstellung);
    window.addEventListener('afterprint', raeumeDruckmodusAuf);
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
    renderBasiszinsHinweis();
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
    initKontoDialog();
    initBuchungenAnsicht();
    initReportAnsicht();
    initDruckansicht();
    initBasiszinsAnsicht();
    App.zeigeAnsicht('konten');
    if (window.Dateispeicher) Dateispeicher.init(App);
  });

  window.App = App;
})();
}
