// j-lawyer.org-Anbindung: Akten-Lookup und Dokument-Upload über die REST-API
// des j-lawyer-Servers (HTTP Basic Auth, Basis /j-lawyer-io/rest).
// UMD-Teil (JlawyerCore): reine Logik, node-testbar. IIFE-Teil: fetch + UI.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JlawyerCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function base64VonBytes(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
      out += B64[b0 >> 2];
      out += B64[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
      out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
      out += b2 === undefined ? '=' : B64[b2 & 63];
    }
    return out;
  }

  const base64VonString = (text) => base64VonBytes(new TextEncoder().encode(text));
  const base64VonArrayBuffer = (buf) => base64VonBytes(new Uint8Array(buf));
  const authHeader = (benutzer, passwort) => 'Basic ' + base64VonString(`${benutzer}:${passwort}`);

  function baueUrl(serverUrl, pfad) {
    let basis = String(serverUrl || '').trim().replace(/\/+$/, '');
    if (!basis.includes('/j-lawyer-io')) basis += '/j-lawyer-io/rest';
    return basis + (pfad.startsWith('/') ? pfad : '/' + pfad);
  }

  function findeAkten(treffer, az) {
    const gesucht = String(az || '').trim().toLowerCase();
    const alle = treffer || [];
    return {
      exakt: alle.filter((a) => String(a.fileNumber || '').trim().toLowerCase() === gesucht),
      alle,
    };
  }

  function kontaktName(kontakt) {
    if (!kontakt) return '';
    if (kontakt.company) return kontakt.company;
    return [kontakt.firstName, kontakt.name].filter(Boolean).join(' ');
  }

  function mappeParteien(parties, kontakteById) {
    const rollen = { Mandant: [], Gegner: [] };
    const hinweise = [];
    const unbekannte = [];
    (parties || []).forEach((p) => {
      const name = kontaktName(kontakteById[p.contactId] || p.contact);
      if (rollen[p.involvementType]) rollen[p.involvementType].push(name);
      else if (p.involvementType && !unbekannte.includes(p.involvementType)) unbekannte.push(p.involvementType);
    });
    if (rollen.Mandant.length > 1 || rollen.Gegner.length > 1) {
      hinweise.push('Mehrere Beteiligte je Rolle — Namen wurden mit Komma verbunden.');
    }
    if (unbekannte.length) {
      hinweise.push(`Beteiligte mit Rolle ${unbekannte.join(', ')} wurden nicht übernommen.`);
    }
    return {
      glaeubiger: rollen.Mandant.filter(Boolean).join(', '),
      schuldner: rollen.Gegner.filter(Boolean).join(', '),
      hinweise,
    };
  }

  function klassifiziereFehler(fehler) {
    const f = fehler || {};
    if (f.art === 'netzwerk') {
      return 'Server nicht erreichbar. Läuft der j-lawyer-Server, blockiert vermutlich CORS — '
        + 'die j-lawyer-API sendet keine CORS-Header; ein Reverse-Proxy ist nötig (siehe README).';
    }
    if (f.art === 'timeout') return 'Zeitüberschreitung — der Server hat nicht rechtzeitig geantwortet.';
    if (f.art === 'json') return 'Unerwartete Antwort vom Server (kein JSON) — antwortet dort wirklich der j-lawyer-Server?';
    if (f.art === 'http') {
      if (f.status === 401) return 'Anmeldung fehlgeschlagen — Benutzername und Passwort prüfen.';
      if (f.status === 403) return 'Keine Berechtigung — der Benutzer braucht die Rollen read-/writeArchiveFileRole.';
      if (f.status === 404) return 'Endpunkt nicht gefunden — Server-URL und j-lawyer-Version prüfen.';
      return `Serverfehler (HTTP ${f.status}).`;
    }
    return 'Unbekannter Fehler bei der Verbindung zum j-lawyer-Server.';
  }

  function uploadDateiname(basis, ext, vorhandeneNamen) {
    const sauber = String(basis).replace(/[\\/:*?"<>|]/g, '-');
    const vorhanden = new Set((vorhandeneNamen || []).map((n) => String(n).toLowerCase()));
    let name = `${sauber}.${ext}`;
    let i = 2;
    while (vorhanden.has(name.toLowerCase())) {
      name = `${sauber}_${i}.${ext}`;
      i += 1;
    }
    return name;
  }

  function pruefeApiLevel(metadata) {
    return metadata && typeof metadata.apiLevel === 'number' && metadata.apiLevel >= 7 ? 'v7' : 'v1';
  }

  return { baueUrl, authHeader, base64VonString, base64VonArrayBuffer, findeAkten,
    mappeParteien, klassifiziereFehler, uploadDateiname, pruefeApiLevel };
});

