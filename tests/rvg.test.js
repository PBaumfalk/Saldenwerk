const test = require('node:test');
const assert = require('node:assert');
const Rvg = require('../rvg.js');

test('rvgGebuehr: Wertstufen nach § 13 RVG (KostRÄG 2025)', () => {
  assert.strictEqual(Rvg.rvgGebuehr(500), 51.5);
  assert.strictEqual(Rvg.rvgGebuehr(1000), 93.0);
  assert.strictEqual(Rvg.rvgGebuehr(1000.01), 134.5);
  assert.strictEqual(Rvg.rvgGebuehr(2000), 176.0);
  assert.strictEqual(Rvg.rvgGebuehr(5000), 354.5);
  assert.strictEqual(Rvg.rvgGebuehr(10000), 652.0);
  assert.strictEqual(Rvg.rvgGebuehr(500000), 3752.0);
  assert.strictEqual(Rvg.rvgGebuehr(550000), 3927.0);
});

test('gkgGebuehr: Wertstufen nach § 34 GKG (KostRÄG 2025)', () => {
  assert.strictEqual(Rvg.gkgGebuehr(500), 40.0);
  assert.strictEqual(Rvg.gkgGebuehr(1000), 61.0);
  assert.strictEqual(Rvg.gkgGebuehr(2000), 103.0);
  assert.strictEqual(Rvg.gkgGebuehr(5000), 170.5);
  assert.strictEqual(Rvg.gkgGebuehr(10000), 283.0);
});

test('mahngerichtskosten: 0,5-Gebühr mit Mindestbetrag 38 € (KV 1100)', () => {
  assert.strictEqual(Rvg.mahngerichtskosten(1000), 38.0);
  assert.strictEqual(Rvg.mahngerichtskosten(5000), 85.25);
});

test('baueNebenforderungen: vorgerichtlicher Standardfall 1.000 €', () => {
  const r = Rvg.baueNebenforderungen({
    gegenstandswert: 1000, datum: '2026-08-05',
    vorgerichtlich: { aktiv: true, faktor: 1.3, auslagenpauschale: true, umsatzsteuer: true },
    gerichtlich: { aktiv: false },
    verzugspauschale: false,
  });
  assert.deepStrictEqual(r.buchungen.map((b) => [b.text, b.betrag]), [
    ['1,3 Geschäftsgebühr Nr. 2300 VV RVG (Wert: 1.000,00 €)', 120.9],
    ['Auslagenpauschale Nr. 7002 VV RVG', 20.0],
    ['19 % USt Nr. 7008 VV RVG', 26.77],
  ]);
  assert.ok(r.buchungen.every((b) => b.typ === 'nebenforderung' && b.datum === '2026-08-05'
    && b.verzinsung === null && b.betrag > 0 && !('id' in b)));
});

test('baueNebenforderungen: Auslagenpauschale unter der 20-€-Kappung', () => {
  // Wert 500 €: 0,5 × 51,50 = 25,75 → 20 % = 5,15
  const r = Rvg.baueNebenforderungen({
    gegenstandswert: 500, datum: '2026-08-05',
    vorgerichtlich: { aktiv: true, faktor: 0.5, auslagenpauschale: true, umsatzsteuer: false },
    gerichtlich: { aktiv: false },
    verzugspauschale: false,
  });
  assert.deepStrictEqual(r.buchungen.map((b) => b.betrag), [25.75, 5.15]);
});

test('baueNebenforderungen: Anrechnung nach Vorbem. 3 Abs. 4 VV RVG', () => {
  const r = Rvg.baueNebenforderungen({
    gegenstandswert: 1000, datum: '2026-08-05',
    vorgerichtlich: { aktiv: true, faktor: 1.3, auslagenpauschale: false, umsatzsteuer: false },
    gerichtlich: { aktiv: true, verfahrensart: 'klage', verfahrensgebuehr: true,
      terminsgebuehr: false, gerichtskosten: false, anrechnung: true, anrechnungsFaktor: 1.3,
      auslagenpauschale: false, umsatzsteuer: false },
    verzugspauschale: false,
  });
  // 1,3 − min(1,3/2; 0,75) = 0,65 → 0,65 × 93 = 60,45
  const verfahrensgebuehr = r.buchungen.find((b) => b.text.includes('Verfahrensgebühr'));
  assert.strictEqual(verfahrensgebuehr.betrag, 60.45);
  assert.ok(verfahrensgebuehr.text.includes('Anrechnung'));
});

