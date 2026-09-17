// Nagelt die Datenschutz-Zusagen des Projekts als Literale fest.
//
// Ungewöhnlich für einen Test, aber hier das richtige Werkzeug: Diese Sätze
// stammen von einem Rechtsanwalt, betreffen Mandatsgeheimnis und DSGVO und
// sind im öffentlichen Modus eine Erklärung gegenüber Dritten. Über drei
// geplante Releases hinweg verschiebt jedes Zusatzmodul die Wahrheit ein
// Stück — und eine Zusage, die unbemerkt falsch wird, ist schlimmer als gar
// keine.
//
// Der Test verhindert keine Änderung. Er erzwingt, dass sie bewusst
// geschieht: Wer einen dieser Sätze anfasst, muss auch hier vorbeikommen.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..');
const lies = (datei) => fs.readFileSync(path.join(WURZEL, datei), 'utf8');

// Whitespace vereinheitlichen: Zeilenumbrüche im Markdown und HTML sollen
// den Vergleich nicht brechen, der Wortlaut aber schon.
const glatt = (text) => text.replace(/\s+/g, ' ');

function enthaelt(datei, satz, warum) {
  assert.ok(glatt(lies(datei)).includes(glatt(satz)),
    `In ${datei} fehlt die Zusage:\n\n  „${glatt(satz)}"\n\n${warum}`);
}

function enthaeltNicht(datei, satz, warum) {
  assert.ok(!glatt(lies(datei)).includes(glatt(satz)),
    `In ${datei} steht wieder:\n\n  „${glatt(satz)}"\n\n${warum}`);
}

const HINWEIS_ZUSATZMODUL =
  'Wird eine dieser Aussagen gelockert, muss zugleich das zugehörige ' +
  'Zusatzmodul-Kapitel erklären, was stattdessen gilt.';

// ── Die Aussagen müssen auf die Browser-App bezogen bleiben ───────────────

test('README schränkt das Kernversprechen auf die Browser-App ein', () => {
  enthaelt('README.md',
    'Die **Browser-App** arbeitet dabei ohne Konto, ohne Cloud und ohne Datenübertragung',
    'Mit aktivierter Rechen-Schnittstelle gilt der Satz nicht mehr unqualifiziert. ' +
    HINWEIS_ZUSATZMODUL);

  enthaeltNicht('README.md',
    'Ihre Daten bleiben dabei **komplett auf Ihrem Rechner** — kein Konto, keine Cloud, keine Datenübertragung.',
    'Das war die unqualifizierte Fassung aus 1.0.x. Sie ist seit der ' +
    'Rechen-Schnittstelle nicht mehr durchgehend wahr.');
});

test('Handbuch-Kapitel 1 nennt die Einschränkung beim Serverbetrieb', () => {
  const kapitel = 'docs/handbuch/01-was-ist-saldenwerk.md';
  enthaelt(kapitel,
    'Die **Browser-App** läuft vollständig in Ihrem Browser',
    'Der Satz muss das Subjekt nennen, für das er gilt.');
  enthaelt(kapitel,
    'solange das optionale API-Profil nicht aktiviert ist',
    'Ohne diesen Zusatz behauptet Kapitel 1, der Server liefere nur die App aus — ' +
    'mit aktiviertem API-Profil ist das falsch.');
  enthaelt(kapitel, 'Zusatzmodule',
    'Kapitel 1 muss auf die Zusatzmodule hinweisen und dorthin verweisen.');
});

test('Handbuch-Kapitel 8 spricht von Konten, nicht von allem', () => {
  enthaelt('docs/handbuch/08-datenspeicherung.md',
    'Saldenwerk speichert Ihre Konten nicht auf fremden Servern.',
    'Der frühere Satz „speichert nichts auf fremden Servern" war zu weit gefasst.');
  enthaelt('docs/handbuch/08-datenspeicherung.md',
    'Stufe 3: Zugriff durch Zusatzmodule',
    'Kapitel 8 muss erklären, wer außer der App auf die Daten zugreift.');
});

test('die Datenschutzerklärung qualifiziert ihre Eingangsaussage', () => {
  enthaelt('datenschutz.html',
    'In der Standardauslieferung verarbeitet Saldenwerk <strong>keine personenbezogenen Daten auf dem Server</strong>.',
    'Ohne „In der Standardauslieferung" ist der Satz mit aktiver Schnittstelle falsch — ' +
    'und diese Seite ist eine Erklärung gegenüber Dritten.');
});

// ── Die technischen Zusicherungen, auf denen die Texte ruhen ──────────────

