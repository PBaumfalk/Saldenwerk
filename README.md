# J-Forderungsrechner

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
- **RVG-Rechner**: Der Dialog „RVG-Rechner" in der Buchungen-Ansicht berechnet
  vorgerichtliche Kosten (Geschäftsgebühr Nr. 2300 VV RVG mit wählbarem
  Faktor, Auslagenpauschale Nr. 7002, USt Nr. 7008) und gerichtliche Kosten
  (Verfahrensgebühr Nr. 3100, Terminsgebühr Nr. 3104, Gerichtskosten KV 1100
  für das Mahnverfahren bzw. KV 1210 für die Klage), auf Wunsch mit Anrechnung
  der Geschäftsgebühr nach Vorbem. 3 Abs. 4 VV RVG und Verzugspauschale nach
  § 288 Abs. 5 BGB. Die Beträge werden als Nebenforderungs-Buchungen
  eingefügt. **Gebührenstand: KostRÄG 2025 (ab 01.06.2025) — Angaben ohne
  Gewähr**; bei Gesetzesänderungen sind die Tabellen in `rvg.js` zu pflegen.
- **Antragstext**: „Antragstext kopieren" im Report erzeugt einen Tenor-Text
  für Mahnbescheid oder Klageantrag (nummerierte Forderungen, Zinsklauseln,
  Abzugsklauseln für Teilzahlungen) und legt ihn in die Zwischenablage.
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

## Docker-Deployment (empfohlen für die Kanzlei)

Statt `index.html` auf jedem Rechner zu öffnen, kann die App als
Docker-Container ausgeliefert werden — eine URL für alle Arbeitsplätze, und
die j-lawyer-API wird unter **demselben Origin** durchgereicht, sodass das
CORS-Problem (siehe unten) gar nicht erst entsteht:

```
docker compose up -d --build
```

Vorher die Adresse des j-lawyer-Servers in einer `.env`-Datei neben der
`docker-compose.yml` hinterlegen (ohne Pfad, ohne abschließenden Slash):

```
JLAWYER_URL=http://192.168.1.10:8080
```

Die App ist dann unter `http://SERVER:8090` erreichbar; im
j-lawyer-Einstellungsdialog bleibt die Server-URL einfach **leer**
(= gleiche Adresse wie die App). Ist der j-lawyer-Server gerade nicht
erreichbar, startet der Container trotzdem — die API-Anfragen melden dann
einen Verbindungsfehler.

**HTTPS**: Die Datei-Speicherung (File System Access API) funktioniert nur
in sicheren Kontexten (HTTPS oder localhost). Ohne HTTPS läuft die App im
LAN trotzdem — die Daten liegen dann im localStorage des jeweiligen
Browsers, mit Backup-Erinnerung. Für HTTPS: Zertifikate nach
`certs/tls.crt`/`tls.key` legen und in `docker-compose.yml` die
auskommentierten Zeilen (Port 8443 + Volumes) aktivieren.

Der Container speichert selbst keine Daten — Konten liegen weiterhin im
Browser bzw. in der verbundenen JSON-Datei; gemeinsames Arbeiten läuft über
die Datei auf dem Netzlaufwerk oder Export/Import.

## Öffentliche Gratis-Variante

Die App kann als kostenloses, öffentliches Angebot gehostet werden — sie
speichert prinzipbedingt keine Nutzerdaten auf dem Server (alles bleibt im
localStorage des Besuchers; kein Konto, keine Cookies, kein Tracking).
Dazu in `konfig.js` den Schalter umstellen:

```js
window.Konfig = { oeffentlich: true };
```

Im öffentlichen Modus sind die j-lawyer-Funktionen ausgeblendet und eine
Fußzeile mit Haftungshinweis sowie Links auf `impressum.html` und
`datenschutz.html` eingeblendet. **Vor der Veröffentlichung müssen die
`[PLATZHALTER]` in beiden Seiten mit den echten Kanzleiangaben gefüllt und
die Texte fachlich geprüft werden** (Impressumspflicht nach § 5 DDG,
DSGVO-Informationen, Logdaten-Abschnitt an das tatsächliche Hosting
anpassen). Beim Docker-Deployment lässt sich die Konfiguration ohne
Neu-Build überschreiben:

