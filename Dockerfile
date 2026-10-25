FROM nginx:alpine

# Datos del responsable de la política de privacidad. Se pasan al construir la
# imagen (nunca se guardan en el repositorio). Si están vacíos, la web conserva
# los marcadores y el botón de contacto no se muestra.
ARG RESPONSABLE_NOMBRE=""
ARG CONTACTO_EMAIL=""

COPY index.html /usr/share/nginx/html/index.html

RUN if [ -n "$RESPONSABLE_NOMBRE" ]; then \
      sed -i "s|<span class=\"marcador\">\[NOMBRE DEL RESPONSABLE\]</span>|$RESPONSABLE_NOMBRE|" /usr/share/nginx/html/index.html; \
    fi; \
    if [ -n "$CONTACTO_EMAIL" ]; then \
      sed -i "s|<span class=\"marcador\">\[EMAIL DE CONTACTO\]</span>|$CONTACTO_EMAIL|; s|const CONTACTO_EMAIL   = '';|const CONTACTO_EMAIL   = '$CONTACTO_EMAIL';|" /usr/share/nginx/html/index.html; \
    fi

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
