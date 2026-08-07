# 8 — Daten speichern & sichern

Saldenwerk speichert nichts auf fremden Servern. Umso wichtiger ist es zu
wissen, wo die Daten liegen — und wie Sie sie sichern.

## Stufe 1: Automatisch im Browser (localStorage)

Ohne weiteres Zutun speichert Saldenwerk alle Konten im **localStorage**
Ihres Browsers — automatisch bei jeder Änderung. Das heißt aber auch:

- Die Daten existieren nur **in diesem Browser auf diesem Rechner**.
- Beim „Browserdaten löschen" (Cookies/Websitedaten) gehen sie verloren.

Der Status oben rechts zeigt in diesem Modus **„Nur lokal"**. Ein Banner
erinnert an fällige Sicherungen per „Alle exportieren" (nach 14 Tagen oder
50 Änderungen seit dem letzten Export).

## Stufe 2: Datei-Speicherung (empfohlen)

In Chrome und Edge kann Saldenwerk seinen gesamten Datenbestand in einer
**JSON-Datei** führen, die Sie selbst verwalten — z. B. auf dem
Netzlaufwerk der Kanzlei. In der Konten-Ansicht:

- **In Datei speichern…** legt eine neue Datei an und verbindet die App
  damit.
- **Datei öffnen…** verbindet die App mit einer bestehenden Datei; deren
  Inhalt ersetzt dann den lokalen Stand.

Ist die App verbunden:

- Änderungen werden automatisch (kurz verzögert) in die Datei
  geschrieben; der Status oben rechts zeigt Dateiname und
  Speicherzustand. **Jetzt speichern** schreibt sofort, **Trennen** löst
  die Verbindung.
- Nach einem Browser-Neustart fragt ein Banner, ob wieder verbunden
  werden soll (der Browser verlangt dafür aus Sicherheitsgründen einen
  Klick).
- Wurde die Datei zwischenzeitlich an einem **anderen Arbeitsplatz**
  geändert, warnt Saldenwerk vor dem Überschreiben: **Datei neu laden**
  übernimmt den fremden Stand, **Trotzdem überschreiben** setzt den
  eigenen durch. Die Datei ist für **nacheinander** arbeitende Nutzer
  gedacht, nicht für gleichzeitiges Arbeiten.

Technischer Hinweis (IT): Die Datei-Speicherung nutzt die File System
Access API und erfordert einen sicheren Kontext (HTTPS, `localhost` oder
direkt geöffnete `index.html`). Firefox und Safari unterstützen sie nicht —
dort bleibt es bei localStorage plus Export.

## Export und Import

- **Exportieren** (auf der Kontokarte) sichert ein einzelnes Konto,
  **Alle exportieren** sämtliche Konten inklusive der
  Basiszins-Overrides — jeweils als JSON-Datei im Download-Ordner.
- **Importieren** liest eine solche Datei wieder ein. Die Datei wird
  vollständig geprüft (Version, Struktur aller Konten und Buchungen); ist
  auch nur eine Angabe ungültig, wird **nichts** importiert und eine
  verständliche Fehlermeldung angezeigt. Importierte Konten werden mit
  neuen IDs **hinzugefügt** — bestehende Konten bleiben unverändert.
- Die Speicherdatei aus Stufe 2 hat dasselbe Format und kann daher auch
  importiert werden — praktisch für Umzüge zwischen Rechnern.
- Zum Ausprobieren liegt eine Beispieldatei bei:
  [`docs/beispiel-konto.json`](../beispiel-konto.json).

## Empfehlung für die Kanzlei

1. Datei-Speicherung auf dem Netzlaufwerk einrichten (tägliche Sicherung
   läuft dann über die normale Kanzlei-Datensicherung mit).
2. Zusätzlich gelegentlich **Alle exportieren** als Zweitsicherung.
3. Bei mehreren Nutzern: nacheinander arbeiten, Warnhinweise ernst nehmen.

---

Weiter: [9 — j-lawyer-Anbindung](09-j-lawyer.md) · [Zur Übersicht](README.md)