test('baueNebenforderungen: Anrechnungskappung bei 0,75', () => {
  const r = Rvg.baueNebenforderungen({
    gegenstandswert: 1000, datum: '2026-08-05',
    vorgerichtlich: { aktiv: true, faktor: 2.0, auslagenpauschale: false, umsatzsteuer: false },
    gerichtlich: { aktiv: true, verfahrensart: 'klage', verfahrensgebuehr: true,
      terminsgebuehr: false, gerichtskosten: false, anrechnung: true, anrechnungsFaktor: 2.0,
      auslagenpauschale: false, umsatzsteuer: false },
    verzugspauschale: false,
  });
  // 1,3 − min(1,0; 0,75) = 0,55 → 0,55 × 93 = 51,15
  const verfahrensgebuehr = r.buchungen.find((b) => b.text.includes('Verfahrensgebühr'));
  assert.strictEqual(verfahrensgebuehr.betrag, 51.15);
});

test('baueNebenforderungen: Klageverfahren komplett (Wert 5.000 €)', () => {
  const r = Rvg.baueNebenforderungen({
    gegenstandswert: 5000, datum: '2026-08-05',
    vorgerichtlich: { aktiv: false },
    gerichtlich: { aktiv: true, verfahrensart: 'klage', verfahrensgebuehr: true,
      terminsgebuehr: true, gerichtskosten: true, anrechnung: false,
      auslagenpauschale: true, umsatzsteuer: true },
    verzugspauschale: false,
  });
  // 1,3 × 354,50 = 460,85; 1,2 × 354,50 = 425,40; 7002 = 20; USt 19 % von 906,25 = 172,19; KV 1210 = 3 × 170,50 = 511,50
  assert.deepStrictEqual(r.buchungen.map((b) => b.betrag), [460.85, 425.4, 20.0, 172.19, 511.5]);
  const gerichtskosten = r.buchungen[4];
  assert.ok(gerichtskosten.text.includes('KV 1210'));
});

test('baueNebenforderungen: Terminsgebühr im Mahnverfahren wird ignoriert', () => {
  const r = Rvg.baueNebenforderungen({
    gegenstandswert: 1000, datum: '2026-08-05',
    vorgerichtlich: { aktiv: false },
    gerichtlich: { aktiv: true, verfahrensart: 'mahnverfahren', verfahrensgebuehr: false,
      terminsgebuehr: true, gerichtskosten: true, anrechnung: false,
      auslagenpauschale: false, umsatzsteuer: false },
    verzugspauschale: false,
  });
  assert.deepStrictEqual(r.buchungen.map((b) => b.betrag), [38.0]);
  assert.ok(r.buchungen[0].text.includes('KV 1100'));
});

test('baueNebenforderungen: Verzugspauschale mit Anrechnungs-Hinweis', () => {
  const r = Rvg.baueNebenforderungen({
    gegenstandswert: 1000, datum: '2026-08-05',
    vorgerichtlich: { aktiv: false },
    gerichtlich: { aktiv: false },
    verzugspauschale: true,
  });
  assert.deepStrictEqual(r.buchungen.map((b) => b.betrag), [40.0]);
  assert.ok(r.buchungen[0].text.includes('§ 288 Abs. 5 BGB'));
  assert.ok(r.hinweise.some((h) => h.includes('anzurechnen')));
});

test('baueNebenforderungen: Hinweis bei Faktor über 1,3', () => {
  const r = Rvg.baueNebenforderungen({
    gegenstandswert: 1000, datum: '2026-08-05',
    vorgerichtlich: { aktiv: true, faktor: 1.5, auslagenpauschale: false, umsatzsteuer: false },
    gerichtlich: { aktiv: false },
    verzugspauschale: false,
  });
  assert.ok(r.hinweise.some((h) => h.includes('1,3')));
});

test('baueNebenforderungen: ungültiger Gegenstandswert wirft Fehler', () => {
  assert.throws(() => Rvg.baueNebenforderungen({
    gegenstandswert: 0, datum: '2026-08-05',
    vorgerichtlich: { aktiv: true, faktor: 1.3 }, gerichtlich: { aktiv: false },
    verzugspauschale: false,
  }));
});
