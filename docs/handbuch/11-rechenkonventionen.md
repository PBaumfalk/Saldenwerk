# 11 — Rechenkonventionen

Damit jede Zahl im Report nachvollziehbar und gegenüber Gericht und
Gegenseite verteidigbar ist, rechnet Saldenwerk nach festen, hier
dokumentierten Konventionen.

## Zinstage: inklusive/inklusive

Der Verzinsungsbeginn und das Ende des jeweiligen Zinslaufs
(Zahlungsvortag bzw. Stichtag) zählen **beide** als Zinstage. Verzinst
wird also die tatsächliche Anzahl an Tagen von einschließlich Beginn bis
einschließlich Ende.

## Zahlung tilgt Zinsen bis zum Vortag

Bei einer Zahlung werden zunächst alle bis einschließlich des **Vortags**
der Zahlung aufgelaufenen Zinsen festgeschrieben; der Zahlungstag selbst
läuft nicht mehr auf das bisherige Zinssegment.

## Tilgungsreihenfolge

- **§ 367 BGB** (Standard): Jede Zahlung wird zuerst auf Kosten
  (Nebenforderungen), dann auf Zinsen (Zinsforderungen und aufgelaufene
  laufende Zinsen), zuletzt auf die Hauptforderung verrechnet. Ein
  verbleibender Überschuss wird als Überzahlung ausgewiesen.
- **§ 497 Abs. 3 BGB** (Verbraucherdarlehen, pro Konto wählbar): zuerst
  Kosten der Rechtsverfolgung, dann die Hauptforderung, zuletzt die
  Zinsen. Die angewandte Reihenfolge wird im Report-Kopf und auf dem PDF
  ausgewiesen. Ob § 497 Abs. 3 BGB einschlägig ist, ist rechtlich zu
  prüfen; weitere Besonderheiten des Verzugs bei Verbraucherdarlehen
  (z. B. § 497 Abs. 1 BGB zum Zinssatz) bildet Saldenwerk nicht
  automatisch ab.

## Rundung je Teilperiode

Zinsbeträge werden kaufmännisch auf zwei Nachkommastellen gerundet — für
jedes einzelne Zinssegment separat (z. B. je Kalenderjahr-Abschnitt oder
je Basiszins-Halbjahr), nicht erst am Ende der Gesamtberechnung. Dadurch
können sich minimale Rundungsdifferenzen gegenüber einer Berechnung „in
einem Rutsch" ergeben.

## Kalendertage (365/366) vs. Bankmethode (30/360)

- **Kalender**: tatsächliche Kalendertage; bei Zinsläufen über den
  Jahreswechsel wird pro Kalenderjahr gesplittet und mit dem jeweils
  gültigen Nenner gerechnet (365 bzw. 366 in Schaltjahren).
- **Bankmethode (30/360)**: kaufmännische 30E/360-Konvention — jeder Monat
  zu 30 Tagen, Jahr zu 360 Tagen, ohne Aufteilung an Jahresgrenzen. Nur
  verwenden, wenn vertraglich vereinbart.

## Basiszins-Halbjahressplit

Bei Verzinsung „Basiszinssatz + Aufschlag" wird der Zinslauf zusätzlich an
den Halbjahresgrenzen (1. Januar / 1. Juli) gesplittet, da sich der
Basiszinssatz nach § 247 BGB jeweils zu diesen Terminen ändern kann. Die
Zinsstaffel im Report weist jedes Halbjahressegment mit seinem Satz
einzeln aus.

---

[Zur Übersicht](README.md)
