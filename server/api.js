// server/api.js — Router, Authentifizierung und Fehlerformat der Saldenwerk-API.
//
// Zustandslos: Der Request-Body ist exakt das Dateiformat Version 1, wie es
// auch auf dem Netzlaufwerk liegt. Der Server hält keine Konten, keine
// Datenbank und keine Datei — er rechnet und vergisst. Genau diese Eigenschaft
// trägt die Aussagen in datenschutz.html; sie darf nicht stillschweigend
// aufgegeben werden.
//
// erzeugeServer(konfig) nimmt die Konfiguration als Parameter entgegen (statt
// process.env selbst zu lesen), damit Tests in-process auf Port 0 starten
// können. Das Lesen der Umgebung und der fail-closed-Start liegen in server.js.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Kern = require('../kern.js');

const MAX_BYTES = 10 * 1024 * 1024; // identisch zu client_max_body_size im nginx-Block
const REALM = 'Saldenwerk';

// Der Zweck der Fehlercodes aus kern.js: eine Stelle, an der die fachliche
// Lage auf HTTP abgebildet wird. Niemand muss deutsche Texte parsen.
const HTTP_FUER_CODE = {
  [Kern.FEHLERCODES.BESTAND_UNGUELTIG]: 400,
  [Kern.FEHLERCODES.STICHTAG_UNGUELTIG]: 400,
  [Kern.FEHLERCODES.RVG_EINGABE_UNGUELTIG]: 400,
  [Kern.FEHLERCODES.KONTO_MEHRDEUTIG]: 400,
  [Kern.FEHLERCODES.KONTO_LEER]: 400,
  [Kern.FEHLERCODES.KONTO_NICHT_GEFUNDEN]: 404,
};

// Node lehnt Nicht-ASCII in Kopfzeilen ab (ERR_INVALID_CHAR) — ein Konto
// „Müller" hätte den PDF-Endpunkt sonst mit 500 beendet. Der Dateiname selbst
// behält seine Umlaute (er landet auch im Dateisystem und bei j-lawyer); nur
// für die Kopfzeile wird nach RFC 6266/5987 kodiert: filename= trägt eine
// ASCII-Ersatzschreibung für alte Clients, filename*= den echten Namen.
const UMSCHRIFT = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };

