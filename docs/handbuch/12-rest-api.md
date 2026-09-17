# 12 — Rechen-Schnittstelle (REST-API)

*Dieses Kapitel richtet sich an Administratoren und IT.* Für die tägliche
Arbeit mit Saldenwerk brauchen Sie es nicht — die Browser-App funktioniert
unverändert und ohne jede Einrichtung.

Saldenwerk kann seine Berechnungen zusätzlich über eine Schnittstelle im
Kanzleinetz anbieten. Damit können andere Programme — Kanzleisoftware,
Auswertungen, eigene Skripte — dieselben Zinsen und Gebühren berechnen
lassen, die auch die Browser-App anzeigt.

Die Schnittstelle ist **standardmäßig aus**. Ohne ausdrückliche
Einrichtung ändert sich an Ihrer Installation nichts.

## Was die Schnittstelle tut — und was nicht

**Sie ist zustandslos.** Ihr Programm schickt den Datenbestand mit der
Anfrage, die Schnittstelle rechnet und schickt das Ergebnis zurück.
Danach ist der Vorgang vorbei: Es gibt **keine Datenbank, keine Konten
auf dem Server und keine Datei**, in der etwas zurückbliebe. Die
JSON-Datei auf Ihrem Netzlaufwerk bleibt die einzige Quelle der Wahrheit.

Das ist keine Nebensächlichkeit, sondern der Grund, warum die
Datenschutzerklärung weiterhin so knapp ausfallen kann: Es gibt schlicht
nichts, was gespeichert würde.

**Sie gehört ins Kanzleinetz, nicht ins Internet.** Die Anmeldung läuft
über HTTP Basic Auth; ohne TLS davor werden die Zugangsdaten im Klartext
übertragen. Der API-Container veröffentlicht seinen Port deshalb
absichtlich nicht nach außen — erreichbar ist er nur über den nginx davor.
Wer Saldenwerk aus dem Internet erreichbar machen möchte, richtet
vorher HTTPS ein ([Kapitel 2](02-installation.md)).

## Einrichten

Legen Sie neben der `docker-compose.yml` eine Datei `.env` an:

```
SALDENWERK_API_URL=http://saldenwerk-api:8091
SALDENWERK_API_BENUTZER=kanzlei
SALDENWERK_API_PASSWORT=<ein langes, zufälliges Passwort>
```

Dann starten:

```
docker compose --profile api up -d --build
```

Prüfen, ob es läuft:

```
curl http://localhost:8090/api/status
```

Antwortet der Aufruf mit `{"app":"Saldenwerk", ...}`, ist die
Schnittstelle da. Antwortet er mit `404`, läuft sie nicht — dann fehlt
entweder das Profil oder `SALDENWERK_API_URL`.

**Wieder abschalten:** `docker compose up -d` ohne `--profile api`. Die
App läuft dann wie zuvor, `/api/` antwortet wieder mit 404.

**Ohne Zugangsdaten startet der Dienst nicht.** Das ist Absicht: Eine
versehentlich offene Rechen-Schnittstelle im Kanzleinetz wäre schlimmer
als eine, die gar nicht läuft. Dasselbe gilt für eine halb konfigurierte
Anbindung an Kanzleisoftware — entweder alle Werte oder keinen.

## Ausprobieren

Unter `http://localhost:8090/api/docs` liegt eine Bedienoberfläche
(Swagger UI), in der sich jeder Aufruf direkt ausprobieren lässt. Oben
rechts über **Authorize** die Zugangsdaten eintragen, dann bei einem
Endpunkt auf **Try it out**.

Die maschinenlesbare Beschreibung liegt unter
`http://localhost:8090/api/openapi.json` und lässt sich in gängige
Werkzeuge (Bruno, Insomnia, Postman) importieren.

Ein vollständiger Aufruf auf der Kommandozeile, mit der Beispieldatei:

```
curl -u kanzlei:IHRPASSWORT \
     -H 'Content-Type: application/json' \
     --data @docs/beispiel-konto.json \
     'http://localhost:8090/api/berechnung?stichtag=2026-08-12'
```

## Die Endpunkte im Überblick

| Aufruf | Was er liefert |
| --- | --- |
| `GET /api/status` | Ob die Schnittstelle läuft und welche Zusatzfunktionen aktiv sind (ohne Anmeldung) |
| `GET /api/basiszins` | Die Basiszinstabelle nach § 247 BGB und bis wann sie reicht |
| `POST /api/berechnung` | Zinsstaffel, Verrechnung der Zahlungen, offene Salden, Warnungen |
| `POST /api/report` | Die Forderungsaufstellung als HTML |
| `POST /api/pdf` | Die Forderungsaufstellung als PDF |
| `POST /api/tenor` | Den Antragstext für Mahnbescheid oder Klage |
| `POST /api/rvg` | RVG- und GKG-Gebühren als fertige Nebenforderungen |
| `GET /api/docs` | Swagger UI (ohne Anmeldung) |