if (typeof document !== 'undefined') {
(function () {
  const Core = window.JlawyerCore;
  const JLAWYER_KEY = 'forderungskonto.jlawyer.v1';
  const TIMEOUT_MS = 15000;

  let App = null;

  function ladeEinstellungen() {
    try {
      return JSON.parse(localStorage.getItem(JLAWYER_KEY)) || null;
    } catch (e) {
      return null;
    }
  }

  function speichereEinstellungen(einstellungen) {
    try {
      localStorage.setItem(JLAWYER_KEY, JSON.stringify(einstellungen));
    } catch (e) { /* Einstellungen sind verzichtbar */ }
  }

  // Leere Server-URL ist gültig: baueUrl liefert dann relative Pfade, d. h.
  // die App spricht den j-lawyer-Proxy unter dem eigenen Origin an
  // (Docker-Deployment mit same-origin Proxy, siehe README).
  function konfiguriert() {
    const s = ladeEinstellungen();
    return !!(s && s.benutzer && s.passwort);
  }

  async function api(pfad, optionen) {
    const s = ladeEinstellungen();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let antwort;
    try {
      antwort = await fetch(Core.baueUrl(s.serverUrl, pfad), {
        method: (optionen && optionen.method) || 'GET',
        headers: {
          Authorization: Core.authHeader(s.benutzer, s.passwort),
          ...(optionen && optionen.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: optionen && optionen.body ? JSON.stringify(optionen.body) : undefined,
        signal: controller.signal,
      });
    } catch (e) {
      throw { art: e && e.name === 'AbortError' ? 'timeout' : 'netzwerk' };
    } finally {
      clearTimeout(timer);
    }
    if (!antwort.ok) throw { art: 'http', status: antwort.status };
    const text = await antwort.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      throw { art: 'json' };
    }
  }

  const testeVerbindung = () => api('/v1/security/metadata');
  const holeAkte = (id) => api(`/v1/cases/${encodeURIComponent(id)}`);
  const holeParteien = (id) => api(`/v1/cases/${encodeURIComponent(id)}/parties`);
  const holeKontakt = (id) => api(`/v1/contacts/${encodeURIComponent(id)}`);

  async function sucheAkte(az) {
    let modus = 'v7';
    try {
      modus = Core.pruefeApiLevel(await testeVerbindung());
    } catch (e) { /* Metadata-Endpunkt fehlt bei alten Servern — v1 versuchen */ modus = 'v1'; }
    const treffer = modus === 'v7'
      ? await api(`/v7/cases/search?searchString=${encodeURIComponent(az)}`)
      : await api('/v1/cases/list');
    return Core.findeAkten(treffer, az);
  }

  async function holeDokumentNamen(caseId) {
    const dokumente = await api(`/v1/cases/${encodeURIComponent(caseId)}/documents`);
    return (dokumente || []).map((d) => d.name || d.fileName || '');
  }

  const ladeDokumentHoch = (caseId, fileName, base64content) =>
    api('/v1/cases/document/create', { method: 'PUT', body: { caseId, fileName, base64content } });

  // ---- Auswahl bei mehrdeutigem Aktenzeichen ----

  function waehleAkte(akten) {
    return new Promise((resolve) => {
      const dialog = document.getElementById('jlawyerAuswahl');
      const liste = document.getElementById('jlawyerAuswahlListe');
      liste.innerHTML = '';
      let gewaehlt = null;
      akten.forEach((akte) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--sekundaer jlawyer-auswahl__eintrag';
        btn.textContent = [akte.fileNumber, akte.name, akte.reason].filter(Boolean).join(' — ');
        btn.addEventListener('click', () => {
          gewaehlt = akte;
          dialog.close();
        });
        liste.appendChild(btn);
      });
      dialog.addEventListener('close', () => resolve(gewaehlt), { once: true });
      dialog.showModal();
    });
  }

  async function findeEindeutigeAkte(az, meldung) {
    if (!az || az.trim().length < 3) {
      meldung('Bitte ein Aktenzeichen mit mindestens 3 Zeichen angeben.', true);
      return null;
    }
    const ergebnis = await sucheAkte(az.trim());
    const kandidaten = ergebnis.exakt.length ? ergebnis.exakt : ergebnis.alle;
    if (!kandidaten.length) {
      meldung(`Keine Akte zu „${az.trim()}" gefunden.`, true);
      return null;
    }
    if (kandidaten.length === 1) return kandidaten[0];
    return waehleAkte(kandidaten);
  }

  // ---- Einstellungen-Dialog ----

  function initEinstellungen() {
    const dialog = document.getElementById('jlawyerDialog');
    const fehler = document.getElementById('jFehler');
    const felder = () => ({
      server: document.getElementById('jServer'),
      benutzer: document.getElementById('jBenutzer'),
      passwort: document.getElementById('jPasswort'),
    });

    document.getElementById('btnJlawyer').addEventListener('click', () => {
      const s = ladeEinstellungen() || {};
      const f = felder();
      f.server.value = s.serverUrl || '';
      f.benutzer.value = s.benutzer || '';
      f.passwort.value = s.passwort || '';
      fehler.textContent = '';
      fehler.classList.remove('fehlerbereich--erfolg');
      dialog.showModal();
    });

    document.getElementById('btnJlawyerAbbrechen').addEventListener('click', () => dialog.close());

    document.getElementById('btnJlawyerTest').addEventListener('click', async () => {
      const f = felder();
      speichereEinstellungen({ serverUrl: f.server.value.trim(), benutzer: f.benutzer.value.trim(),
        passwort: f.passwort.value });
      fehler.classList.remove('fehlerbereich--erfolg');
      if (!konfiguriert()) {
        fehler.textContent = 'Bitte Benutzername und Passwort angeben (Server-URL nur nötig, wenn die App nicht vom Docker-Container ausgeliefert wird).';
        return;
      }
      fehler.textContent = 'Verbindung wird getestet…';
      try {
        const metadata = await testeVerbindung();
        fehler.textContent = `Verbunden — API-Level ${metadata && metadata.apiLevel ? metadata.apiLevel : 'unbekannt'} ✓`;
        fehler.classList.add('fehlerbereich--erfolg');
      } catch (e) {
        fehler.textContent = Core.klassifiziereFehler(e);
      }
    });

    document.getElementById('jlawyerForm').addEventListener('submit', () => {
      const f = felder();
      speichereEinstellungen({ serverUrl: f.server.value.trim(), benutzer: f.benutzer.value.trim(),
        passwort: f.passwort.value });
    });
  }

  // ---- Lookup im Kontodaten-Dialog ----

  function initLookup() {
    const fehler = document.getElementById('kFehler');
    const meldung = (text, istFehler) => {
      fehler.textContent = text;
      fehler.classList.toggle('fehlerbereich--erfolg', !istFehler);
    };

    document.getElementById('btnKontoLookup').addEventListener('click', async () => {
      if (!konfiguriert()) {
        meldung('j-lawyer ist nicht eingerichtet — bitte zuerst in der Konten-Ansicht unter „j-lawyer…" konfigurieren.', true);
        return;
      }
      const btn = document.getElementById('btnKontoLookup');
      btn.disabled = true;
      const alterText = btn.textContent;
      btn.textContent = 'Suche…';
      try {
        const akte = await findeEindeutigeAkte(document.getElementById('kAktenzeichen').value, meldung);
        if (!akte) return;
        const [details, parties] = await Promise.all([holeAkte(akte.id), holeParteien(akte.id)]);
        const kontakteById = {};
        await Promise.all((parties || []).map(async (p) => {
          if (p.contact) kontakteById[p.contactId] = p.contact;
          else if (p.contactId) {
            try { kontakteById[p.contactId] = await holeKontakt(p.contactId); } catch (e) { /* Name bleibt leer */ }
          }
        }));
        const gemappt = Core.mappeParteien(parties, kontakteById);
        document.getElementById('kAktenzeichen').value = details.fileNumber || akte.fileNumber || '';
        if (gemappt.glaeubiger) document.getElementById('kGlaeubiger').value = gemappt.glaeubiger;
        if (gemappt.schuldner) document.getElementById('kSchuldner').value = gemappt.schuldner;
        const hinweise = ['Übernommen — Annahme: Mandant = Gläubiger, Gegner = Schuldner. Bitte prüfen.']
          .concat(gemappt.hinweise);
        meldung(hinweise.join(' '), false);
      } catch (e) {
        meldung(Core.klassifiziereFehler(e), true);
      } finally {
        btn.disabled = false;
        btn.textContent = alterText;
      }
    });
  }

  // ---- Upload im Report ----

  function initUpload() {
    document.getElementById('btnJlawyerUpload').addEventListener('click', async () => {
      const meldung = App.zeigeReportMeldung;
      const konto = App.aktivesKonto();
      if (!konto || !konto.buchungen.length) return;
      if (!konfiguriert()) {
        meldung('j-lawyer ist nicht eingerichtet — bitte in der Konten-Ansicht unter „j-lawyer…" konfigurieren.', true);
        return;
      }
      if (!konto.aktenzeichen) {
        meldung('Dieses Konto hat kein Aktenzeichen — bitte zuerst über „Kontodaten" erfassen.', true);
        return;
      }
      const btn = document.getElementById('btnJlawyerUpload');
      btn.disabled = true;
      const hochgeladen = [];
      try {
        const akte = await findeEindeutigeAkte(konto.aktenzeichen, meldung);
        if (!akte) return;
        meldung(`Erzeuge Dokumente für Akte ${akte.fileNumber}…`, false);

        const stichtagInput = document.getElementById('reportStichtag');
        const stichtag = (window.AppFormat.parseDatum(stichtagInput.value)) || Engine.heute();
        const tabelle = App.aktuelleTabelle();
        const ergebnis = Engine.berechneKonto(konto, stichtag, tabelle);
        const modell = Druck.baueDruckmodell(konto, ergebnis, tabelle);

        const vorhandene = await holeDokumentNamen(akte.id);
        const basis = `Forderungsaufstellung_${konto.aktenzeichen}_${stichtag}`;
        const dateien = [
          [Core.uploadDateiname(basis, 'pdf', vorhandene),
            Core.base64VonArrayBuffer(Pdfexport.erzeugePdf(modell))],
          [Core.uploadDateiname(basis, 'html', vorhandene),
            Core.base64VonString(Druck.druckHtml(modell))],
          [Core.uploadDateiname(basis, 'json', vorhandene),
            Core.base64VonString(JSON.stringify({ version: 1, konten: [konto] }, null, 2))],
        ];
        for (const [name, inhalt] of dateien) {
          await ladeDokumentHoch(akte.id, name, inhalt);
          hochgeladen.push(name);
        }
        meldung(`${hochgeladen.length} Dokumente in Akte ${akte.fileNumber} (${akte.name || ''}) hochgeladen.`, false);
      } catch (e) {
        const bisher = hochgeladen.length
          ? ` Bereits hochgeladen: ${hochgeladen.join(', ')}.`
          : '';
        meldung(Core.klassifiziereFehler(e) + bisher, true);
      } finally {
        btn.disabled = false;
      }
    });
  }

  window.Jlawyer = {
    konfiguriert,
    init(app) {
      App = app;
      initEinstellungen();
      initLookup();
      initUpload();
    },
  };
})();
}