test('die Zustandslosigkeit ist überall zugesichert, wo sie zählt', () => {
  // Trägt die Datenschutzerklärung. Fiele sie weg, müssten Speicherdauer,
  // Löschkonzept und Betroffenenrechte neu formuliert werden.
  enthaelt('datenschutz.html',
    'Eine <strong>Speicherung findet nicht statt</strong>',
    'Ohne die Zustandslosigkeit trägt die Datenschutzerklärung nicht mehr.');
  enthaelt('docs/handbuch/12-rest-api.md', 'Sie ist zustandslos.',
    'Kapitel 12 muss die Zustandslosigkeit ausdrücklich benennen.');
  enthaelt('CHANGELOG.md', 'Die Schnittstelle ist **zustandslos**',
    'Der Release-Eintrag muss die Eigenschaft nennen, die den Datenschutz trägt.');
});

test('die Zusage, Anfragen nicht zu protokollieren, ist technisch gedeckt', () => {
  enthaelt('datenschutz.html',
    '<strong>Inhalte Ihrer Anfragen werden nicht protokolliert.</strong>',
    'Die Zusage gehört in die Erklärung — sie ist nicht selbstverständlich.');
  // Und sie muss technisch stimmen: Aktenzeichen stehen als ?kontoId= im
  // Adressteil, den nginx im Standard mitprotokolliert.
  const block = lies('docker/default.conf.template');
  const apiBlock = block.slice(block.indexOf('location ^~ /api/'));
  assert.match(apiBlock, /access_log off;/,
    'datenschutz.html sichert zu, dass Anfragen nicht protokolliert werden — ' +
    'der /api/-Block in docker/default.conf.template schaltet access_log aber nicht ab. ' +
    'Entweder die Zusage streichen oder die Protokollierung abschalten.');
});

test('die Anmeldepflicht ist zugesichert und fail-closed umgesetzt', () => {
  enthaelt('datenschutz.html', 'Der Zugang ist durch eine Anmeldung geschützt.',
    'Die Erklärung nennt den Schutz — er muss auch bestehen.');
  const server = lies('server/server.js');
  assert.match(server, /SALDENWERK_API_BENUTZER/);
  assert.match(server, /process\.exit\(1\)/,
    'server.js bricht nicht ab, wenn Zugangsdaten fehlen — die Zusage wäre hinfällig.');
});

test('kein Modul verspricht, was es nicht halten kann', () => {
  // Die Rechen-Schnittstelle bleibt im Haus. Sobald ein Modul Daten an
  // Dritte gibt, darf Kapitel 9 das nicht mehr verschweigen.
  enthaelt('docs/handbuch/09-integrationen.md',
    'eine KI-Anbindung würde Mandatsdaten an ein fremdes Unternehmen übertragen',
    'Kapitel 9 muss den Unterschied zwischen den Modulen benennen, bevor jemand ' +
    'eines davon für harmlos hält.');
  enthaelt('docs/handbuch/12-rest-api.md',
    'aber **nicht die Kanzlei**',
    'Kapitel 12 muss klarstellen, dass die Schnittstelle im Haus bleibt — sonst ' +
    'wird sie mit einer Übermittlung an Dritte verwechselt.');
});

// ── Vollständigkeit ───────────────────────────────────────────────────────

test('jedes Zusatzmodul-Kapitel hat einen Datenschutz-Abschnitt', () => {
  const kapitel = fs.readdirSync(path.join(WURZEL, 'docs', 'handbuch'))
    .filter((d) => /^1[2-9]-/.test(d));
  assert.ok(kapitel.length > 0, 'kein Zusatzmodul-Kapitel gefunden');
  for (const datei of kapitel) {
    const inhalt = lies(path.join('docs', 'handbuch', datei));
    assert.match(inhalt, /## Datenschutz/,
      `${datei} beschreibt ein Zusatzmodul, hat aber keinen Datenschutz-Abschnitt.`);
    assert.match(inhalt, /standardmäßig (aus|\*\*aus\*\*)/,
      `${datei} sagt nicht, dass das Modul standardmäßig aus ist.`);
  }
});

test('das Handbuch verweist auf jedes vorhandene Kapitel', () => {
  const uebersicht = lies('docs/handbuch/README.md');
  for (const datei of fs.readdirSync(path.join(WURZEL, 'docs', 'handbuch'))) {
    if (datei === 'README.md' || !datei.endsWith('.md')) continue;
    assert.ok(uebersicht.includes(datei),
      `${datei} fehlt in der Inhaltstabelle von docs/handbuch/README.md`);
  }
});

test('alle Querverweise im Handbuch zeigen auf vorhandene Dateien', () => {
  const ordner = path.join(WURZEL, 'docs', 'handbuch');
  for (const datei of fs.readdirSync(ordner).filter((d) => d.endsWith('.md'))) {
    const inhalt = fs.readFileSync(path.join(ordner, datei), 'utf8');
    for (const treffer of inhalt.matchAll(/\]\((?!https?:|#)([^)#]+)/g)) {
      const ziel = path.join(ordner, treffer[1]);
      assert.ok(fs.existsSync(ziel), `${datei} verweist auf fehlende Datei ${treffer[1]}`);
    }
  }
});
