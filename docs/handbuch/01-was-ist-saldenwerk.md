# 1 — Was ist Saldenwerk?

Saldenwerk führt **Forderungskonten**: Für jede Forderung (z. B. eine
offene Rechnung Ihres Mandanten) erfassen Sie die Hauptforderung, Kosten,
Zinsen und alle Zahlungen des Schuldners. Saldenwerk berechnet daraus zu
jedem Stichtag den offenen Saldo — mit tagesgenauer Verzinsung, korrekter
gesetzlicher Tilgungsreihenfolge und nachvollziehbarer Zinsstaffel.

Typische Einsatzfälle:

- Forderungsaufstellung für Mahnschreiben, Mahnbescheid oder Klage
- Nachvollziehen, wie sich Teilzahlungen auf Kosten, Zinsen und
  Hauptforderung verteilen (§ 367 BGB bzw. § 497 Abs. 3 BGB)
- Zwangsvollstreckung: aktueller Forderungsstand zum Stichtag
- RVG-Kosten (Geschäftsgebühr, Verfahrens-/Terminsgebühr, Gerichtskosten)
  direkt als Kostenpositionen ins Konto buchen

## Die vier Ansichten

Die Navigation oben in der App-Leiste führt durch vier Ansichten:

| Ansicht | Zweck |
| --- | --- |
| **Konten** | Alle Forderungskonten im Überblick: anlegen, öffnen, duplizieren, exportieren, löschen |
| **Buchungen** | Das geöffnete Konto bearbeiten: Forderungen, Kosten, Zinsen, Zahlungen |
| **Report** | Die fertige Forderungsaufstellung zum Stichtag: ansehen, drucken, als PDF laden, Antragstext kopieren |
| **Basiszins** | Die hinterlegte Basiszinssatz-Tabelle nach § 247 BGB einsehen und pflegen |

## Grundbegriffe

- **Konto**: Ein Forderungskonto, in der Regel eine Akte bzw. ein
  Schuldverhältnis (z. B. „Muster GmbH ./. Beispiel").
- **Buchung**: Ein Eintrag im Konto — Hauptforderung, Nebenforderung
  (Kosten), Zinsforderung oder Zahlung (siehe [Kapitel 4](04-buchungen.md)).
- **Stichtag**: Das Datum, zu dem der Report den Forderungsstand berechnet.
  Zinsen laufen bis einschließlich Stichtag.
- **Saldo**: Der offene Gesamtbetrag aus Hauptforderung, Kosten und Zinsen
  abzüglich aller Zahlungen.

## Wo bleiben meine Daten? (Datenschutz-Prinzip)

Saldenwerk ist bewusst **ohne Server-Datenhaltung** gebaut:

- Die App läuft vollständig in Ihrem Browser. Es gibt **kein Konto, keine
  Registrierung, keine Cloud** — Mandats- und Schuldnerdaten verlassen
  Ihren Rechner nicht.
- Gespeichert wird lokal in Ihrem Browser und — auf Wunsch — in einer
  JSON-Datei, die Sie selbst verwalten, z. B. auf dem Netzlaufwerk der
  Kanzlei (siehe [Kapitel 8](08-datenspeicherung.md)).
- Auch beim Betrieb über einen Kanzlei-Server (Docker) liefert der Server
  nur die App aus; Ihre Daten bleiben im Browser des jeweiligen
  Arbeitsplatzes.

---

Weiter: [2 — Installation](02-installation.md) · [Zur Übersicht](README.md)
