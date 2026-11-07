FROM nginx:alpine

# Datos propios de cada despliegue. Se pasan al construir la imagen (nunca se
# guardan en el repositorio). Si están vacíos, la web conserva los marcadores
# y el botón de contacto no se muestra.
ARG RESPONSABLE_NOMBRE=""
ARG CONTACTO_EMAIL=""
# Dirección base del n8n, sin barra final (p. ej. https://n8n.ejemplo.com).
# Si está vacía, la web usa la que trae index.html.
ARG N8N_BASE_URL=""

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html 404.html identidad.css demo.css demo.js compartir.png robots.txt sitemap.xml llms.txt /usr/share/nginx/html/
COPY .well-known /usr/share/nginx/html/.well-known
COPY fuentes /usr/share/nginx/html/fuentes
COPY logo /usr/share/nginx/html/logo

RUN if [ -n "$RESPONSABLE_NOMBRE" ]; then \
      sed -i "s|<span class=\"marcador\">\[NOMBRE DEL RESPONSABLE\]</span>|$RESPONSABLE_NOMBRE|" /usr/share/nginx/html/index.html; \
    fi; \
    if [ -n "$CONTACTO_EMAIL" ]; then \
      sed -i "s|<span class=\"marcador\">\[EMAIL DE CONTACTO\]</span>|$CONTACTO_EMAIL|" /usr/share/nginx/html/index.html; \
      sed -i "s|const CONTACTO_EMAIL   = '';|const CONTACTO_EMAIL   = '$CONTACTO_EMAIL';|" /usr/share/nginx/html/demo.js; \
    fi; \
    if [ -n "$N8N_BASE_URL" ]; then \
      sed -i "s|https://n8n.vicenterueda.com/webhook/|$N8N_BASE_URL/webhook/|g" /usr/share/nginx/html/demo.js; \
      sed -i "s|connect-src 'self' https://n8n.vicenterueda.com;|connect-src 'self' $N8N_BASE_URL;|" /etc/nginx/conf.d/default.conf; \
    fi

# Si la configuración de nginx tuviera un error, la construcción falla aquí y la
# web publicada sigue funcionando (sin esto, fallaría al arrancar el contenedor).
RUN nginx -t

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
