// Hält index.html und Dockerfile deckungsgleich.
//
// Beide Dateien führen die auszuliefernden Dateien von Hand auf: index.html
// als <script src>/<link href>, das Dockerfile in einer COPY-Zeile. Wird eine
// neue Datei nur in index.html eingetragen, ist das ein 404 — aber nur im
// Container-Betrieb. Beim lokalen Öffnen über file:// fällt es nicht auf,
// und der bestehende Smoke-Test prüft nur drei feste Pfade.
//
// Die Falle wird in 1.3.0 scharf, wenn jlawyer-core.js und jlawyer.js
// hinzukommen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..');
const lies = (datei) => fs.readFileSync(path.join(WURZEL, datei), 'utf8');

const INDEX = lies('index.html');
const DOCKERFILE = lies('Dockerfile');

function referenzen() {
  const gefunden = [];
  for (const treffer of INDEX.matchAll(/<script[^>]+src="([^"]+)"/g)) gefunden.push(treffer[1]);
  for (const treffer of INDEX.matchAll(/<link[^>]+href="([^"]+\.css)"/g)) gefunden.push(treffer[1]);
  return gefunden.filter((pfad) => !/^(https?:)?\/\//.test(pfad));
}

test('index.html referenziert überhaupt Dateien', () => {
  const alle = referenzen();
  assert.ok(alle.length >= 10, `nur ${alle.length} Referenzen gefunden — Regex prüfen`);
  assert.ok(alle.includes('app.js'));
  assert.ok(alle.includes('styles.css'));
});

test('jede von index.html referenzierte Datei existiert', () => {
  for (const pfad of referenzen()) {
    assert.ok(fs.existsSync(path.join(WURZEL, pfad)), `index.html verweist auf fehlende ${pfad}`);
  }
});

test('jede von index.html referenzierte Datei wird ins Image kopiert', () => {
  // Ordner werden am Stück kopiert (COPY vendor/ …), Einzeldateien namentlich.
  const ordnerKopien = [...DOCKERFILE.matchAll(/^COPY\s+([\w-]+)\//gm)].map((t) => t[1] + '/');
  for (const pfad of referenzen()) {
    if (ordnerKopien.some((ordner) => pfad.startsWith(ordner))) continue;
    assert.ok(new RegExp(`(^|[\\s\\\\])${pfad.replace(/\./g, '\\.')}(\\s|\\\\|$)`, 'm').test(DOCKERFILE),
      `„${pfad}" steht in index.html, fehlt aber in der COPY-Zeile des Dockerfile — ` +
      'im Container ergäbe das einen 404, beim Öffnen über file:// nicht.');
  }
});

test('das Dockerfile kopiert keine Datei, die es nicht gibt', () => {
  const zeile = DOCKERFILE.match(/^COPY\s+((?:[^\n\\]|\\\n)+?)\s+\/usr\/share\/nginx\/html\/$/m);
  assert.ok(zeile, 'COPY-Zeile für die App-Dateien nicht gefunden');
  const dateien = zeile[1].replace(/\\\n/g, ' ').trim().split(/\s+/);
  for (const datei of dateien) {
    assert.ok(fs.existsSync(path.join(WURZEL, datei)),
      `Dockerfile kopiert „${datei}", die Datei existiert aber nicht`);
  }
});

test('Swagger UI wird aus dem nginx-Image wieder entfernt', () => {
  // COPY vendor/ zieht auch vendor/swagger-ui/ mit (1,6 MB). Das gehört zum
  // API-Container unter /api/docs, nicht in die Browser-App — dort wäre es
  // totes Gewicht im Image und im Jahres-Cache der Clients.
  assert.match(DOCKERFILE, /rm -rf \/usr\/share\/nginx\/html\/vendor\/swagger-ui/,
    'Das Dockerfile kopiert vendor/ am Stück, entfernt Swagger UI aber nicht wieder.');
});

test('das API-Image bringt alles mit, was server/ und kern.js brauchen', () => {
  const api = lies('Dockerfile.api');
  for (const datei of ['kern.js', 'pdf-node.js', 'engine.js', 'basiszins.js', 'rvg.js',
    'tenor.js', 'druck.js', 'pdfexport.js', 'app.js']) {
    assert.ok(new RegExp(`(^|\\s)${datei.replace(/\./g, '\\.')}(\\s|\\\\|$)`, 'm').test(api),
      `Dockerfile.api kopiert „${datei}" nicht — der Server kann es nicht laden.`);
  }
  for (const pfad of ['server/', 'vendor/swagger-ui/',
    'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js']) {
    assert.ok(api.includes(pfad), `Dockerfile.api kopiert „${pfad}" nicht.`);
  }
  // Ohne tzdata läuft Alpine in UTC, und Engine.heute() liefert nachts den
  // Vortag — der bereits behobene Fehler aus Commit 63c0c6f.
  assert.match(api, /apk add --no-cache tzdata/, 'Dockerfile.api installiert kein tzdata');
  assert.match(api, /ENV TZ=Europe\/Berlin/, 'Dockerfile.api setzt keine Zeitzone');
});

test('der nginx-Block für /api/ ist gegen die envsubst-Falle abgesichert', () => {
  const vorlage = lies('docker/default.conf.template');
  const compose = lies('docker-compose.yml');
  assert.match(vorlage, /location \/api\//, 'kein /api/-Block in der nginx-Vorlage');

  // Die eigentliche Absicherung, und sie gehört ins Image, nicht zum Aufrufer:
  // envsubst ersetzt nur Variablen, die in der Umgebung existieren. Fehlt der
  // Vorgabewert, bleibt der Platzhalter wörtlich stehen und nginx startet gar
  // nicht — bei jedem, der das Image per „docker run" startet. Genau so steht
  // es in README.md und in docs/handbuch/02-installation.md.
  assert.match(DOCKERFILE, /ENV SALDENWERK_API_URL=""/,
    'Dem Dockerfile fehlt der leere Vorgabewert für SALDENWERK_API_URL. ' +
    'Ohne ihn startet der Container bei „docker run" nicht mehr — dem in ' +
    'README.md und Handbuch-Kapitel 2 dokumentierten Standardweg.');
  // Zusätzlich in Compose, damit die Absicht dort sichtbar bleibt.
  assert.match(compose, /SALDENWERK_API_URL: "\$\{SALDENWERK_API_URL:-\}"/,
    'docker-compose.yml definiert SALDENWERK_API_URL nicht mit leerem Default.');
  assert.match(vorlage, /if \(\$api = ""\) \{ return 404; \}/,
    'der /api/-Block fällt bei leerer Variable nicht auf 404 zurück');
  // Aktenzeichen stehen im Query-String (?kontoId=) und dürfen nicht in
  // Logdateien landen — datenschutz.html sichert das Gegenteil zu.
  const block = vorlage.slice(vorlage.indexOf('location /api/'));
  assert.match(block, /access_log off;/,
    'der /api/-Block protokolliert Anfragen samt Aktenbezug im Query-String');
  // add_header vererbt in nginx nicht additiv: jeder location-Block mit
  // eigenem add_header braucht sein eigenes include.
  assert.match(block, /include \/etc\/nginx\/includes\/security-headers\.conf;/,
    'dem /api/-Block fehlen die Sicherheits-Header');
});

test('Node-Module der Zusatzschicht landen nicht im nginx-Image', () => {
  // kern.js und pdf-node.js sind (noch) reine Node-Module: die Browser-App
  // nutzt sie nicht, also gehören sie nicht in das statische Image.
  // Wird kern.js später in index.html eingebunden, schlägt der Test oben an
  // und erzwingt den Eintrag im Dockerfile — dann ist diese Zusicherung
  // bewusst zu streichen.
  for (const datei of ['pdf-node.js']) {
    assert.ok(!new RegExp(`(^|\\s)${datei.replace(/\./g, '\\.')}(\\s|\\\\|$)`, 'm').test(DOCKERFILE),
      `„${datei}" hat im statischen nginx-Image nichts zu suchen`);
    assert.ok(!referenzen().includes(datei),
      `„${datei}" ist ein Node-Modul und gehört nicht in index.html`);
  }
});
