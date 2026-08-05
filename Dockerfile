FROM nginx:alpine

# Statische App-Dateien (kein Build-Schritt nötig)
COPY index.html impressum.html datenschutz.html styles.css konfig.js app.js \
     engine.js basiszins.js rvg.js tenor.js druck.js pdfexport.js \
     dateispeicher.js jlawyer.js /usr/share/nginx/html/
COPY vendor/ /usr/share/nginx/html/vendor/

# nginx-Konfiguration: liefert die App aus und reicht die j-lawyer-API
# unter demselben Origin durch (JLAWYER_URL wird beim Start per envsubst
# eingesetzt — Standardmechanismus des offiziellen nginx-Images).
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
