// Betriebsmodus von Saldenwerk.
//
//   oeffentlich: false  → Kanzlei-Modus (Standard): ohne öffentliche
//                         Fußzeile.
//   oeffentlich: true   → Öffentliche Gratis-Variante: Fußzeile mit
//                         Impressum/Datenschutz und Haftungshinweis
//                         eingeblendet.
//
// Für ein öffentliches Deployment diese Datei mit oeffentlich: true
// ausliefern (z. B. im Docker-Volume überschreiben) und die Platzhalter in
// impressum.html und datenschutz.html ausfüllen.
//
// Optionales branding:
//   branding: {
//     name: 'Anzeigename der App',          // Titel + App-Leiste
//     logo: 'branding/logo.png',            // ersetzt das Signet oben links
//     claim: 'Untertitel in der App-Leiste',
//     beschreibung: 'Meta-Description für Suchmaschinen',
//     farben: { '--farbe-akzent': '#1e7034' },        // CSS-Variablen
//     kanzlei: {                            // Werbe-Box (nur öffentlicher Modus)
//       name, text, url, telefon, logo,     // logo = Pfad zur Bilddatei
//     },
//   }
//
// Zur Akzentfarbe: '--farbe-akzent' färbt aktive Navigation, Links, den
// Fokusrahmen und die Akzentkante der Karten — im hellen wie im dunklen
// Modus (für Dunkel wird der Wert automatisch aufgehellt; ein eigener Wert
// lässt sich mit '--branding-akzent-dunkel' vorgeben). Primär-Buttons
// bleiben bewusst im neutralen Markenschema (Navy bzw. Hell im Dunkelmodus),
// damit sie zu jeder Akzentfarbe kontrastreich bleiben. Bitte eine Farbe mit
// ausreichend Kontrast wählen (WCAG AA).
window.Konfig = {
  oeffentlich: false,
};