function inhaltsVerfuegung(dateiname) {
  const ascii = dateiname
    .replace(/[äöüÄÖÜß]/g, (zeichen) => UMSCHRIFT[zeichen])
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(dateiname)}`;
}

function sendeJson(antwort, status, objekt, kopfzeilen) {
  const text = JSON.stringify(objekt);
  antwort.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  }, kopfzeilen || {}));
  antwort.end(text);
}

function sendeFehler(antwort, status, text, code) {
  const koerper = { fehler: text };
  if (code) koerper.code = code;
  sendeJson(antwort, status, koerper);
}

// Ergebnis aus kern.js auf HTTP abbilden.
function sendeKernFehler(antwort, ergebnis) {
  sendeFehler(antwort, HTTP_FUER_CODE[ergebnis.code] || 400, ergebnis.fehler, ergebnis.code);
}

// ── Authentifizierung ──────────────────────────────────────────────────────

// Vergleich über SHA-256-Hashes fester Länge: timingSafeEqual verlangt gleiche
// Längen und würde sonst schon an der Längenprüfung verraten, wie lang das
// hinterlegte Passwort ist.
function gleich(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function istAngemeldet(anfrage, konfig) {
  const kopf = anfrage.headers.authorization || '';
  if (!kopf.startsWith('Basic ')) return false;
  let entschluesselt;
  try {
    entschluesselt = Buffer.from(kopf.slice(6), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const trenner = entschluesselt.indexOf(':');
  if (trenner < 0) return false;
  // Beide Vergleiche immer ausführen, damit die Laufzeit nicht verrät,
  // ob schon der Benutzername falsch war.
  const benutzerOk = gleich(entschluesselt.slice(0, trenner), konfig.benutzer);
  const passwortOk = gleich(entschluesselt.slice(trenner + 1), konfig.passwort);
  return benutzerOk && passwortOk;
}

// ── Body ───────────────────────────────────────────────────────────────────

function liesKoerper(anfrage) {
  return new Promise((erfuellen, ablehnen) => {
    const teile = [];
    let laenge = 0;
    anfrage.on('data', (teil) => {
      laenge += teil.length;
      if (laenge > MAX_BYTES) {
        ablehnen(Object.assign(new Error('zu gross'), { status: 413 }));
        anfrage.destroy();
        return;
      }
      teile.push(teil);
    });
    anfrage.on('end', () => erfuellen(Buffer.concat(teile)));
    anfrage.on('error', ablehnen);
  });
}

async function leseBestand(anfrage, antwort) {
  const typ = (anfrage.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (typ !== 'application/json') {
    sendeFehler(antwort, 415, 'Der Inhaltstyp muss application/json sein.');
    return null;
  }
  let roh;
  try {
    roh = await liesKoerper(anfrage);
  } catch (e) {
    if (e.status === 413) {
      sendeFehler(antwort, 413, 'Die übermittelten Daten sind größer als 10 MB.');
    } else {
      sendeFehler(antwort, 400, 'Die Anfrage konnte nicht gelesen werden.');
    }
    return null;
  }
  if (!roh.length) {
    sendeFehler(antwort, 400, 'Die Anfrage enthält keine Daten.');
    return null;
  }
  let objekt;
  try {
    objekt = JSON.parse(roh.toString('utf8'));
  } catch {
    sendeFehler(antwort, 400, 'Die Anfrage enthält kein gültiges JSON.');
    return null;
  }
  const bestand = Kern.ladeBestand(objekt);
  if (!bestand.ok) {
    sendeKernFehler(antwort, bestand);
    return null;
  }
  return bestand;
}

// Gemeinsame Abwicklung aller Rechen-Endpunkte: Body lesen, Anwendungsfall
// aufrufen, Ergebnis senden.
function rechnend(anwendungsfall, sendeErgebnis) {
  return async (anfrage, antwort, adresse) => {
    const bestand = await leseBestand(anfrage, antwort);
    if (!bestand) return;
    const ergebnis = anwendungsfall({
      bestand,
      kontoId: adresse.searchParams.get('kontoId'),
      stichtag: adresse.searchParams.get('stichtag'),
    });
    if (!ergebnis.ok) return sendeKernFehler(antwort, ergebnis);
    sendeErgebnis(antwort, ergebnis, adresse);
  };
}

// ── Endpunkte ──────────────────────────────────────────────────────────────

// Schnittstellenbeschreibung und Swagger UI. Ohne Anmeldung erreichbar —
// die Beschreibung enthält keine Daten, und ein Anmeldedialog vor der
// Dokumentationsseite würde nur verhindern, dass man sich dort anmelden kann.
// Die Endpunkte selbst bleiben geschützt.
const DOKU_DATEIEN = {
  '/api/docs': { datei: path.join(__dirname, 'docs.html'), typ: 'text/html; charset=utf-8' },
  '/api/docs/swagger-ui.css': {
    datei: path.join(__dirname, '..', 'vendor', 'swagger-ui', 'swagger-ui.css'),
    typ: 'text/css; charset=utf-8', cachen: true },
  '/api/docs/swagger-ui-bundle.js': {
    datei: path.join(__dirname, '..', 'vendor', 'swagger-ui', 'swagger-ui-bundle.js'),
    typ: 'application/javascript; charset=utf-8', cachen: true },
};

function sendeDatei(antwort, eintrag) {
  let inhalt;
  try {
    inhalt = fs.readFileSync(eintrag.datei);
  } catch {
    return sendeFehler(antwort, 404,
      'Die Schnittstellenbeschreibung ist in dieser Installation nicht mitgeliefert.');
  }
  antwort.writeHead(200, {
    'Content-Type': eintrag.typ,
    'Content-Length': inhalt.length,
    'Cache-Control': eintrag.cachen ? 'public, max-age=3600' : 'no-cache',
  });
  antwort.end(inhalt);
}

function baueRouten(konfig) {
  const dokuRouten = Object.entries(DOKU_DATEIEN).map(([pfad, eintrag]) => ({
    methode: 'GET', pfad, auth: false,
    behandle: (anfrage, antwort) => sendeDatei(antwort, eintrag),
  }));

  return dokuRouten.concat([
    { methode: 'GET', pfad: '/api/openapi.json', auth: false, behandle: (anfrage, antwort) => {
      sendeDatei(antwort, { datei: path.join(__dirname, 'openapi.json'),
        typ: 'application/json; charset=utf-8' });
    } },

    // Ohne Auth: Die Browser-UI erkennt daran, ob überhaupt eine API läuft.
    { methode: 'GET', pfad: '/api/status', auth: false, behandle: (a, antwort) => {
      sendeJson(antwort, 200, {
        app: 'Saldenwerk',
        version: Kern.VERSION,
        features: { jlawyer: Boolean(konfig.jlawyer) },
      });
    } },

    { methode: 'GET', pfad: '/api/basiszins', auth: true, behandle: (a, antwort) => {
      const r = Kern.basiszins([]);
      sendeJson(antwort, 200, { tabelle: r.tabelle, deckungsEnde: r.deckungsEnde });
    } },

    { methode: 'POST', pfad: '/api/berechnung', auth: true,
      behandle: rechnend(Kern.berechnung, (antwort, r) => sendeJson(antwort, 200, r.ergebnis)) },

    { methode: 'POST', pfad: '/api/report', auth: true,
      behandle: rechnend(Kern.report, (antwort, r) =>
        sendeJson(antwort, 200, { modell: r.modell, html: r.html })) },

    { methode: 'POST', pfad: '/api/tenor', auth: true,
      behandle: rechnend(Kern.tenor, (antwort, r) =>
        sendeJson(antwort, 200, { text: r.text, hinweis: r.hinweis })) },

    { methode: 'POST', pfad: '/api/pdf', auth: true,
      behandle: rechnend(Kern.pdfModell, (antwort, r, adresse) => {
        // Erst hier laden: pdf-node.js setzt einen globalen window-Shim.
        const PdfNode = require('../pdf-node.js');
        const buffer = PdfNode.erzeugePdf(r.modell);
        if (adresse.searchParams.get('format') === 'base64') {
          return sendeJson(antwort, 200,
            { dateiname: r.dateiname, pdf: buffer.toString('base64') });
        }
        antwort.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': buffer.length,
          'Content-Disposition': inhaltsVerfuegung(r.dateiname),
          'Cache-Control': 'no-store',
        });
        antwort.end(buffer);
      }) },

    { methode: 'POST', pfad: '/api/rvg', auth: true, behandle: async (anfrage, antwort) => {
      const typ = (anfrage.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (typ !== 'application/json') {
        return sendeFehler(antwort, 415, 'Der Inhaltstyp muss application/json sein.');
      }
      let roh;
      try {
        roh = await liesKoerper(anfrage);
      } catch (e) {
        return e.status === 413
          ? sendeFehler(antwort, 413, 'Die übermittelten Daten sind größer als 10 MB.')
          : sendeFehler(antwort, 400, 'Die Anfrage konnte nicht gelesen werden.');
      }
      let eingaben;
      try {
        eingaben = JSON.parse(roh.toString('utf8') || 'null');
      } catch {
        return sendeFehler(antwort, 400, 'Die Anfrage enthält kein gültiges JSON.');
      }
      const r = Kern.rvg(eingaben);
      if (!r.ok) return sendeKernFehler(antwort, r);
      sendeJson(antwort, 200, { buchungen: r.buchungen, hinweise: r.hinweise, stand: r.stand });
    } },
  ]);
}

// ── Server ─────────────────────────────────────────────────────────────────

function erzeugeServer(konfig) {
  if (!konfig || !konfig.benutzer || !konfig.passwort) {
    throw new Error('erzeugeServer braucht benutzer und passwort.');
  }
  const routen = baueRouten(konfig);

  return http.createServer(async (anfrage, antwort) => {
    try {
      const adresse = new URL(anfrage.url, 'http://saldenwerk.invalid');
      const pfad = adresse.pathname.replace(/\/+$/, '') || '/';
      const passend = routen.filter((r) => r.pfad === pfad);

      if (passend.length === 0) {
        return sendeFehler(antwort, 404, `Der Pfad „${pfad}" ist nicht bekannt.`);
      }
      const route = passend.find((r) => r.methode === anfrage.method)
        || (anfrage.method === 'HEAD' ? passend.find((r) => r.methode === 'GET') : null);
      if (!route) {
        return sendeFehler(antwort, 405,
          `Die Methode ${anfrage.method} ist für „${pfad}" nicht zulässig.`);
      }
      if (route.auth && !istAngemeldet(anfrage, konfig)) {
        return sendeJson(antwort, 401, { fehler: 'Anmeldung erforderlich.' },
          { 'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"` });
      }
      await route.behandle(anfrage, antwort, adresse);
    } catch (e) {
      // Fachliche Fehler kommen als Objekt aus kern.js; hier landet nur
      // Unerwartetes. Der Text darf keine Interna preisgeben.
      process.stderr.write(`[saldenwerk-api] unerwarteter Fehler: ${e && e.stack}\n`);
      if (!antwort.headersSent) {
        sendeFehler(antwort, 500, 'Bei der Berechnung ist ein unerwarteter Fehler aufgetreten.');
      } else {
        antwort.end();
      }
    }
  });
}

// baueRouten wird mitexportiert, damit tests/api-openapi.test.js die
// tatsächlich bedienten Pfade gegen server/openapi.json abgleichen kann —
// in beide Richtungen. Sonst läuft die Beschreibung von der Implementierung
// weg, ohne dass es jemandem auffällt.
module.exports = { erzeugeServer, baueRouten, inhaltsVerfuegung, MAX_BYTES };
