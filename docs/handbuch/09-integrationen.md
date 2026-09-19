# 9 — Integrationen

Saldenwerk arbeitet **eigenständig**: Sie brauchen keine weitere Software,
keinen Server und keinen Online-Dienst, um damit zu rechnen. Alles läuft im
Browser auf Ihrem Rechner.

Darüber hinaus gibt es optionale Zusatzmodule. Sie sind **nicht Teil der
Browser-App**, müssen einzeln eingerichtet werden und sind standardmäßig
aus. Wer sie nicht einrichtet, merkt von ihnen nichts.

## Austausch über Dateien

Der einfachste Weg, und der einzige, der ganz ohne Einrichtung auskommt:

- **PDF** der Forderungsaufstellung für Schriftsätze, Akte und Versand —
  siehe [Kapitel 6](06-report.md).
- **Antragstext** für Mahnbescheid oder Klage über die Zwischenablage,
  direkt einfügbar in Ihr Schriftsatz-Dokument oder das
  Mahnbescheids-Formular — ebenfalls [Kapitel 6](06-report.md).
- **JSON-Dateien** zum Sichern, Weitergeben und Wieder-Einlesen ganzer
  Konten, z. B. auf dem Netzlaufwerk der Kanzlei —
  siehe [Kapitel 8](08-datenspeicherung.md).

Damit lässt sich jede Kanzleisoftware bedienen, die Dokumente aus dem
Dateisystem in die Akte übernimmt: PDF erzeugen, in die Akte legen, fertig.

## Zusatzmodule

| Modul | Wofür | Wo Ihre Daten verarbeitet werden |
| --- | --- | --- |
| [Rechen-Schnittstelle (REST-API)](12-rest-api.md) | Andere Programme rechnen lassen, was auch die App rechnet | Auf **Ihrem** Server, im Kanzleinetz. Nichts wird gespeichert. |

Weitere Module sind in Vorbereitung und werden hier ergänzt, sobald sie
verfügbar sind — eine Bedienung über KI-Assistenten sowie eine direkte
Anbindung an Kanzleisoftware ([j-lawyer.org](https://www.j-lawyer.org),
ein Prototyp existiert bereits).

## Werkzeuge für Browser-Agenten (WebMCP)

Kein Zusatzmodul, sondern Teil der Browser-App, und deshalb die eine
Ausnahme von „standardmäßig aus": Verwenden Sie in Ihrem Browser einen
KI-Agenten, bietet Saldenwerk ihm vier Rechenwerkzeuge an. Sie rechnen nur
mit dem, was der Agent übergibt, kennen keine Namen, lesen Ihre
gespeicherten Konten nicht und ändern nichts. Ohne Agent geschieht nichts.
Einzelheiten, Grenzen und der Schalter zum Abschalten stehen in
[Kapitel 13](13-webmcp.md).

Bevor Sie ein Zusatzmodul einrichten, lesen Sie den Abschnitt „Datenschutz"
des jeweiligen Kapitels. Die Module unterscheiden sich darin **erheblich**:
Die Rechen-Schnittstelle verlagert die Berechnung innerhalb Ihrer Kanzlei;
eine KI-Anbindung würde Mandatsdaten an ein fremdes Unternehmen übertragen.
Das sind zwei völlig verschiedene Sachverhalte, berufsrechtlich wie
datenschutzrechtlich.

Sie haben Interesse an einer Anbindung an Ihre Kanzleisoftware? Dann
melden Sie sich gern über die
[Projektseite auf GitHub](https://github.com/PBaumfalk/Saldenwerk/issues) —
Rückmeldungen aus der Praxis bestimmen, was als Nächstes gebaut wird.

---

Weiter: [10 — Anpassung & Betrieb](10-anpassung.md) · [Zur Übersicht](README.md)
