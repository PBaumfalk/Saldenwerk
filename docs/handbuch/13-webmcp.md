# 13 — Werkzeuge für Browser-Agenten (WebMCP)

*Dieses Kapitel betrifft Sie nur, wenn Sie in Ihrem Browser einen
KI-Agenten verwenden.* Ohne Agent verhält sich Saldenwerk genau wie bisher;
es gibt nichts einzurichten und nichts zu sehen.

Manche Browser bringen inzwischen einen KI-Agenten mit oder lassen einen
nachrüsten. Über **WebMCP** kann eine Webseite einem solchen Agenten
Werkzeuge anbieten, damit er nicht mühsam Formulare bedienen muss.
Saldenwerk bietet vier Rechenwerkzeuge an:

| Werkzeug | Was es tut |
| --- | --- |
| `saldenwerk_konto_berechnen` | Forderungskonto zum Stichtag: Zinsstaffel, Verrechnung nach § 367 oder § 497 Abs. 3 BGB, Salden |
| `saldenwerk_antragstext` | Antragstext für Mahnbescheid oder Klage aus denselben Eingaben |
| `saldenwerk_rvg_nebenforderungen` | RVG-Gebühren, Gerichtskosten, Verzugspauschale ([Kapitel 5](05-rvg-rechner.md)) |
| `saldenwerk_basiszins` | Basiszinstabelle und der Satz an einem Tag ([Kapitel 7](07-basiszins.md)) |

Gerechnet wird mit demselben Rechenkern wie in der App und in der
Rechen-Schnittstelle ([Kapitel 12](12-rest-api.md)); die Ergebnisse sind
identisch.

Anders als die Rechen-Schnittstelle ist WebMCP kein eigener Dienst, sondern
ein Teil der Browser-App, und es ist **standardmäßig an**. Das ist
vertretbar, weil die Anmeldung für sich genommen nichts überträgt und die
Werkzeuge nichts preisgeben können — warum, steht im nächsten Abschnitt.
Abschalten lässt es sich trotzdem mit einer Zeile, siehe unten.

## Was die Werkzeuge tun — und was nicht

**Sie rechnen nur mit dem, was der Agent ihnen übergibt.** Die Werkzeuge
lesen weder Ihre gespeicherten Konten noch die Speicherdatei, und sie
öffnen keine Netzverbindung. Ein Agent erfährt über WebMCP also nichts,
was er nicht selbst mitgebracht hat.

**Sie ändern nichts.** Alle vier Werkzeuge sind als nur lesend
gekennzeichnet (`readOnlyHint`). Sie legen kein Konto an, buchen nichts
und speichern nichts. Ein Ergebnis, das Sie behalten wollen, tragen Sie
selbst in die App ein.

**Sie kennen keine Namen.** Die Eingaben bestehen aus Beträgen, Daten,
Zinssätzen und Schaltern. Es gibt kein Feld für Gläubiger, Schuldner,
Aktenzeichen oder Buchungstexte; schickt ein Agent dergleichen dennoch mit,
wird es verworfen, bevor gerechnet wird. Buchungen heißen in der Antwort
`hauptforderung-1`, `zahlung-2` und so fort, und der Antragstext spricht von
„der Schuldnerseite" und „der Gläubigerseite". Die Namen setzen Sie selbst
ein.

## Datenschutz

WebMCP ist **standardmäßig an**, überträgt für sich aber nichts:
Saldenwerk sendet auch mit WebMCP keine Daten an uns oder an Dritte.

Der Agent dagegen ist ein Programm, das **Sie** ausgewählt haben, und er
gibt das, womit er arbeitet, in aller Regel an seinen Anbieter weiter. Für
die Werkzeuge heißt das: Die Zahlen, die der Agent übergibt, und die
Ergebnisse, die er zurückbekommt, liegen beim Anbieter des Agenten. Weil
die Werkzeuge keine Namen annehmen, sind das Beträge, Daten und Zinssätze
ohne Personenbezug — solange der Agent den Bezug nicht aus anderer Quelle
kennt.

Und das ist der wichtigere Punkt: **Ein Browser-Agent kann unabhängig von
WebMCP sehen, was auf dem Bildschirm steht.** Öffnen Sie ein Konto mit
Klarnamen, während ein Agent in diesem Tab arbeitet, kann er die Seite
lesen wie jede andere Webseite. Das liegt am Agenten, nicht an Saldenwerk,
und es lässt sich von Saldenwerk aus nicht verhindern — auch nicht, indem
Sie WebMCP abschalten.

Für Kanzleien folgt daraus: Ob Sie einen Browser-Agenten überhaupt mit
Mandatsdaten in Berührung bringen dürfen, entscheidet sich an § 203 StGB,
§ 43e BRAO und Art. 28 DSGVO — also am Vertrag mit dem Anbieter des
Agenten, nicht an Saldenwerk. Ohne eine solche Grundlage lassen Sie einen
Agenten nur mit den pseudonymen Werkzeugen rechnen und nicht in einem Tab
arbeiten, in dem Mandatsdaten angezeigt werden.

## Abschalten

In `konfig.js`:

```js
window.Konfig = {
  oeffentlich: false,
  webmcp: false,
};
```

Danach meldet Saldenwerk keine Werkzeuge mehr an. Im Docker-Betrieb
überschreiben Sie die Datei wie in [Kapitel 10](10-anpassung.md)
beschrieben.

## Voraussetzungen und Stand

- WebMCP ist ein Entwurf einer W3C Community Group (Stand: 17.09.2026),
  **kein verabschiedeter Standard**. Saldenwerk nutzt
  `document.modelContext` und fällt auf das ältere
  `navigator.modelContext` zurück. Ändert sich der Entwurf, kann die
  Anmeldung in einem Browser ausbleiben, bis Saldenwerk nachzieht. Die App
  selbst ist davon nie betroffen.
- Browser stellen WebMCP nur in sicherem Kontext bereit, also über
  **HTTPS** oder `localhost`. Beim Öffnen der `index.html` per Doppelklick
  steht es in der Regel nicht zur Verfügung.
- Fehler meldet ein Werkzeug mit denselben Codes wie die
  Rechen-Schnittstelle (etwa `STICHTAG_UNGUELTIG`,
  `RVG_EINGABE_UNGUELTIG`), vorangestellt vor der deutschen Meldung.

---

Zurück: [12 — Rechen-Schnittstelle](12-rest-api.md) · [Zur Übersicht](README.md)
