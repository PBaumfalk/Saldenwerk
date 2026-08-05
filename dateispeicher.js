// Dateispeicher: hält den App-Zustand in einer JSON-Datei (File System Access API).
// Die Datei ist die Quelle der Wahrheit, localStorage bleibt Cache/Fallback.
(function () {
  if (typeof window === 'undefined') return;

  const DB_NAME = 'forderungskonto';
  const STORE = 'handles';
  const HANDLE_KEY = 'datei';
  const AUTOSAVE_MS = 1000;

  let App = null;
  let handle = null;
  let dateiLastModified = null;
  let dirty = false;
  let lokalGeaendert = false;
  let konfliktOffen = false;
  let unterdrueckeMarkierung = false;
  let schreibTimer = null;

  function verfuegbar() {
    return 'showSaveFilePicker' in window && !!window.indexedDB;
  }

  // ---- IndexedDB (nur für das FileSystemFileHandle, das ist nicht JSON-serialisierbar) ----

  function mitStore(modus, aktion) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(STORE, modus);
        const anfrage = aktion(tx.objectStore(STORE));
        tx.oncomplete = () => { db.close(); resolve(anfrage && anfrage.result); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }

  const handleSpeichern = (h) => mitStore('readwrite', (s) => s.put(h, HANDLE_KEY));
  const handleLadenIDB = () => mitStore('readonly', (s) => s.get(HANDLE_KEY));
  const handleLoeschen = () => mitStore('readwrite', (s) => s.delete(HANDLE_KEY));

  // ---- Banner / Status-UI ----

  function bannerContainer() {
    return document.getElementById('dateiBanner');
  }

  function zeigeBanner(text, aktionen) {
    const container = bannerContainer();
    container.innerHTML = '';
    const banner = document.createElement('div');
    banner.className = 'app-hinweisbanner app-hinweisbanner--datei';
    const p = document.createElement('p');
    p.textContent = text;
    banner.appendChild(p);
    const leiste = document.createElement('span');
    leiste.className = 'werkzeugleiste';
    (aktionen || []).forEach(({ label, primaer, onClick }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = primaer ? 'btn btn--primaer' : 'btn btn--sekundaer';
      btn.textContent = label;
      btn.addEventListener('click', onClick);
      leiste.appendChild(btn);
    });
    banner.appendChild(leiste);
    container.appendChild(banner);
  }

  function entferneBanner() {
    bannerContainer().innerHTML = '';
  }

  function renderStatus() {
    const el = document.getElementById('dateiStatus');
    if (!el) return;
    if (!verfuegbar()) {
      el.textContent = '';
      return;
    }
    if (!handle) {
      el.textContent = 'Nur lokal';
      el.title = 'Daten liegen nur im Browser. Über „In Datei speichern…" mit einer Datei verbinden.';
    } else if (konfliktOffen) {
      el.textContent = `${handle.name} – Konflikt`;
      el.title = 'Die Datei wurde außerhalb dieser Sitzung geändert.';
    } else if (dirty) {
      el.textContent = `${handle.name} – ungespeichert`;
      el.title = 'Änderungen werden automatisch gespeichert.';
    } else {
      el.textContent = `${handle.name} ✓`;
      el.title = 'Alle Änderungen sind in der Datei gespeichert.';
    }
    renderWerkzeuge();
  }

  function renderWerkzeuge() {
    const container = document.getElementById('dateiWerkzeuge');
    if (!container) return;
    container.innerHTML = '';
    if (!verfuegbar()) return;
    const btn = (label, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--sekundaer';
      b.textContent = label;
      b.addEventListener('click', onClick);
      container.appendChild(b);
    };
    if (!handle) {
      btn('Datei öffnen…', oeffnen);
      btn('In Datei speichern…', neuVerbinden);
    } else {
      btn('Jetzt speichern', () => schreibeDatei());
      btn('Trennen', trennen);
    }
    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'info-btn';
    info.dataset.info = handle
      ? `Verbunden mit „${handle.name}": Änderungen werden automatisch in die Datei gespeichert. „Trennen" löst die Verbindung, die Daten bleiben lokal erhalten.`
      : 'Datei-Speicherung: hält alle Konten automatisch in einer JSON-Datei — z. B. auf einem Netzlaufwerk der Kanzlei. „Datei öffnen…" verbindet mit einer bestehenden Datei, „In Datei speichern…" legt eine neue an. Verfügbar in Chrome und Edge.';
    info.setAttribute('aria-label', 'Erläuterung zur Datei-Speicherung');
    info.textContent = 'i';
    container.appendChild(info);
  }

  function zeigeFehler(text) {
    zeigeBanner(text, [{ label: 'Ausblenden', onClick: entferneBanner }]);
  }

  // ---- Lesen / Schreiben ----

  function dateiInhalt() {
    return JSON.stringify({
      version: 1,
      konten: App.state.konten,
      basiszinsOverrides: App.state.basiszinsOverrides || [],
    }, null, 2);
  }

  async function leseDatei() {
    const datei = await handle.getFile();
    let objekt;
    try {
      objekt = JSON.parse(await datei.text());
    } catch (e) {
      zeigeFehler(`Die Datei „${handle.name}" enthält kein gültiges JSON – lokale Daten bleiben unverändert.`);
      return false;
    }
    const ergebnis = window.AppFormat.validiereExport(objekt);
    if (!ergebnis.ok) {
      zeigeFehler(`Die Datei „${handle.name}" ist ungültig: ${ergebnis.fehler} Lokale Daten bleiben unverändert.`);
      return false;
    }
    App.state.konten = ergebnis.konten;
    App.state.basiszinsOverrides = ergebnis.basiszinsOverrides;
    if (!App.state.konten.some((k) => k.id === App.state.aktivesKontoId)) {
      App.state.aktivesKontoId = null;
    }
    dateiLastModified = datei.lastModified;
    dirty = false;
    lokalGeaendert = false;
    unterdrueckeMarkierung = true;
    try { App.speichern(); } finally { unterdrueckeMarkierung = false; }
    entferneBanner();
    renderStatus();
    App.zeigeAnsicht('konten');
    return true;
  }

  async function schreibeDatei() {
    if (!handle || konfliktOffen) return;
    try {
      const aktuelleDatei = await handle.getFile();
      if (dateiLastModified !== null && aktuelleDatei.lastModified !== dateiLastModified) {
        konfliktOffen = true;
        renderStatus();
        zeigeBanner(
          `Die Datei „${handle.name}" wurde zwischenzeitlich geändert (z. B. an einem anderen Arbeitsplatz). ` +
          'Wie soll es weitergehen?',
          [
            { label: 'Datei neu laden', primaer: true, onClick: async () => {
              konfliktOffen = false;
              if (!(await leseDatei())) { konfliktOffen = true; renderStatus(); }
            } },
            { label: 'Trotzdem überschreiben', onClick: async () => {
              konfliktOffen = false;
              dateiLastModified = null;
              entferneBanner();
              await schreibeDatei();
            } },
          ]);
        return;
      }
      const writable = await handle.createWritable();
      await writable.write(dateiInhalt());
      await writable.close();
      dateiLastModified = (await handle.getFile()).lastModified;
      dirty = false;
      renderStatus();
    } catch (e) {
      zeigeFehler(`Die Datei „${handle.name}" konnte nicht gespeichert werden – Daten bleiben lokal gesichert.`);
      renderStatus();
    }
  }

  function markiereGeaendert() {
    if (unterdrueckeMarkierung) return;
    lokalGeaendert = true;
    if (!handle) return;
    dirty = true;
    renderStatus();
    clearTimeout(schreibTimer);
    schreibTimer = setTimeout(() => schreibeDatei(), AUTOSAVE_MS);
  }

  // ---- Verbinden / Trennen ----

  async function nachVerbindung(neuerHandle, dateiLesen) {
    handle = neuerHandle;
    dateiLastModified = null;
    konfliktOffen = false;
    try { await handleSpeichern(handle); } catch (e) { /* Handle nur für diese Sitzung */ }
    if (dateiLesen) {
      await leseDatei();
    } else {
      dirty = true;
      await schreibeDatei();
    }
    renderStatus();
  }

  async function neuVerbinden() {
    try {
      const h = await window.showSaveFilePicker({
        suggestedName: 'forderungskonten.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      await nachVerbindung(h, false);
    } catch (e) {
      if (e && e.name !== 'AbortError') zeigeFehler('Die Datei konnte nicht angelegt werden.');
    }
  }

  async function oeffnen() {
    try {
      const [h] = await window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const verbinden = () => nachVerbindung(h, true);
      if (lokalGeaendert && App.state.konten.length) {
        App.bestaetige('Beim Verbinden werden die lokalen Änderungen durch den Dateiinhalt ersetzt. Fortfahren?', verbinden);
      } else {
        await verbinden();
      }
    } catch (e) {
      if (e && e.name !== 'AbortError') zeigeFehler('Die Datei konnte nicht geöffnet werden.');
    }
  }

  async function trennen() {
    clearTimeout(schreibTimer);
    if (dirty) await schreibeDatei();
    try { await handleLoeschen(); } catch (e) { /* ignorieren */ }
    handle = null;
    dateiLastModified = null;
    dirty = false;
    konfliktOffen = false;
    entferneBanner();
    renderStatus();
  }

  // ---- Start ----

  async function init(app) {
    App = app;
    if (!verfuegbar()) return;
    renderStatus();

    window.addEventListener('beforeunload', (e) => {
      if (handle && dirty) e.preventDefault();
    });

    let gespeichert = null;
    try { gespeichert = await handleLadenIDB(); } catch (e) { /* Fallback: nicht verbunden */ }
    if (!gespeichert) return;

    let berechtigung = 'prompt';
    try {
      if (gespeichert.queryPermission) {
        berechtigung = await gespeichert.queryPermission({ mode: 'readwrite' });
      }
    } catch (e) { /* wie 'prompt' behandeln */ }

    if (berechtigung === 'granted') {
      handle = gespeichert;
      await leseDatei();
      return;
    }

    zeigeBanner(`Mit Datei „${gespeichert.name}" verbinden, um den gespeicherten Stand zu laden?`, [
      { label: `Mit „${gespeichert.name}" verbinden`, primaer: true, onClick: async () => {
        try {
          const erteilt = await gespeichert.requestPermission({ mode: 'readwrite' });
          if (erteilt !== 'granted') return;
        } catch (e) {
          zeigeFehler('Der Zugriff auf die Datei wurde nicht erteilt.');
          return;
        }
        const verbinden = async () => { handle = gespeichert; await leseDatei(); renderStatus(); };
        if (lokalGeaendert && App.state.konten.length) {
          App.bestaetige('Beim Verbinden werden die lokalen Änderungen durch den Dateiinhalt ersetzt. Fortfahren?', verbinden);
        } else {
          await verbinden();
        }
      } },
      { label: 'Nicht verbinden', onClick: async () => {
        entferneBanner();
        try { await handleLoeschen(); } catch (e) { /* ignorieren */ }
        renderStatus();
      } },
    ]);
  }

  window.Dateispeicher = {
    verfuegbar,
    istVerbunden: () => !!handle,
    init,
    markiereGeaendert,
    schreibeDatei,
  };
})();
