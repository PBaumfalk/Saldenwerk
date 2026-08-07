# 7 — Basiszinssatz

Die Ansicht **Basiszins** zeigt die eingebaute Tabelle der Basiszinssätze
nach § 247 BGB — halbjährlich ab dem 1. Januar 2002. Auf ihr beruhen alle
Verzinsungen der Art „Basiszinssatz + Aufschlag".

## Werte prüfen

Verbindliche Werte veröffentlicht die
[Deutsche Bundesbank](https://www.bundesbank.de/de/aufgaben/geldpolitik/zinssaetze/basiszinssatz)
als offizielle Quelle. **Die eingebauten Werte werden ohne Gewähr
bereitgestellt** — prüfen Sie sie im Zweifel dort gegen.

## Eigene Werte pflegen (Overrides)

Fehlt ein aktueller Halbjahreswert oder soll ein Wert korrigiert werden:

1. Im Formular unter der Tabelle **Gültig ab** (1. Januar oder 1. Juli
   eines Jahres) und den **Satz (%)** eintragen, z. B. `1,27`.
2. **Speichern** — der eigene Wert überlagert ab sofort den eingebauten
   und wird in der Tabelle als Override gekennzeichnet.
3. Über die Aktion in der Tabellenzeile lässt sich ein Override jederzeit
   **zurücksetzen**; dann gilt wieder der eingebaute Wert.

Overrides werden mit Ihren Daten gespeichert und beim
„Alle exportieren" mitgesichert (siehe [Kapitel 8](08-datenspeicherung.md)).

## Warnung bei veralteter Tabelle

Reicht die Tabelle nicht mehr bis zum heutigen Datum (z. B. weil ein neues
Halbjahr begonnen hat und der neue Satz noch nicht eingepflegt ist), zeigt
Saldenwerk ein Warnbanner in der Konten- und Basiszins-Ansicht. Report und
PDF weisen dann darauf hin, dass mit dem **letzten bekannten Satz**
weitergerechnet wird — tragen Sie in diesem Fall den aktuellen
Bundesbank-Wert als Override ein.

---

Weiter: [8 — Daten speichern & sichern](08-datenspeicherung.md) · [Zur Übersicht](README.md)
