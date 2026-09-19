# Änderungsprotokoll

Alle nennenswerten Änderungen an Saldenwerk werden hier festgehalten.
Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

### Neu

- **Werkzeuge für Browser-Agenten (WebMCP).** Verwenden Sie in Ihrem
  Browser einen KI-Agenten, meldet Saldenwerk ihm vier Rechenwerkzeuge an:
  Konto berechnen, Antragstext, RVG-Nebenforderungen und Basiszins. Die
  Werkzeuge sind **pseudonym** (nur Beträge, Daten und Zinssätze; kein Feld
  für Namen, Aktenzeichen oder Buchungstexte), als nur lesend
  gekennzeichnet und rechnen ausschließlich mit dem, was der Agent
  übergibt — Ihre gespeicherten Konten lesen sie nicht. Ohne Agent verhält
  sich die App unverändert. Abschalten: `webmcp: false` in `konfig.js`.
  Einzelheiten und Grenzen im neuen Handbuch-Kapitel 13.
- Fehler erreichen den Agenten mit denselben Codes wie in der
  Rechen-Schnittstelle (`STICHTAG_UNGUELTIG`, `BESTAND_UNGUELTIG` …).

### Geändert

- `kern.js` wird jetzt auch von der Browser-App geladen und gehört damit
  zum statischen Image. An den Berechnungen ändert das nichts.
- Die Datenschutzzusagen nennen WebMCP ausdrücklich: Saldenwerk überträgt
  weiterhin nichts; was ein vom Nutzer gewählter Agent an seinen Anbieter
  weitergibt, liegt außerhalb von Saldenwerk. WebMCP ist die eine Ausnahme
  von „standardmäßig aus" und als solche begründet.
  `tests/doku-versprechen.test.js` bindet die neuen Sätze an `webmcp.js`.

## [1.1.2] – 2026-09-19

**Ändert Ergebnisse:** Gebührenaufstellungen für das Mahnverfahren fallen
niedriger aus als bisher.

### Behoben

- Der RVG-Rechner buchte im Mahnverfahren eine 1,3 Verfahrensgebühr nach
  Nr. 3100 VV RVG. Dort entsteht aber die 1,0 Verfahrensgebühr nach
  Nr. 3305 VV RVG. Betrag und Bezeichnung sind korrigiert; die Anrechnung
  der Geschäftsgebühr (Vorbem. 3 Abs. 4 VV RVG) kürzt jetzt die Nr. 3305.
  Das Klageverfahren ist unverändert.
- Ganze Gebührenfaktoren erscheinen als „2,0" statt „2".

### Neu

- Im Mahnverfahren lässt sich die 0,5 Verfahrensgebühr nach Nr. 3308 VV RVG
  für den Antrag auf Vollstreckungsbescheid hinzubuchen (standardmäßig aus;
  in der Schnittstelle das Feld `vollstreckungsbescheid`).

## [1.1.1] – 2026-09-17

Reine Fehlerbehebungen. **Zwei davon ändern Ergebnisse** — bitte die Hinweise
unter „Behoben" lesen, bevor Sie ältere Ausdrucke vergleichen.

### Behoben

**Antragstext (Mahnbescheid und Klage)**

- Wurde eine Zahlung nach § 367 BGB auf die laufenden Zinsen verrechnet,
  erschien sie im Antragstext überhaupt nicht, während die Zinsklausel
  unverändert „seit dem …" lief. Ein Gericht hätte damit auch den Zeitraum
  verzinst, für den bereits gezahlt wurde. Der Zinslauf wird jetzt geteilt:
  ein bezifferter Betrag bis zur Zahlung, die Zahlung ausgewiesen, und die
  laufende Klausel setzt erst am Zahlungstag an.
- Bei Verrechnung nach § 497 Abs. 3 BGB entstand gar kein Antragstext, sobald
  die Hauptforderung getilgt war — obwohl Zinsen offen blieben. Saldenwerk
  meldete dann „Keine offenen Forderungen". Solche Fälle erscheinen jetzt als
  bezifferter Zinsantrag.