Alle `POST`-Aufrufe erwarten als Inhalt **das Dateiformat der
Speicherdatei** — die Datei vom Netzlaufwerk kann also unverändert
gesendet werden. Zwei optionale Angaben in der Adresse:

- `?kontoId=` wählt das Konto über seine `id` oder seinen genauen Namen.
  Ohne Angabe wird das erste Konto der Datei gerechnet.
- `?stichtag=JJJJ-MM-TT` setzt den Stichtag. Ohne Angabe gilt das
  heutige Datum **des Servers**.

## Fehlermeldungen

Geht etwas schief, antwortet die Schnittstelle immer nach demselben
Muster:

```json
{ "fehler": "Konto 1 („Muster GmbH"): Feld „buchungen" fehlt oder ist keine Liste.",
  "code": "BESTAND_UNGUELTIG" }
```

`fehler` ist der Text, den Sie einem Menschen zeigen können — es sind
dieselben Meldungen, die auch die Browser-App beim Import anzeigt.
`code` ist für Programme gedacht; werten Sie diesen aus und nicht den
Text, der sich ändern kann.

| Code | Bedeutung |
| --- | --- |
| `BESTAND_UNGUELTIG` | Die gesendete Datei entspricht nicht dem Format |
| `KONTO_NICHT_GEFUNDEN` | Kein Konto mit dieser Kennung in der Datei |
| `KONTO_MEHRDEUTIG` | Mehrere Konten passen — bitte die `id` angeben |
| `KONTO_LEER` | Die Datei enthält überhaupt kein Konto |
| `STICHTAG_UNGUELTIG` | Der Stichtag ist kein gültiges Datum |
| `RVG_EINGABE_UNGUELTIG` | Die Gebühreneingaben sind unvollständig oder falsch |
| `BERECHNUNG_ZU_GROSS` | Der Rechenaufwand wäre unvertretbar — Stichtag oder Verzinsungszeitraum prüfen |

## Datenschutz

Mit aktivierter Schnittstelle ändert sich, **wo** gerechnet wird: Der
Datenbestand geht vom Browser an den Server Ihrer eigenen Installation.
Er verlässt damit den einzelnen Arbeitsplatz, aber **nicht die Kanzlei** —
es ist Ihr Server, Ihr Netz, Ihre Verantwortung. Ein Dritter ist nicht
beteiligt.

Drei technische Zusicherungen dazu:

- Die Schnittstelle **speichert nichts**. Kein Konto, keine Datenbank,
  keine Datei auf dem Server.
- Anfragen an `/api/` werden **nicht protokolliert**. Sonst stünden
  Aktenzeichen aus dem Adressteil der Anfrage in den nginx-Logdateien.
- Der Zugang ist durch Anmeldung geschützt, und ohne hinterlegte
  Zugangsdaten startet der Dienst nicht.

Die Zugangsdaten für die Schnittstelle liegen im Browser der
Arbeitsplätze (localStorage). Für ein abgeschlossenes Kanzleinetz ist das
vertretbar; richten Sie HTTPS ein, wenn Saldenwerk über das Kanzleinetz
hinaus erreichbar sein soll.

**Nicht zu verwechseln mit der KI-Anbindung.** Die Rechen-Schnittstelle
bleibt vollständig in Ihrem Haus. Werkzeuge, die Mandatsdaten an einen
KI-Anbieter übertragen, sind ein völlig anderer Sachverhalt.

## Betrieb

- **Zeitzone:** Der API-Container läuft auf `Europe/Berlin`. Das ist
  wichtig, weil der Stichtag ohne ausdrückliche Angabe das Datum des
  Servers ist — in UTC wäre das zwischen 0 und 2 Uhr nachts der Vortag.
- **Plausibilitätsgrenzen:** Alle Datumsangaben müssen zwischen 1900 und 2100
  liegen, und sehr umfangreiche Berechnungen werden abgelehnt statt ausgeführt.
  Realistische Konten sind davon nicht betroffen.
- **Größenbegrenzung:** Anfragen dürfen bis 10 MB groß sein. Das reicht
  für sehr große Bestände; darüber antwortet die Schnittstelle mit 413.
- **Aktualisieren:** `docker compose --profile api pull` und erneut
  starten. Ohne das Profil bleibt der API-Container außen vor.
- **Zweites Image:** `ghcr.io/pbaumfalk/saldenwerk-api`, gebaut aus
  `Dockerfile.api`.

---

Weiter: [Zur Übersicht](README.md)
