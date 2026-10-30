FROM nginx:alpine

# Datos propios de cada despliegue. Se pasan al construir la imagen (nunca se
# guardan en el repositorio). Si están vacíos, la web conserva los marcadores
# y el botón de contacto no se muestra.
ARG RESPONSABLE_NOMBRE=""
ARG CONTACTO_EMAIL=""
# Dirección base del n8n, sin barra final (p. ej. https://n8n.ejemplo.com).
# Si está vacía, la web usa la que trae index.html.
ARG N8N_BASE_URL=""

COPY index.html identidad.css /usr/share/nginx/html/
COPY fuentes /usr/share/nginx/html/fuentes
COPY logo /usr/share/nginx/html/logo

RUN if [ -n "$RESPONSABLE_NOMBRE" ]; then \
      sed -i "s|<span class=\"marcador\">\[NOMBRE DEL RESPONSABLE\]</span>|$RESPONSABLE_NOMBRE|" /usr/share/nginx/html/index.html; \
    fi; \
    if [ -n "$CONTACTO_EMAIL" ]; then \
      sed -i "s|<span class=\"marcador\">\[EMAIL DE CONTACTO\]</span>|$CONTACTO_EMAIL|; s|const CONTACTO_EMAIL   = '';|const CONTACTO_EMAIL   = '$CONTACTO_EMAIL';|" /usr/share/nginx/html/index.html; \
    fi; \
    if [ -n "$N8N_BASE_URL" ]; then \
      sed -i "s|https://n8n.vicenterueda.com/webhook/|$N8N_BASE_URL/webhook/|g" /usr/share/nginx/html/index.html; \
    fi

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
