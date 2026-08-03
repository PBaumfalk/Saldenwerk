# Forderungskonto

Eine kleine, lokal laufende Web-App zur Führung von Forderungskonten mit
Zinsberechnung – z. B. für die Abrechnung von Hauptforderungen, Kosten und
Verzugszinsen gegenüber einem Schuldner. Die App läuft vollständig im
Browser, es gibt keinen Server und keine externen Abhängigkeiten. Alle
Daten werden ausschließlich lokal im `localStorage` des Browsers gespeichert.

## Start

`index.html` im Browser öffnen (Doppelklick genügt, kein Build-Schritt, kein
Server erforderlich). Die Daten bleiben im `localStorage` des jeweiligen
Browsers erhalten – bei einem anderen Browser, Gerät oder nach dem Leeren
der Browserdaten sind sie nicht mehr da. Empfohlen ist deshalb die
**Datei-Speicherung** (siehe unten) oder regelmäßiger Export/Import.

## Datei-Speicherung

In Chrome und Edge kann die App ihren gesamten Datenbestand in einer
JSON-Datei führen (File System Access API). In der Konten-Ansicht:

- **„In Datei speichern…"** legt eine neue Datei an (z. B. auf einem
  Netzlaufwerk der Kanzlei) und verbindet die App damit.
- **„Datei öffnen…"** verbindet die App mit einer bestehenden Datei; deren
  Inhalt ersetzt dann den lokalen Stand.
- Verbunden speichert die App Änderungen automatisch (kurz verzögert) in die
  Datei; der Status oben rechts zeigt Dateiname und Speicherzustand.
  „Jetzt speichern" schreibt sofort, „Trennen" löst die Verbindung.
- Nach einem Neustart des Browsers fragt ein Banner, ob wieder mit der
  Datei verbunden werden soll (der Browser verlangt dafür einen Klick).
- Wird die Datei zwischenzeitlich an einem anderen Arbeitsplatz geändert,
  warnt die App vor dem Überschreiben („Datei neu laden" oder „Trotzdem
  überschreiben"). Die Datei ist für **nacheinander** arbeitende Nutzer
  gedacht, nicht für gleichzeitiges Arbeiten.
- Die Datei hat dasselbe Format wie der Export (inklusive
  Basiszins-Overrides) und kann daher auch importiert werden.

In Browsern ohne File System Access API (Firefox, Safari) bleibt es beim
`localStorage`; ein Banner erinnert an fällige Sicherungen per
„Alle exportieren" (nach 14 Tagen oder 50 Änderungen seit dem letzten
Export).

## Funktionsüberblick

- **Konten**: Beliebig viele Forderungskonten anlegen, öffnen, duplizieren,
  löschen sowie einzeln oder alle zusammen exportieren. Über den Dialog
  „Kontodaten" lassen sich Aktenzeichen, Gläubiger und Schuldner erfassen;
  sie erscheinen auf Kontokarte, Report und PDF. Die Kontenübersicht ist
  durchsuchbar (Name, Aktenzeichen, Parteien) und sortierbar (zuletzt
  geändert, Name, Aktenzeichen).
- **Buchungen**: Je Konto vier Buchungstypen:
  - *Hauptforderung* – die Grundforderung (z. B. Rechnungsbetrag).
  - *Nebenforderung* – Kosten (z. B. Mahn-, Inkasso- oder Anwaltskosten),
    werden bei Zahlungen gemäß § 367 BGB vorrangig getilgt.
  - *Zinsforderung* – bereits bezifferte Zinsen (z. B. aus einer
    Zinsstaffel eines Titels), unabhängig von der laufenden Verzinsung.
  - *Zahlung* – tilgt offene Beträge in der gesetzlichen Reihenfolge.

  Hauptforderungen und Nebenforderungen können optional laufend verzinst
  werden: entweder mit einem festen Zinssatz oder mit dem Basiszins
  zuzüglich Prozentpunkten, jeweils nach Kalender- oder Bankmethode.
- **Report**: Saldenreport zu einem wählbaren Stichtag mit
  Forderungsaufstellung, Zinsstaffel (Herleitung jedes Zinssegments) und
  Verrechnungsübersicht je Zahlung, druckbar über die Browser-Druckfunktion.