**Zinsberechnung**

- Die Zinsmethode „Bank 30/360" rechnete an Monatsenden ein bis zwei Zinstage
  zu wenig. **Betroffene Konten rechnen jetzt geringfügig höhere Zinsen.**
  Betroffen ist nur, wessen Verzinsungsbeginn oder Stichtag auf einen
  Monatsletzten fällt; bei allen anderen Daten ändert sich nichts. Beispiel:
  Verzug seit 01.01., Stichtag 28.02. — statt 58 werden jetzt 60 Zinstage
  gezählt.

**Forderungsaufstellung**

- Im Kopf der Aufstellung überlappten sich die Angaben, wenn die Parteinamen
  lang waren. Steht die Gegenüberstellung bereits im Kontonamen, wird sie
  nicht mehr ein zweites Mal ausgegeben.
- Der Zusatz hinter einer Buchung behauptete eine Verzinsung bis zum Stichtag,
  auch wenn die Forderung zwischenzeitlich getilgt war.
- Der Hinweis zum Ende der Basiszins-Tabelle zeigte das Datum in technischer
  Schreibweise.

**Rechen-Schnittstelle (nur bei aktiviertem API-Profil)**

- Die Dokumentationsseite unter `/api/docs` funktionierte hinter dem
  Kanzlei-Server nicht — sie blieb leer.
- Unsinnige Datumsangaben konnten den Dienst zum Absturz bringen. Alle Daten
  sind jetzt auf die Jahre 1900 bis 2100 begrenzt, und zu umfangreiche
  Berechnungen werden mit einer verständlichen Meldung abgelehnt.
- Buchungen ohne Text wurden angenommen und erschienen in der
  Forderungsaufstellung als „undefined".
- Die Meldung „Daten zu groß" erreichte den Aufrufer bei sehr großen Anfragen
  nicht; stattdessen brach die Verbindung ab.
- Konten mit numerischer Kennung waren über `?kontoId=` nicht auffindbar.
- Eine Sonderform im Anfrageinhalt konnte die Prüfung der RVG-Eingaben
  umgehen und zu falschen Gebühren führen.

**Basiszinssatz**

- Eigene Basiszinssätze zu einem anderen Datum als dem 1. Januar oder
  1. Juli wurden angenommen, aber nicht verwendet. Sie werden jetzt beim
  Einlesen abgelehnt. In der Anwendung selbst war das nie möglich.

### Geändert
- Die Prüfungen wurden von 279 auf 306 erweitert, überwiegend an genau den
  Stellen, an denen die obigen Fehler saßen.

## [1.1.0] – 2026-09-16

Die Browser-App ist unverändert. Wer die neuen Zusatzmodule nicht
einrichtet, merkt von diesem Update nichts.

### Hinzugefügt
- **Rechen-Schnittstelle (optional)**: Saldenwerk kann seine Berechnungen
  jetzt auch über eine Schnittstelle im Kanzleinetz anbieten —
  Forderungsaufstellung, Report, PDF, Antragstext, RVG-Gebühren und
  Basiszinstabelle. Die Schnittstelle ist **zustandslos**: Sie bekommt den
  Datenbestand mit der Anfrage, rechnet und speichert nichts — weder in
  einer Datenbank noch als Datei. Der Zugang ist durch eine Anmeldung
  geschützt; ohne hinterlegte Zugangsdaten startet der Dienst gar nicht
  erst. Standardmäßig **aus** —
  siehe [Handbuch, Kapitel 12](docs/handbuch/12-rest-api.md).
- Zweites Docker-Image `ghcr.io/pbaumfalk/saldenwerk-api` und ein
  Compose-Profil `api`. Ohne `--profile api` bleibt das Deployment exakt
  wie bisher.
- Maschinenlesbare Schnittstellenbeschreibung unter `/api/openapi.json`
  und eine Bedienoberfläche zum Ausprobieren unter `/api/docs`.
- Handbuch-Kapitel 12 „Rechen-Schnittstelle".

