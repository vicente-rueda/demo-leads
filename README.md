# Demo Leads — captación automatizada con n8n

Una web con un formulario y un flujo de automatización detrás. Cuando alguien rellena el formulario, **el sistema hace solo lo que una persona tendría que hacer a mano**: apuntar el contacto, contestarle, avisar al responsable y acordarse de hacer seguimiento.

La web no solo captura el contacto: **enseña paso a paso lo que ocurre** (registro en la hoja, correos, aviso, cuenta atrás del seguimiento) para que cualquiera, sin conocimientos técnicos, entienda qué se automatiza.

> **Estado:** desplegada y probada de extremo a extremo con los cuatro casos (lead correcto, datos no válidos, Sheets caído y correo caído). Detalle en [Estado y límites](#estado-y-límites).

## Objetivo

Demostrar, con un caso real y completo, que sé:

- Diseñar un flujo de automatización con **n8n** que conecta varios servicios (webhook, Google Sheets, correo por SMTP, Telegram).
- Gestionar **errores de forma honesta**: reintentos, avisos y códigos HTTP que dicen la verdad al visitante.
- Tratar **datos personales** con criterio: consentimiento, minimización y anonimización automática.
- **Empaquetar y desplegar** una web estática con Docker (nginx), sin dejar secretos en el repositorio.

## Qué hay en el repositorio

| Ruta | Qué es |
|---|---|
| `index.html` | La web completa en un solo archivo (HTML, CSS y JavaScript). Sin dependencias ni recursos de terceros. |
| `Dockerfile` | Imagen `nginx:alpine` que sirve la web. Recibe como parámetros de construcción los datos del responsable de la política de privacidad. |
| `n8n/demo-leads-captura.json` | Flujo principal: formulario, registro, correos, aviso, segundo correo si nadie atiende el contacto y contador (31 nodos). |
| `n8n/demo-leads-limpieza.json` | Flujo programado: cada día anonimiza los datos personales de los contactos con más de 30 días. |
| `n8n/demo-leads-errores.json` | Flujo de seguridad: avisa por Telegram si otro flujo falla de forma no prevista. |
| `LICENSE` | Licencia (ver [Licencia](#licencia)). |

Los JSON son una **exportación sin secretos**: las credenciales se refieren por nombre y los datos propios de cada instalación (ID de la hoja, chat de Telegram, remitente de los correos) son marcadores `REEMPLAZAR_…`.

## Esquema del flujo

```
 Navegador                          n8n                                   Servicios
 ─────────                          ───                                   ─────────
 Formulario ──POST──►  1. Recibir formulario (webhook)
                       2. Validar y limpiar datos ──► datos no válidos, sin consentimiento
                          o correo temporal ──► responde 400
                       3. Registrar en Google Sheets ──► Google Sheets (hoja «Leads»)
                              │ falla ──► aviso por Telegram ──► responde 502
                       4. Email de confirmación ───────────────► Correo (SMTP)
                              │ falla ──► aviso por Telegram ──► responde 202
                       5. Responde 200 al formulario  (todo guardado y enviado)
                       6. Aviso por Telegram: nuevo lead ──────► Telegram
                       7. Espera el plazo (5 minutos en la demo; se configura)
                       8. Vuelve a leer la fila del lead ──────► Google Sheets
                              │ «Atendido» = Sí ──► anota «No hace falta» y no envía nada
                              │ vacío ──► aviso por Telegram («lleva X sin respuesta»)
                              │           ──► segundo email, con el siguiente paso ──► Correo (SMTP)
                              │           ──► anota «Enviado» en «Seguimiento»
                              │ falla cualquier paso ──► aviso por Telegram con la causa

 Contador:   GET /demo-count ──► lee la celda «Total» de la pestaña «Stats» ──► responde {total}

 Cada día 04:00 (flujo de limpieza):  lee «Leads» ──► elige los de más de 30 días
                                      ──► sustituye nombre, apellido, email y mensaje por «(borrado)»
                                      ──► resumen por Telegram

 Cualquier fallo no previsto en cualquier flujo ──► flujo de errores ──► aviso por Telegram
```

Decisiones de diseño que importan:

- **El visitante recibe el «ok» solo cuando el contacto está guardado y el primer correo enviado.** Si falla el registro, recibe un 502; si solo falla el correo, un 202 («guardado, pero sin email»).
- **Cada llamada a un servicio externo reintenta 3 veces (5 s entre intentos)** y, si sigue fallando, avisa por Telegram.
- **El segundo correo solo sale si nadie ha atendido el contacto.** Pasado el plazo, el flujo vuelve a leer la fila: si el negocio marcó «Sí» en `Atendido`, no se envía nada; si no, avisa al negocio por Telegram y manda al cliente su siguiente paso. El plazo es una constante (`PLAZO_MINUTOS`, 5 en la demo; un negocio real usaría, por ejemplo, 1440 = 24 h) y el texto y el número de correos se adaptan a lo que necesite la automatización de cada cliente.
- **La prueba del consentimiento queda guardada:** la casilla de la política se envía con el formulario y el flujo anota la fecha y hora en la columna `Consentimiento`; sin ella, responde 400.
- **Los correos temporales se rechazan con una lista corta de dominios desechables** (en el nodo de validación). Es orientativa: no caza todos, porque aparecen servicios nuevos cada semana. Un negocio real usaría además un servicio de verificación de correos.
- **Los datos que llegan al webhook no se fían:** se recortan, se valida el email (sin comas ni espacios, para no enviar a varias direcciones), se descarta el envío si el campo trampa `web` viene relleno, y se escapa el HTML antes de meterlo en correos y avisos.
- **Escritura `RAW` en Sheets:** una celda que empiece por `=` no se ejecuta como fórmula.
- **El contador no escribe nada:** la celda `Total` de la pestaña `Stats` es la fórmula `=COUNTA(Leads!A:A)-1`, así no hay condiciones de carrera.
- **El CORS del webhook está limitado al dominio de la demo.**
- **No se guardan las ejecuciones correctas** en n8n (`saveDataSuccessExecution: none`), para no acumular datos personales en su base de datos.

## Cómo reproducirlo

### Qué necesitas

- Una instancia de **n8n** accesible por HTTPS (los JSON se exportaron de una versión 2.x).
- Una cuenta de **Google** (para Sheets), un buzón con acceso **SMTP** (para los correos) y un **bot de Telegram** (con el ID de tu chat).
- **Docker**, o cualquier servidor web estático, para publicar `index.html`.

### 1. La hoja de cálculo

Crea una hoja de Google con dos pestañas:

- `Leads`, con estas columnas en la fila 1: `ID`, `Nombre`, `Apellido`, `Email`, `Mensaje`, `Fecha`, `Origen`, `Notas`, `Atendido`, `Seguimiento`, `Consentimiento`. En `Atendido`, pon una **lista desplegable con una sola opción, «Sí»** (Datos → Validación de datos): el negocio la elige al contestar al contacto. No uses casillas: una casilla vacía guarda «FALSE» y hace que n8n añada las filas nuevas al final de la hoja, lejos de las demás. `Seguimiento` y `Consentimiento` los rellena el flujo.
- `Stats`, con las columnas `ID` y `Total`. En la fila con `ID = 1`, pon en `Total` la fórmula `=COUNTA(Leads!A:A)-1`. Si la dejas vacía, el contador se queda en 0.

### 2. Credenciales en n8n

Crea estas tres con exactamente estos nombres (así los nodos las encuentran):

| Nombre | Tipo | Notas |
|---|---|---|
| `Google Sheets - cuenta de servicio` | Google Service Account API | Crea una cuenta de servicio en Google Cloud y comparte la hoja con su email como *editor*. |
| `SMTP - Postale demo-leads` | SMTP | Servidor, usuario y contraseña de tu proveedor de correo (puerto 465 con SSL/TLS). No caduca, a diferencia de una autorización OAuth de Google en modo *Testing*. Usa el nombre que quieras, pero elígela en los dos nodos de envío. |
| `Telegram - bot demo-leads` | Telegram API | Token del bot creado con BotFather. |

Las claves van **solo** al gestor de credenciales de n8n (y a tu gestor de contraseñas). Nunca a un archivo del repositorio.

### 3. Importar los flujos

1. Importa los tres JSON de `n8n/`.
2. En cada nodo, sustituye `REEMPLAZAR_ID_HOJA_GOOGLE_SHEETS` por el ID de tu hoja, `REEMPLAZAR_CHAT_ID_TELEGRAM` por tu chat y `REEMPLAZAR_EMAIL_REMITENTE` por la dirección desde la que enviarás los correos (en los dos nodos de envío).
3. **Abre cada nodo que use credenciales y elige la tuya**: el ID de credencial del JSON es un marcador.
4. Publica `Demo Leads - Alerta de errores` y, en los ajustes del flujo principal **y** del de limpieza, selecciónalo en *Error workflow*.
5. Publica `Demo Leads - Limpieza de datos personales`. Si no se publica, no se ejecuta, y lo que la web promete sobre los 30 días dejaría de ser cierto.
6. Publica `Demo Leads - Captura y seguimiento`.

### 4. La web

1. En el script de `index.html`, ajusta `URL_ENVIO`, `URL_CONTADOR` y `URL_DEMO` a tus direcciones (o pasa `N8N_BASE_URL` al construir, ver abajo), y el dominio permitido (CORS) en los nodos «Recibir formulario» y «Recibir petición del contador».
2. Construye y ejecuta la imagen:

```bash
docker build \
  --build-arg RESPONSABLE_NOMBRE="Tu Nombre" \
  --build-arg CONTACTO_EMAIL="contacto@tudominio.com" \
  --build-arg N8N_BASE_URL="https://n8n.tudominio.com" \
  -t demo-leads .
docker run --rm -p 8080:80 demo-leads
```

Los dos primeros parámetros rellenan el responsable y el contacto de la política de privacidad **al construir la imagen**, de modo que tus datos personales no se guardan en git. Si los dejas vacíos, la web conserva los marcadores amarillos y no muestra el botón de contacto. `N8N_BASE_URL` (opcional, sin barra final) cambia la dirección de n8n que trae `index.html`, útil para probar con una dirección provisional sin tocar el código.

### 5. Probar la web sin n8n

```bash
python3 -m http.server 8080      # abre http://localhost:8080
```

En `localhost`, `127.0.0.1` o abierta como archivo, **la web simula al servidor** y muestra un aviso amarillo. Puedes forzar cada respuesta con `?simular=200 | 202 | 400 | 400-trampa | 400-temporal | 502 | 429 | 500 | timeout | red`. Añade `&rapido` para acortar la cuenta atrás de 5 minutos a 10 segundos. En cualquier otro dominio estos parámetros se ignoran.

## Estado y límites

Qué se ha comprobado y qué no:

- ✅ Web probada en simulación con todos los estados de respuesta (200, 202, 400, 502, 429, otros, tiempo agotado y sin conexión), sin errores en consola, sin desbordes entre 320 y 1600 px de ancho, y con contraste de texto de al menos 4,5:1.
- ✅ Flujos validados con el validador del SDK de n8n; el código de validación ejecutado con entradas maliciosas (varios destinatarios, HTML, fórmulas, campo trampa, cuerpo vacío); la lógica de limpieza ejecutada con filas simuladas.
- ✅ **Probado de extremo a extremo** con la web desplegada contra el n8n real: lead correcto (fila en la hoja, correo de confirmación, aviso por Telegram y segundo correo a los 5 minutos), datos no válidos (tres casos con código 400), Google Sheets caído (la web lo dice con honestidad, no se guarda nada y llega una alerta) y correo caído (el lead queda guardado, la web avisa de que no se pudo enviar el correo y llega una alerta).
- ✅ CORS comprobado con `curl`: responde solo al origen de la web. Límite de peticiones por IP comprobado en el proxy inverso.
- ❌ No se ha probado con lector de pantalla, Safari ni Firefox.

Limitaciones conocidas:

- La lista de correos desechables no es exhaustiva: un correo temporal de un servicio que no esté en ella se acepta.
- El plazo del segundo correo se espera dentro de n8n (nodo *Wait*). Para plazos largos (24 h) funciona, pero con mucho volumen sería más robusto un flujo programado que revise la hoja cada pocos minutos.
- La limitación de peticiones por IP no se puede hacer dentro de n8n; va en el proxy inverso del servidor (en esta instalación, Traefik con un middleware `rateLimit` sobre los dos webhooks).
- El historial de versiones de Google Sheets puede conservar valores antiguos tras la anonimización. Telegram conserva los avisos (con nombre, email y las primeras palabras del mensaje).
- La limpieza lee la fecha como texto `dd/mm/aaaa, hh:mm:ss`: si se cambia ese formato en el flujo principal, hay que cambiar el patrón del nodo «Elegir leads de más de 30 días».
- Si Telegram falla en el aviso o en la lectura del total, nadie se entera: se acepta, porque si Telegram está caído, las alertas tampoco llegarían.
- La política de privacidad de la web es una plantilla razonable, **no asesoramiento legal**: revísala antes de usarla en un proyecto real.

## Lo que he aprendido

- **Una autorización de Google en modo *Testing* caduca a los 7 días.** El flujo original dejó de funcionar por eso, sin que nadie se enterara. Solución: cuenta de servicio para Sheets y SMTP para el correo, en lugar de Gmail con OAuth.
- **Un secreto en una URL es un secreto en el JSON.** El token de Telegram estaba escrito en un HTTP Request. Lo correcto es el nodo nativo y una credencial de n8n: el JSON se puede exportar y publicar sin riesgo.
- **Responder «ok» antes de hacer el trabajo es mentir.** Ahora el código HTTP refleja lo que pasó de verdad, y cada fallo previsto avisa.
- **Todo lo que llega a un webhook público es hostil hasta que se demuestra lo contrario:** validar, recortar, escapar y poner un campo trampa.
- **Lo que prometes sobre datos personales tiene que ser verdad.** El correo decía que los datos no se guardaban; era falso. Ahora el texto lo respalda un flujo que anonimiza a los 30 días.
- **Antes de publicar un repositorio hay que mirar también su historial**, no solo los archivos actuales: ahí es donde se quedan las direcciones y las claves olvidadas.
- **Si dos sitios guardan el mismo texto, se desincronizan.** Los correos están en el flujo y en la vista previa de la web: si se cambia uno, hay que cambiar el otro.

## Licencia

[PolyForm Noncommercial 1.0.0](LICENSE). Puedes ver el código, copiarlo, modificarlo, replicarlo y compartirlo **con fines no comerciales** (aprender, probar, proyectos personales, centros educativos…), conservando el aviso de copyright y la licencia. **No** puedes usarlo con fines comerciales sin mi permiso.

© 2026 Vicente Rueda Gómez — [github.com/vicente-rueda](https://github.com/vicente-rueda)
