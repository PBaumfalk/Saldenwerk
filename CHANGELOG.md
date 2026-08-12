# Änderungsprotokoll

Alle nennenswerten Änderungen an Saldenwerk werden hier festgehalten.
Das Format folgt [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
die Versionierung [Semantic Versioning](https://semver.org/lang/de/).

## [Unreleased]

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

[Unreleased]: https://github.com/PBaumfalk/Saldenwerk/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/PBaumfalk/Saldenwerk/releases/tag/v1.0.0
