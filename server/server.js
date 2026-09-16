// server/server.js — Einstiegspunkt der Saldenwerk-API.
//
// Der einzige Ort, der process.env, process.exit und listen kennt. Die
// eigentliche API liegt in api.js und nimmt ihre Konfiguration als Parameter
// entgegen, damit Tests sie in-process auf Port 0 starten können.
//
// fail-closed: Ohne hinterlegte Zugangsdaten startet der Dienst nicht. Eine
// versehentlich offene Rechen-Schnittstelle im Kanzleinetz wäre schlimmer als
// eine, die gar nicht läuft.
const { erzeugeServer } = require('./api.js');
const Kern = require('../kern.js');

const STANDARD_PORT = 8091;

function abbruch(text) {
  process.stderr.write(`[saldenwerk-api] ${text}\n`);
  process.exit(1);
}

function leseKonfiguration(umgebung) {
  const benutzer = umgebung.SALDENWERK_API_BENUTZER;
  const passwort = umgebung.SALDENWERK_API_PASSWORT;
  if (!benutzer || !passwort) {
    return { fehler: 'SALDENWERK_API_BENUTZER und SALDENWERK_API_PASSWORT müssen gesetzt sein. ' +
      'Ohne Zugangsdaten startet die Schnittstelle nicht.' };
  }

  // Halb konfigurierte j-lawyer-Anbindungen sind gefährlicher als gar keine:
  // Entweder alle drei Werte oder keiner.
  const jlawyerFelder = ['JLAWYER_URL', 'JLAWYER_BENUTZER', 'JLAWYER_PASSWORT'];
  const gesetzt = jlawyerFelder.filter((feld) => umgebung[feld]);
  if (gesetzt.length && gesetzt.length !== jlawyerFelder.length) {
    const fehlend = jlawyerFelder.filter((feld) => !umgebung[feld]);
    return { fehler: `Die j-lawyer-Anbindung ist unvollständig konfiguriert — es fehlt: ${fehlend.join(', ')}. ` +
      'Entweder alle drei Werte setzen oder keinen.' };
  }

  const rohPort = umgebung.SALDENWERK_API_PORT;
  const port = rohPort === undefined || rohPort === '' ? STANDARD_PORT : Number(rohPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return { fehler: `SALDENWERK_API_PORT „${rohPort}" ist keine gültige Portnummer.` };
  }

  return {
    konfig: {
      benutzer, passwort, port,
      jlawyer: gesetzt.length === jlawyerFelder.length
        ? { url: umgebung.JLAWYER_URL, benutzer: umgebung.JLAWYER_BENUTZER,
          passwort: umgebung.JLAWYER_PASSWORT }
        : null,
    },
  };
}

// Ein Node ohne vollständiges ICU formatiert Beträge still falsch — aus
// 1.234,50 € würde 1,234.50 €, und das fiele erst im fertigen Schriftsatz auf.
function pruefeUmgebung() {
  const probe = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2 }).format(1234.5);
  if (probe !== '1.234,50') {
    abbruch(`Diese Node-Installation kennt das deutsche Zahlenformat nicht (ergab „${probe}" ` +
      'statt „1.234,50"). Beträge wären still falsch — Start abgebrochen.');
  }
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone !== 'Europe/Berlin') {
    // Kein Abbruch: Wer bewusst in einer anderen Zone betreibt, soll das
    // können. Aber der Default-Stichtag und das Erstellungsdatum folgen der
    // Systemzeit, also muss es sichtbar sein.
    process.stderr.write(`[saldenwerk-api] Warnung: Zeitzone ist „${zone}", nicht Europe/Berlin. ` +
      'Der Default-Stichtag und das Erstellungsdatum folgen der Systemzeit.\n');
  }
}

function starte(umgebung) {
  pruefeUmgebung();
  const gelesen = leseKonfiguration(umgebung);
  if (gelesen.fehler) abbruch(gelesen.fehler);
  const konfig = gelesen.konfig;

  const server = erzeugeServer(konfig);
  server.listen(konfig.port, () => {
    const adresse = server.address();
    process.stderr.write(`[saldenwerk-api] Saldenwerk ${Kern.VERSION} hört auf Port ${adresse.port}. ` +
      `j-lawyer: ${konfig.jlawyer ? 'aktiv' : 'aus'}.\n`);
    process.stderr.write('[saldenwerk-api] Hinweis: Die Anmeldung läuft über HTTP Basic Auth. ' +
      'Ohne TLS davor werden die Zugangsdaten im Klartext übertragen — im Kanzleinetz ' +
      'vertretbar, darüber hinaus nicht (siehe docker/ssl.conf.template).\n');
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
  return server;
}

if (require.main === module) starte(process.env);

module.exports = { leseKonfiguration, starte, STANDARD_PORT };
