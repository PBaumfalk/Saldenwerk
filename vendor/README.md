# Gebündelte Fremdbibliotheken

Saldenwerk lädt bewusst nichts von CDNs — alle Fremdkomponenten liegen
hier im Repository. Diese Liste ist die Referenz dafür, was in welcher
Version gebündelt ist (die Versionsnummern stehen sonst nur in den
Bannern der minifizierten Dateien).

| Komponente | Version | Datei | Lizenz | Quelle |
| --- | --- | --- | --- | --- |
| jsPDF | 2.5.2 (Build 2024-09-17) | `jspdf.umd.min.js` | MIT (`LICENSE-jspdf.txt`) | https://github.com/parallax/jsPDF |
| jsPDF-AutoTable | 3.8.4 | `jspdf.plugin.autotable.min.js` | MIT (`LICENSE-jspdf-autotable.txt`) | https://github.com/simonbengtsson/jsPDF-AutoTable |
| Inter (Variable Font) | unbekannt, Bezug August 2026 | `fonts/InterVariable.woff2` | SIL OFL 1.1 (`fonts/LICENSE-inter.txt`) | https://github.com/rsms/inter |
| Swagger UI | 5.29.1 (Bezug September 2026) | `swagger-ui/swagger-ui.css`, `swagger-ui/swagger-ui-bundle.js` | Apache-2.0 (`swagger-ui/LICENSE-swagger-ui.txt`) | https://github.com/swagger-api/swagger-ui |

Swagger UI gehört **nicht** zur Browser-App: Es wird ausschließlich vom
API-Container unter `/api/docs` ausgeliefert und liegt nicht im nginx-Image.
Es ist außerdem die erste Komponente unter Apache-2.0 statt MIT oder OFL —
die Lizenz verlangt, den Lizenztext mitzuliefern (erledigt) und Änderungen
kenntlich zu machen (es gibt keine).

## Beim Aktualisieren beachten

- **Versionsspalte hier mitpflegen** — sie ist der einzige Ort außerhalb
  der Minified-Banner.
- **jsPDF/AutoTable:** Der Sprung auf jsPDF 3.x / AutoTable 5.x ändert die
  Plugin-API (`doc.autoTable(opts)` → `autoTable(doc, opts)`) und berührt
  `pdfexport.js` — nur mit Testlauf (`tests/pdfexport.test.js`) und als
  Minor-Release.
- **jsPDF in Node:** `pdf-node.js` hängt an einer undokumentierten Eigenheit
  des UMD-Bundles — es setzt `globalThis.jspdf` nicht selbst, `pdfexport.js:92`
  liest aber `window.jspdf`. Nach einem Update `tests/pdf-node.test.js` und
  `tests/api-pdf.test.js` laufen lassen; Dependabot sieht `vendor/` mangels
  npm-Ökosystem nicht.
- **Swagger UI:** Neue Version herunterladen, Versionsspalte pflegen und
  `tests/api-openapi.test.js` laufen lassen. Die Dateien kommen ohne externe
  Referenzen aus (die CSS nutzt nur `data:`-URIs) — das ist die Voraussetzung
  dafür, dass die bestehende CSP aus `docker/security-headers.conf` ohne
  Lockerung trägt. Nach einem Update erneut prüfen.
- **Cache:** nginx liefert `/vendor/` mit `immutable, max-age=1 Jahr` aus.
  Bei einem Update ohne Dateinamens-Änderung sitzen Clients bis zu einem
  Jahr auf der alten Datei — Dateinamen versionieren oder die Cache-Regel
  in `docker/default.conf.template` vorübergehend lockern.
