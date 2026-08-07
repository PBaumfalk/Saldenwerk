FROM nginx:alpine

# Statische App-Dateien (kein Build-Schritt nötig)
COPY index.html impressum.html datenschutz.html styles.css konfig.js app.js \
     engine.js basiszins.js rvg.js tenor.js druck.js pdfexport.js \
     dateispeicher.js /usr/share/nginx/html/
COPY vendor/ /usr/share/nginx/html/vendor/

# nginx-Konfiguration: statische Auslieferung mit passenden Cache-Headern.
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