- **PDF-Export:** „PDF exportieren" im Report erzeugt eine Forderungsaufstellung im
  Kanzlei-Stil (Querformat-Kontoblatt mit Zinsstaffel-Details, Summenseite mit
  Salden-Chart) über den Browser-Druckdialog („Als PDF sichern").
- **Basiszins-Pflege**: Ansicht der eingebauten Basiszinssatz-Tabelle
  (halbjährlich ab 1. Januar 2002) mit der Möglichkeit, einzelne
  Halbjahreswerte durch eigene Werte zu überschreiben (Overrides) oder
  diese wieder zurückzusetzen.
- **Export/Import**: Konten als JSON sichern und wieder einlesen (siehe
  unten).

## Rechenkonventionen

- **Zinstage inklusive/inklusive**: Der Verzinsungsbeginn und das Ende des
  jeweiligen Zinslaufs (Zahlungsvortag bzw. Stichtag) zählen beide als
  Zinstage. Es wird also die tatsächliche Anzahl an Tagen von
  einschließlich Beginn bis einschließlich Ende verzinst.
- **Zahlung tilgt Zinsen bis Vortag**: Bei einer Zahlung werden zunächst
  alle bis einschließlich des Vortags der Zahlung aufgelaufenen Zinsen
  festgeschrieben; der Zahlungstag selbst läuft nicht mehr auf das
  bisherige Zinssegment.
- **Tilgungsreihenfolge nach § 367 BGB**: Jede Zahlung wird in der
  gesetzlichen Reihenfolge verrechnet – zuerst auf Kosten
  (Nebenforderungen), dann auf Zinsen (Zinsforderungen und aufgelaufene
  laufende Zinsen), zuletzt auf die Hauptforderung. Ein verbleibender
  Überschuss wird als Überzahlung ausgewiesen.
- **Tilgungsreihenfolge nach § 497 Abs. 3 BGB (Verbraucherdarlehen)**: Im
  Dialog „Kontodaten" kann pro Konto stattdessen die Reihenfolge für
  Verbraucherdarlehensforderungen gewählt werden – zuerst Kosten der
  Rechtsverfolgung, dann die Hauptforderung, zuletzt die Zinsen. Die
  angewandte Reihenfolge wird im Report-Kopf und auf dem PDF ausgewiesen.
  Ob § 497 Abs. 3 BGB im Einzelfall einschlägig ist, ist rechtlich zu
  prüfen; weitere Besonderheiten des Verzugs bei Verbraucherdarlehen
  (z. B. § 497 Abs. 1 BGB zum Zinssatz) bildet die App nicht automatisch ab.
- **Rundung je Teilperiode**: Zinsbeträge werden kaufmännisch auf zwei
  Nachkommastellen gerundet – und zwar für jedes einzelne Zinssegment
  (z. B. je Kalenderjahr-Abschnitt oder je Basiszins-Halbjahr) separat,
  nicht erst am Ende der Gesamtberechnung. Dadurch können sich minimale
  Rundungsdifferenzen gegenüber einer Berechnung „in einem Rutsch“ ergeben.
- **Kalendertage (365/366) vs. Bankmethode (360)**: Bei der Methode
  „Kalender“ wird mit den tatsächlichen Kalendertagen gerechnet, wobei bei
  Zinsläufen über einen Jahreswechsel hinweg pro Kalenderjahr gesplittet
  und mit dem jeweils gültigen Nenner (365 bzw. 366 in Schaltjahren)
  gerechnet wird. Bei der Bankmethode („360“) wird nach der kaufmännischen
  30E/360-Konvention gerechnet (jeder Monat zu 30 Tagen, Jahr zu 360
  Tagen), ohne Aufteilung an Jahresgrenzen.
- **Basiszins-Halbjahressplit**: Bei Verzinsung „Basiszins zzgl.
  Prozentpunkte“ wird der Zinslauf zusätzlich an den Halbjahresgrenzen
  (1. Januar / 1. Juli) gesplittet, da sich der Basiszinssatz nach § 247
  BGB jeweils zum 1. Januar und 1. Juli ändern kann.

## Basiszins-Tabelle pflegen

Die App enthält eine fest hinterlegte Tabelle der Basiszinssätze nach
§ 247 BGB ab dem 1. Januar 2002. **Diese eingebauten Werte werden ohne
Gewähr auf Richtigkeit und Aktualität bereitgestellt.** Für aktuelle und
verbindliche Werte ist die offizielle Quelle der Deutschen Bundesbank
heranzuziehen. Fehlt ein aktueller Wert oder soll ein Wert korrigiert
werden, kann er in der Ansicht „Basiszins“ als Override erfasst werden;
Overrides werden lokal gespeichert und können jederzeit zurückgesetzt
werden. Deckt die Tabelle das heutige Datum nicht mehr ab, zeigt die App
ein Warnbanner (in Konten- und Basiszins-Ansicht) und weist auch im Report
und auf dem PDF darauf hin, dass mit dem letzten bekannten Satz
weitergerechnet wird.

## Export/Import

- **Export**: In der Konten-Ansicht kann ein einzelnes Konto über den
  Button „Exportieren“ auf der jeweiligen Kontokarte oder alle Konten
  gemeinsam über „Alle exportieren“ als JSON-Datei heruntergeladen werden.
  Das Dateiformat ist `{ "version": 1, "konten": [...] }`; „Alle
  exportieren“ ergänzt zusätzlich die Basiszins-Overrides
  (`"basiszinsOverrides": [...]`).
- **Import**: Über „Importieren“ kann eine zuvor exportierte JSON-Datei
  ausgewählt werden. Die Datei wird vollständig geprüft (Version, Struktur
  der Konten und Buchungen); ist auch nur eine Angabe ungültig, wird
  nichts importiert und eine verständliche Fehlermeldung angezeigt. Bei
  erfolgreicher Prüfung werden alle enthaltenen Konten mit neuen,
  kollisionsfreien IDs zu den bestehenden Konten hinzugefügt (bestehende
  Konten werden nicht überschrieben oder verändert).

## Tests

```
node --test tests/*.test.js
```

Die Tests decken die Datums-/Betragsformatierung, die Basiszins-Tabelle,
die Zinssegment- und Kontoberechnung sowie die Export/Import-Validierung ab.

## Haftungsausschluss

Diese Anwendung dient der technischen Unterstützung bei der Führung und
Berechnung von Forderungskonten und ersetzt keine Rechts- oder
Steuerberatung. Für die Richtigkeit der Berechnungen – insbesondere der
hinterlegten Basiszinssätze und der daraus abgeleiteten Zinsbeträge – wird
keine Gewähr übernommen. Im Zweifel ist fachkundiger Rat einzuholen.
