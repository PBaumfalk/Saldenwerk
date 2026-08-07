# 3 — Konten

Die Ansicht **Konten** ist die Startseite: Hier liegen alle
Forderungskonten als Karten.

![Kontenübersicht](../screenshots/konten.png)

## Konto anlegen und öffnen

- **Neues Konto** (blauer Knopf rechts oben) legt ein leeres Konto an und
  wechselt direkt in die Buchungen-Ansicht.
- **Öffnen** auf einer Kontokarte macht das Konto zum aktiven Konto —
  Buchungen- und Report-Ansicht beziehen sich immer auf das zuletzt
  geöffnete Konto.
- Die **Kontobezeichnung** vergeben Sie oben in der Buchungen-Ansicht
  (z. B. „Muster GmbH ./. Beispiel").

## Suchen und sortieren

Über der Kontenliste:

- Das **Suchfeld** filtert live nach Name, Aktenzeichen, Gläubiger und
  Schuldner.
- Die **Sortierung** daneben ordnet nach *Zuletzt geändert* (Standard),
  *Name* oder *Aktenzeichen*.

## Kontodaten: Aktenzeichen, Parteien, Tilgungsreihenfolge

In der Buchungen-Ansicht öffnet **Kontodaten** einen Dialog mit:

- **Aktenzeichen** — erscheint auf Kontokarte, Report und PDF. Mit
  j-lawyer-Anbindung holt **Aus j-lawyer übernehmen** die Parteien direkt
  aus der Akte (siehe [Kapitel 9](09-j-lawyer.md)).
- **Gläubiger** und **Schuldner** — erscheinen als Rubrum
  („Gläubiger ./. Schuldner") auf Karte, Report und PDF.
- **Tilgungsreihenfolge**:
  - **§ 367 BGB** (Standard): Zahlungen tilgen zuerst Kosten, dann
    Zinsen, zuletzt die Hauptforderung.
  - **§ 497 Abs. 3 BGB** (Verbraucherdarlehen): zuerst Kosten, dann die
    Hauptforderung, zuletzt die Zinsen. Ob § 497 einschlägig ist, ist
    rechtlich zu prüfen; die gewählte Reihenfolge wird im Report und auf
    dem PDF ausgewiesen.

## Weitere Aktionen auf der Kontokarte

- **Duplizieren** erstellt eine Kopie des Kontos samt aller Buchungen
  (z. B. für Varianten-Rechnungen: „Was wäre bei Klage statt Mahnbescheid?").
- **Exportieren** lädt das einzelne Konto als JSON-Sicherungsdatei
  herunter (siehe [Kapitel 8](08-datenspeicherung.md)).
- **Löschen** entfernt das Konto endgültig — nach Sicherheitsabfrage.

## Werkzeugleiste der Kontenübersicht

- **Importieren** liest eine zuvor exportierte JSON-Datei ein.
- **Alle exportieren** sichert sämtliche Konten in eine Datei.
- **Datei öffnen… / In Datei speichern…** verbinden Saldenwerk mit einer
  dauerhaften Speicherdatei — Details in [Kapitel 8](08-datenspeicherung.md).
- **j-lawyer…** öffnet die Verbindungseinstellungen ([Kapitel 9](09-j-lawyer.md)).

---

Weiter: [4 — Buchungen](04-buchungen.md) · [Zur Übersicht](README.md)
