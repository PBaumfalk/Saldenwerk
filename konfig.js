// Betriebsmodus von Saldenwerk.
//
//   oeffentlich: false  → Kanzlei-Modus (Standard): alle Funktionen inkl.
//                         j-lawyer-Anbindung sichtbar.
//   oeffentlich: true   → Öffentliche Gratis-Variante: j-lawyer-Funktionen
//                         ausgeblendet, Fußzeile mit Impressum/Datenschutz
//                         und Haftungshinweis eingeblendet.
//
// Für ein öffentliches Deployment diese Datei mit oeffentlich: true
// ausliefern (z. B. im Docker-Volume überschreiben) und die Platzhalter in
// impressum.html und datenschutz.html ausfüllen.
//
// Optionales branding:
//   branding: {
//     name: 'Anzeigename der App',          // Titel + App-Leiste
//     logo: 'branding/logo.png',            // ersetzt das §-Icon oben links
//     claim: 'Untertitel in der App-Leiste',
//     beschreibung: 'Meta-Description für Suchmaschinen',
//     farben: { '--farbe-akzent': '#1e7034', ... },   // CSS-Variablen
//     kanzlei: {                            // Werbe-Box (nur öffentlicher Modus)
//       name, text, url, telefon, logo,     // logo = Pfad zur Bilddatei
//     },
//   }
window.Konfig = {
  oeffentlich: false,
};
