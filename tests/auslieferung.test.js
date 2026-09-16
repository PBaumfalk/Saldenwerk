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
