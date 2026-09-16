// pdf-node.js — macht pdfexport.js in Node lauffähig.
//
// pdfexport.js liest `window.jspdf` (siehe pdfexport.js, erzeugePdf). Das
// jsPDF-UMD nimmt in Node aber den module.exports-Zweig und hängt sich NICHT
// an das globale Objekt; ein blosser `globalThis.window = globalThis`-Shim
// reicht deshalb nicht, es fehlt die Zuweisung von globalThis.jspdf.
// Ebenso hängt sich das autoTable-UMD in Node nicht selbst ein, applyPlugin
// muss ausdrücklich aufgerufen werden.
//
// Shim und applyPlugin stehen bewusst im Modulrumpf: der require-Cache
// garantiert damit „genau einmal pro Prozess". Dieses Modul nur dort laden,
// wo wirklich ein PDF entsteht (lazy require), damit der globale
// window-Shim nicht ohne Not gesetzt wird.
//
// app.js prüft `typeof document`, nicht `window`, und bleibt vom Shim
// deshalb unberührt (der UI-Teil ab app.js:160 startet nicht).
//
// Bei einem Update von vendor/jspdf* diese Datei und tests/pdf-node.test.js
// prüfen — Dependabot sieht vendor/ mangels npm-Ökosystem nicht.

globalThis.window = globalThis;

const jspdf = require('./vendor/jspdf.umd.min.js');
globalThis.jspdf = jspdf;

if (!jspdf.jsPDF.API.autoTable) {
  require('./vendor/jspdf.plugin.autotable.min.js').applyPlugin(jspdf.jsPDF);
}

const Pdfexport = require('./pdfexport.js');

// Liefert das fertige PDF als Buffer. `modell` stammt aus
// Kern.pdfModell(...).modell beziehungsweise Druck.baueDruckmodell(...).
function erzeugePdf(modell) {
  return Buffer.from(Pdfexport.erzeugePdf(modell));
}

module.exports = { erzeugePdf };
