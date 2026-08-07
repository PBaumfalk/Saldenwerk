# Saldenwerk — Handbuch

Willkommen im Handbuch von **Saldenwerk**, dem Forderungskonto- und
Zinsrechner für die anwaltliche Praxis. Dieses Handbuch richtet sich an
alle Nutzerinnen und Nutzer — juristische Vorkenntnisse helfen, technische
sind nicht nötig. Abschnitte, die sich an Administratoren oder IT richten,
sind entsprechend gekennzeichnet.

## Inhalt

| Kapitel | Inhalt |
| --- | --- |
| [1 — Was ist Saldenwerk?](01-was-ist-saldenwerk.md) | Überblick, Grundbegriffe, Datenschutz-Prinzip |
| [2 — Installation](02-installation.md) | Auf dem Mac, auf dem Windows-PC, auf einem Server (IT) |
| [3 — Konten](03-konten.md) | Konten anlegen, öffnen, suchen, Kontodaten, Tilgungsreihenfolge |
| [4 — Buchungen](04-buchungen.md) | Die vier Buchungstypen, Verzinsung, Saldo |
| [5 — RVG-Rechner](05-rvg-rechner.md) | Mahn- und Prozesskosten automatisch berechnen |
| [6 — Report, PDF & Antragstext](06-report.md) | Forderungsaufstellung erzeugen, drucken, herunterladen |
| [7 — Basiszinssatz](07-basiszins.md) | Eingebaute Tabelle, eigene Werte pflegen |
| [8 — Daten speichern & sichern](08-datenspeicherung.md) | Wo die Daten liegen, Datei-Speicherung, Export/Import |
| [9 — Integrationen](09-integrationen.md) | Zusammenspiel mit anderer Software, geplante Anbindungen |
| [10 — Anpassung & Betrieb](10-anpassung.md) | Dunkelmodus, öffentliche Variante, eigenes Branding (IT) |
| [11 — Rechenkonventionen](11-rechenkonventionen.md) | Wie Saldenwerk rechnet — im Detail |

## Schnelleinstieg in 5 Minuten

1. Saldenwerk öffnen ([Installation](02-installation.md) — oder einfach die
   `index.html` doppelklicken).
2. In der Ansicht **Konten** auf **Neues Konto** klicken.
3. In der Ansicht **Buchungen** über **+ Hauptforderung** die Forderung
   erfassen — z. B. den Rechnungsbetrag mit Verzugszinsen
   „Basiszinssatz + Aufschlag, 5 Punkte" ab dem Tag nach Fälligkeit.
4. Zahlungen des Schuldners über **+ Zahlung** eintragen.
5. In der Ansicht **Report** die fertige Forderungsaufstellung ansehen,
   als **PDF herunterladen** oder den **Antragstext kopieren**.

Zum Ausprobieren ohne eigene Daten:
[`docs/beispiel-konto.json`](../beispiel-konto.json) herunterladen und in
der Konten-Ansicht über **Importieren** laden.

## Wichtiger Hinweis

Saldenwerk ist ein Rechenwerkzeug und ersetzt keine Rechts- oder
Steuerberatung. Alle Berechnungen — insbesondere Basiszinssätze,
RVG-Gebühren und daraus abgeleitete Beträge — werden ohne Gewähr
bereitgestellt und sind eigenverantwortlich zu prüfen.