### Geändert
- Die Rechenabläufe (Bestand prüfen, Konto wählen, Stichtag setzen, rechnen,
  Report und Antragstext bauen) liegen jetzt gebündelt in `kern.js` — eine
  Quelle für die Browser-App und die Schnittstelle. Die Browser-App rechnet
  unverändert; ein Test hält beide Wege Ergebnis für Ergebnis deckungsgleich.
- README, Datenschutzerklärung und Handbuch unterscheiden jetzt ausdrücklich
  zwischen der Browser-App (Daten bleiben auf dem Rechner) und den optionalen
  Zusatzmodulen. Kapitel 9 „Integrationen" ist zu einem Überblick umgebaut.
- Kapitel 8 warnt davor, ein Zusatzmodul auf dieselbe Speicherdatei zu
  richten, mit der die App gerade verbunden ist — beide würden einander
  überschreiben.

### Behoben
- Der PDF-Export erzeugte außerhalb des Browsers keine Datei, sondern brach
  mit „jsPDF ist nicht geladen" ab. Betraf bisher niemanden, weil Saldenwerk
  nur im Browser lief.

### Sicherheit
- Anfragen an die Rechen-Schnittstelle werden **nicht protokolliert**.
  Aktenzeichen stehen im Adressteil der Aufrufe und wären sonst im
  nginx-Standard in den Protokolldateien gelandet.
- Der API-Container veröffentlicht seinen Port nicht nach außen; erreichbar
  ist er nur über den nginx davor.

## [1.0.1] – 2026-08-12

### Behoben
- Beträge mit Tausenderpunkt ohne Komma („1.000") wurden als Dezimalzahl
  gelesen — aus 1.000 € wurde 1,00 €.
- Der Import einer Datei mit unmöglichem Datum (z. B. „2024-13-01") stürzte
  kommentarlos ab statt eine Fehlermeldung zu zeigen.
- Zwischen 0 und 2 Uhr nachts lieferte das Programm als „heute" den Vortag
  (betraf Default-Stichtag, Erstellungsdaten und Export-Dateinamen).
- Der RVG-Rechner prüft seine Eingaben jetzt selbst: ungültige Faktoren
  werfen einen Fehler statt still eine leere Gebührenliste zu liefern, ein
  negativer Anrechnungsfaktor kann die Verfahrensgebühr nicht mehr erhöhen.
- Die HTTPS-Anleitung führte zu einer defekten `docker-compose.yml`
  (doppelter `ports:`-Schlüssel) — Compose-Kommentare und Handbuch
  korrigiert; ebenso die Update-Anleitung für den Image-Betrieb.

### Geändert
- Auslieferung gehärtet: Security-Header (u. a. Content-Security-Policy,
  nosniff, Clickjacking-Schutz), gzip-Kompression (Erstaufruf ~70 %
  kleiner), nginx-Version gepinnt, Container-Healthcheck.
- Schrift wird vorgeladen (kein Aufblitzen der Systemschrift beim Start);
  gebündelte Bibliotheksversionen sind jetzt in `vendor/README.md`
  dokumentiert.
- CI baut und testet das Docker-Image jetzt auch auf Pull Requests
  (inkl. Smoke-Test); Releases entstehen automatisch beim Taggen.
- Dependabot hält GitHub-Actions und das nginx-Basis-Image aktuell.

## [1.0.0] – 2026-08-07

Erste veröffentlichte Version: Forderungskonten mit Zinsberechnung
(fest/Basiszins, Kalender- und 360-Tage-Methode), Tilgungsreihenfolge nach
§ 367 und § 497 Abs. 3 BGB, RVG-Gebührenrechner, Report mit PDF-Export und
Antragstext, Datei-Speicherung im Kanzlei-Netz, Docker-Deployment.

[1.1.2]: https://github.com/PBaumfalk/Saldenwerk/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/PBaumfalk/Saldenwerk/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/PBaumfalk/Saldenwerk/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/PBaumfalk/Saldenwerk/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/PBaumfalk/Saldenwerk/releases/tag/v1.0.0
