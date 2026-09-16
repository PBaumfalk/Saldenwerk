// Eine Versionsnummer, mehrere Stellen.
//
// Vor 1.1.0 gab es im Quelltext überhaupt keinen Versionsstring — die Version
// lebte allein im Git-Tag und im CHANGELOG. Mit /api/status, MCP-serverInfo,
// cli.js --version und dem Plugin-Manifest braucht sie jetzt mehrere Abnehmer.
// Kern.VERSION ist die Quelle; dieser Test hält die Abnehmer daran fest.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Kern = require('../kern.js');

const WURZEL = path.join(__dirname, '..');
const SEMVER = /^\d+\.\d+\.\d+$/;

function lies(datei) {
  return fs.readFileSync(path.join(WURZEL, datei), 'utf8');
}

test('Kern.VERSION ist eine SemVer-Nummer', () => {
  assert.match(Kern.VERSION, SEMVER);
});

test('die oberste CHANGELOG-Überschrift nennt Kern.VERSION', () => {
  const treffer = lies('CHANGELOG.md').match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(treffer, 'keine Versionsüberschrift im Format „## [x.y.z]" gefunden');
  assert.strictEqual(treffer[1], Kern.VERSION,
    'CHANGELOG.md und kern.js nennen verschiedene Versionen');
});

test('die oberste CHANGELOG-Version hat einen Vergleichslink', () => {
  const inhalt = lies('CHANGELOG.md');
  assert.ok(inhalt.includes(`[${Kern.VERSION}]: https://github.com/`),
    `am Dateiende fehlt der Link-Eintrag für [${Kern.VERSION}]`);
});

test('das Plugin-Manifest nennt dieselbe Version', { skip: !fs.existsSync(
  path.join(WURZEL, '.claude-plugin', 'plugin.json')) && 'plugin.json entsteht erst in 1.2.0' },
() => {
  const manifest = JSON.parse(lies('.claude-plugin/plugin.json'));
  assert.strictEqual(manifest.version, Kern.VERSION);
});

test('der Marketplace-Eintrag nennt dieselbe Version', { skip: !fs.existsSync(
  path.join(WURZEL, '.claude-plugin', 'marketplace.json')) && 'entsteht erst in 1.2.0' },
() => {
  const markt = JSON.parse(lies('.claude-plugin/marketplace.json'));
  for (const eintrag of markt.plugins || []) {
    if (eintrag.version !== undefined) {
      assert.strictEqual(eintrag.version, Kern.VERSION,
        `Marketplace-Eintrag „${eintrag.name}" nennt eine andere Version`);
    }
  }
});

test('bei einem Tag-Build passt der Git-Tag zu Kern.VERSION', { skip:
  !(process.env.GITHUB_REF_NAME || '').startsWith('v') && 'kein Tag-Build' },
() => {
  assert.strictEqual(process.env.GITHUB_REF_NAME.slice(1), Kern.VERSION,
    'Git-Tag und kern.js nennen verschiedene Versionen');
});
