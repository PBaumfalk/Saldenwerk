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

## Beim Aktualisieren beachten

- **Versionsspalte hier mitpflegen** — sie ist der einzige Ort außerhalb
  der Minified-Banner.
- **jsPDF/AutoTable:** Der Sprung auf jsPDF 3.x / AutoTable 5.x ändert die
  Plugin-API (`doc.autoTable(opts)` → `autoTable(doc, opts)`) und berührt
  `pdfexport.js` — nur mit Testlauf (`tests/pdfexport.test.js`) und als
  Minor-Release.
- **Cache:** nginx liefert `/vendor/` mit `immutable, max-age=1 Jahr` aus.
  Bei einem Update ohne Dateinamens-Änderung sitzen Clients bis zu einem
  Jahr auf der alten Datei — Dateinamen versionieren oder die Cache-Regel
  in `docker/default.conf.template` vorübergehend lockern.
