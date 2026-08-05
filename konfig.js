// Betriebsmodus des J-Forderungsrechners.
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
window.Konfig = {
  oeffentlich: false,
};