```yaml
volumes:
  - ./konfig.oeffentlich.js:/usr/share/nginx/html/konfig.js:ro
```

Hinweis zur Vermarktung: unter eigenem Namen anbieten
(„J-Forderungsrechner — kostenloses Forderungskonto im Browser"), nicht
unter Anlehnung an fremde Produktnamen.

### Gebrandete Variante („Baumfalk-Forderungsrechner")

`konfig.baumfalk.js` ist eine fertige Deployment-Konfiguration mit
Kanzlei-Branding: eigener App-Name und Claim in Titel und App-Leiste,
Meta-Description für Suchmaschinen, Kanzlei-Farbschema (CSS-Variablen)
und eine Werbe-Box in der Fußzeile (Logo aus `branding/`, Werbetext,
Website-Link, Telefon). Aktivierung beim Docker-Deployment:

```yaml
volumes:
  - ./konfig.baumfalk.js:/usr/share/nginx/html/konfig.js:ro
```

Eigenes Branding: `konfig.baumfalk.js` kopieren und die Felder unter
`branding` anpassen (alle optional; ohne `branding`-Block bleibt das
neutrale Erscheinungsbild).

## j-lawyer-Anbindung

Die App kann sich mit einem [j-lawyer.org](https://www.j-lawyer.org)-Server
verbinden (Konten-Ansicht → „j-lawyer…": Server-URL, Benutzername, Passwort;
der Benutzer braucht die Rollen `readArchiveFileRole` und
`writeArchiveFileRole`):

- **Stammdaten übernehmen**: Im Dialog „Kontodaten" sucht „Aus j-lawyer
  übernehmen" die Akte zum Aktenzeichen und füllt Gläubiger und Schuldner
  (Annahme: Mandant = Gläubiger, Gegner = Schuldner — bitte prüfen, die
  Felder bleiben editierbar).
- **Forderungsaufstellung hochladen**: „An j-lawyer senden" im Report lädt
  drei Dokumente in die Akte: PDF (Kontoblatt + Summenseite), eigenständige
  HTML-Datei und die JSON-Sicherung des Kontos (reimportierbar).

**Wichtig — CORS**: Der j-lawyer-Server sendet keine CORS-Header. Browser
blockieren deshalb direkte Anfragen aus dieser App. **Empfohlene Lösung ist
das Docker-Deployment (siehe oben)** — dort läuft die j-lawyer-API unter
demselben Origin und CORS spielt keine Rolle. Wer die App ohne Docker
direkt vom Dateisystem nutzt, braucht stattdessen einen Reverse-Proxy vor
dem j-lawyer-Server, der die nötigen Header ergänzt, z. B. mit nginx:

```nginx
location /j-lawyer-io/ {
    proxy_pass http://JLAWYER-SERVER:8080/j-lawyer-io/;
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods "GET, PUT, OPTIONS" always;
    add_header Access-Control-Allow-Headers "authorization, content-type" always;
    if ($request_method = OPTIONS) { return 204; }
}
```

(`*` ist hier nötig, weil die App unter `file://` den Origin `null` sendet;
sie nutzt kein `credentials: 'include'`, der Authorization-Header wird
explizit gesetzt.) In den Einstellungen dann die Proxy-URL eintragen und
„Verbindung testen" nutzen — Fehler werden verständlich klassifiziert
(Anmeldung, Berechtigung, CORS/Netzwerk, Zeitüberschreitung).

**Hinweis Zugangsdaten**: Das Passwort liegt unverschlüsselt im localStorage
des Browsers (eigener Schlüssel, es landet nicht in Exporten oder der
Datei-Speicherung). Auf geteilten Rechnern bewusst entscheiden.

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
