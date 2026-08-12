FROM nginx:1.29-alpine

LABEL org.opencontainers.image.title="Saldenwerk" \
      org.opencontainers.image.source="https://github.com/PBaumfalk/Saldenwerk" \
      org.opencontainers.image.licenses="MIT"

# Statische App-Dateien (kein Build-Schritt nötig)
COPY index.html impressum.html datenschutz.html styles.css konfig.js app.js \
     engine.js basiszins.js rvg.js tenor.js druck.js pdfexport.js \
     dateispeicher.js /usr/share/nginx/html/
COPY vendor/ /usr/share/nginx/html/vendor/
COPY assets/ /usr/share/nginx/html/assets/

# nginx-Konfiguration: statische Auslieferung mit passenden Cache-Headern.
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/security-headers.conf /etc/nginx/includes/security-headers.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
