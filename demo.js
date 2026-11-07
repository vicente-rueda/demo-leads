/* Comportamiento de la demo (antes dentro de index.html). */
(function () {
  'use strict';

  /* ── Configuración: lo único que cambia al desplegar en el VPS nuevo ── */
  const URL_ENVIO        = 'https://n8n.vicenterueda.com/webhook/demo-leads';
  const URL_CONTADOR     = 'https://n8n.vicenterueda.com/webhook/demo-count';
  const MAX_MENSAJE      = 400;
  const TIMEOUT_ENVIO_MS = 45000; // el flujo reintenta 3 × 5 s cada llamada externa
  const TIMEOUT_CONT_MS  = 8000;
  const URL_DEMO         = 'https://demo-leads.vicenterueda.com';
  const CONTACTO_EMAIL   = ''; // se rellena al decidir qué email publicar; vacío = el botón de contacto se oculta
  const MS_ENTRE_PASOS   = 1500; // el resultado se enseña de uno en uno

  /* ── Modo simulación: SOLO en local (localhost, 127.0.0.1 o archivo abierto).
        En el dominio real se ignora aunque alguien escriba ?simular=… ── */
  const EN_LOCAL  = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  const MODO_SIM  = EN_LOCAL ? (new URLSearchParams(location.search).get('simular') || '200') : null;
  const SIMULANDO = MODO_SIM !== null && MODO_SIM !== 'real';
  const RAPIDO    = EN_LOCAL && new URLSearchParams(location.search).has('rapido'); // cuenta atrás de 10 s para probar
  const SEGUNDOS_SEGUIMIENTO = RAPIDO ? 10 : 300;

  /* ── Textos de error ── */
  const MSG = {
    red:          'No hemos podido conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.',
    timeout:      'El servidor está tardando más de lo normal. Es posible que tu solicitud sí se haya registrado: revisa tu correo antes de volver a intentarlo.',
    guardado:     'No hemos podido registrar tu solicitud. No se ha guardado nada ni se ha enviado ningún correo. Inténtalo de nuevo en unos minutos.',
    rechazada:    'No hemos podido aceptar el envío. Recarga la página e inténtalo de nuevo.',
    revisa:       'Revisa los datos del formulario.',
    demasiadas:   'Has hecho demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.',
    noDisponible: 'El servicio no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
    email:        'El email no parece válido. Revisa que no tenga espacios ni comas.',
    consentimiento: 'Necesitamos que aceptes la política de privacidad para poder hacer la demo.'
  };

  const $ = (id) => document.getElementById(id);
  const mostrar = (el, si) => el.classList.toggle('oculto', !si);
  const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const suave = () => (reducido() ? 'auto' : 'smooth');

  const form          = $('leadForm');
  const btnEnviar     = $('btnEnviar');
  const spinner       = $('spinner');
  const btnTexto      = $('btnTexto');
  const textoBoton    = btnTexto.textContent;
  const errorGeneral  = $('errorGeneral');
  const mensaje       = $('mensaje');
  const contadorMsg   = $('contadorMensaje');
  let enviando = false;
  let totalPersonas = null; // null = el contador no está disponible

  /* Icono de línea del sprite de arriba */
  function icono(nombre) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icono');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#i-' + nombre);
    svg.append(use);
    return svg;
  }

  /* ═══ Recorrido: los 5 pasos ═══
     Escena (si cabe en la pantalla y sin «reducir movimiento»): la zona queda fija y el paso que se ve depende de cuánto has bajado.
     Si no cabe: uno debajo de otro, cada uno aparece al llegar y la lista fija enciende el que cruza el centro. */
  (function recorrido() {
    const rec = $('recorrido');
    const pasos = [...rec.querySelectorAll('.r-paso')];
    const nav = [...rec.querySelectorAll('.r-progreso li')];
    let activo = -1, enEscena = false, pendiente = false;

    function marcar(i) {
      if (i === activo) return;
      activo = i;
      pasos.forEach((p, j) => { p.classList.toggle('activo', j === i); p.classList.toggle('pasado', j < i); });
      nav.forEach((li, j) => { li.classList.toggle('hecho', j < i); li.classList.toggle('activo', j === i); });
    }
    function segunScroll() {
      pendiente = false;
      if (!enEscena) return;
      const r = rec.getBoundingClientRect();
      const arriba = parseFloat(rec.style.getPropertyValue('--arriba')) || 0;
      const fijo = r.height - rec.querySelector('.escenario').offsetHeight; // tramo de scroll en el que la zona está fija
      const avance = Math.min(Math.max((arriba - r.top) / fijo, 0), 0.999);
      marcar(Math.floor(avance * pasos.length));
    }
    function decidir() {
      rec.classList.add('escena');
      const alto = rec.querySelector('.escenario').offsetHeight; // con los pasos apilados mide el más alto
      enEscena = !reducido() && alto <= innerHeight - 48;
      rec.classList.toggle('escena', enEscena);
      const banner = document.body.classList.contains('con-banner') ? $('bannerSim').offsetHeight : 0;
      const arriba = Math.max(banner, (innerHeight - alto + banner) / 2);
      rec.style.setProperty('--arriba', arriba + 'px');
      rec.querySelectorAll('.ancla').forEach((a) => a.remove());
      if (enEscena) { // un imán por paso, justo donde ese paso se ve centrado
        const fijo = rec.offsetHeight - rec.querySelector('.escenario').offsetHeight;
        pasos.forEach((_, i) => {
          const a = document.createElement('div');
          a.className = 'ancla'; a.setAttribute('aria-hidden', 'true');
          a.style.top = ((i + 0.5) / pasos.length * fijo - arriba) + 'px';
          rec.append(a);
        });
      }
      activo = -1;
      if (enEscena) segunScroll(); else marcar(0);
    }

    addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(segunScroll); } }, { passive: true });
    let espera = null;
    addEventListener('resize', () => { clearTimeout(espera); espera = setTimeout(decidir, 200); });

    /* En la escena, los enlaces de la lista llevan al tramo de scroll de cada paso */
    nav.forEach((li, i) => li.querySelector('a').addEventListener('click', (e) => {
      if (!enEscena) return;
      e.preventDefault();
      const r = rec.getBoundingClientRect();
      const arriba = parseFloat(rec.style.getPropertyValue('--arriba')) || 0;
      const fijo = r.height - rec.querySelector('.escenario').offsetHeight;
      scrollTo({ top: scrollY + r.top - arriba + (i + 0.5) / pasos.length * fijo, behavior: suave() });
    }));

    /* Sin escena */
    if ('IntersectionObserver' in window) {
      if (!reducido()) rec.classList.add('con-movimiento');
      const aparecer = new IntersectionObserver((entradas) => entradas.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('visto'); aparecer.unobserve(e.target); }
      }), { threshold: 0.15 });
      const enCentro = new IntersectionObserver((entradas) => entradas.forEach((e) => {
        if (e.isIntersecting && !enEscena) marcar(pasos.indexOf(e.target));
      }), { rootMargin: '-45% 0px -45% 0px' });
      pasos.forEach((p) => { aparecer.observe(p); enCentro.observe(p); });
    } else pasos.forEach((p) => p.classList.add('visto'));

    decidir();
  })();

  /* ═══ Contador de personas (prueba social) ═══ */
  function pintarContador() {
    if (totalPersonas === null || totalPersonas < 1) { mostrar($('pruebaSocial'), false); return; }
    $('contadorPersonas').textContent = totalPersonas === 1 ? '1 persona' : totalPersonas.toLocaleString('es-ES') + ' personas';
    $('textoContador').textContent = totalPersonas === 1 ? 'lo ha probado' : 'lo han probado';
    mostrar($('pruebaSocial'), true);
  }

  async function cargarContador() {
    if (SIMULANDO) { totalPersonas = 128; pintarContador(); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_CONT_MS);
    try {
      const r = await fetch(URL_CONTADOR, { signal: ctrl.signal });
      if (!r.ok) throw new Error('contador ' + r.status);
      const n = Number((await r.json()).total);
      totalPersonas = Number.isFinite(n) ? n : null;
    } catch (_) {
      totalPersonas = null; // sin contador no se muestra nada: mejor que un "—" o un 0
    } finally { clearTimeout(t); }
    pintarContador();
  }

  /* ═══ Contador de caracteres del mensaje ═══ */
  function actualizarContadorMsg() {
    const quedan = MAX_MENSAJE - mensaje.value.length;
    contadorMsg.textContent = quedan + ' caracteres disponibles';
    contadorMsg.className = 'contador-msg' + (quedan < 40 ? ' peligro' : quedan < 100 ? ' aviso' : '');
  }
  mensaje.addEventListener('input', actualizarContadorMsg);

  /* ═══ Validación en el navegador (misma regla de email que el flujo de n8n) ═══ */
  const RE_EMAIL = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']{2,}$/;
  const CAMPOS = { nombre: 'nombre', email: 'email', consentimiento: 'consentimiento' };

  function leerValores() {
    return {
      nombre:   form.nombre.value.trim(),
      apellido: form.apellido.value.trim(),
      email:    form.email.value.trim(),
      mensaje:  form.mensaje.value.trim(),
      consentimiento: $('consentimiento').checked
    };
  }

  function validar(v) {
    const e = {};
    if (!v.nombre) e.nombre = 'Escribe tu nombre.';
    if (!v.email) e.email = 'Escribe tu email.';
    else if (!RE_EMAIL.test(v.email.toLowerCase())) e.email = MSG.email;
    if (!v.consentimiento) e.consentimiento = MSG.consentimiento;
    return e;
  }

  function limpiarErrores() {
    mostrar(errorGeneral, false);
    errorGeneral.replaceChildren();
    Object.keys(CAMPOS).forEach((c) => {
      mostrar($('error-' + c), false);
      $('error-' + c).textContent = '';
      $(c).removeAttribute('aria-invalid');
      $(c).removeAttribute('aria-describedby');
    });
  }

  function mostrarErroresCampo(errores, enfocar) {
    let primero = null;
    Object.keys(CAMPOS).forEach((c) => {
      if (!errores[c]) return;
      $('error-' + c).textContent = errores[c];
      mostrar($('error-' + c), true);
      $(c).setAttribute('aria-invalid', 'true');
      $(c).setAttribute('aria-describedby', 'error-' + c);
      if (!primero) primero = $(c);
    });
    if (primero && enfocar) { primero.scrollIntoView({ behavior: suave(), block: 'center' }); primero.focus({ preventScroll: true }); }
  }

  function mostrarErrorGeneral(texto) {
    errorGeneral.replaceChildren(icono('alerta'), el('span', '', texto));
    mostrar(errorGeneral, true);
    errorGeneral.scrollIntoView({ behavior: suave(), block: 'center' });
    errorGeneral.focus({ preventScroll: true });
  }

  /* El 400 trae details: ['El nombre es obligatorio.', 'El email no es válido.', 'Solicitud rechazada.'] */
  function mostrarErroresServidor(json) {
    const detalles = Array.isArray(json && json.details) ? json.details.map(String) : [];
    const porCampo = {};
    let rechazada = false;
    const otros = [];
    detalles.forEach((d) => {
      if (/^el nombre/i.test(d)) porCampo.nombre = d;
      else if (/^el email/i.test(d)) porCampo.email = d;
      else if (/rechazada/i.test(d)) rechazada = true;
      else otros.push(d);
    });
    const hayCampo = Object.keys(porCampo).length > 0;
    if (hayCampo) mostrarErroresCampo(porCampo, !rechazada && !otros.length);
    if (rechazada) mostrarErrorGeneral(MSG.rechazada);
    else if (otros.length) mostrarErrorGeneral(otros.join(' '));
    else if (!hayCampo) mostrarErrorGeneral(MSG.revisa);
  }

  /* ═══ Simulación de las respuestas del flujo (solo local) ═══ */
  function simular(modo, datos) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const id = 'LEAD-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5);
        const nombre = String(datos.get('nombre') || ''), email = String(datos.get('email') || '').toLowerCase();
        if (datos.get('web')) return resolve({ status: 400, json: { error: 'validation_error', message: MSG.revisa, details: ['Solicitud rechazada.'] } });
        switch (modo) {
          case '202':          return resolve({ status: 202, json: { status: 'registered', emailSent: false, id, message: 'Tu solicitud está registrada, pero no hemos podido enviar el email de confirmación.' } });
          case '400':          return resolve({ status: 400, json: { error: 'validation_error', message: MSG.revisa, details: ['El nombre es obligatorio.', 'El email no es válido.'] } });
          case '400-trampa':   return resolve({ status: 400, json: { error: 'validation_error', message: MSG.revisa, details: ['Solicitud rechazada.'] } });
          case '400-temporal': return resolve({ status: 400, json: { error: 'validation_error', message: MSG.revisa, details: ['El email parece temporal o desechable. Usa uno que consultes habitualmente.'] } });
          case '502':          return resolve({ status: 502, json: { error: 'upstream_error', message: MSG.guardado } });
          case '429':          return resolve({ status: 429, json: null });
          case '500':          return resolve({ status: 500, json: null });
          case 'timeout':      return reject(Object.assign(new Error('timeout'), { name: 'AbortError' }));
          case 'red':          return reject(new TypeError('Failed to fetch'));
          default:             return resolve({ status: 200, json: { status: 'ok', emailSent: true, id, nombre, email } });
        }
      }, 1200);
    });
  }

  async function enviarAlServidor(datos) {
    if (SIMULANDO) return simular(MODO_SIM, datos);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_ENVIO_MS);
    try {
      const r = await fetch(URL_ENVIO, { method: 'POST', body: datos, signal: ctrl.signal });
      let json = null;
      try { json = await r.json(); } catch (_) { /* un 502/504 de un proxy no trae JSON */ }
      return { status: r.status, json };
    } finally { clearTimeout(t); }
  }

  /* ═══ Qué hacer con cada respuesta ═══ */
  function manejarRespuesta(status, json, v) {
    if (status === 200 || status === 202) {
      const j = json || {};
      if (totalPersonas !== null) { totalPersonas += 1; pintarContador(); } // en ambos casos el lead quedó guardado
      mostrarResultado({
        tipo: status === 200 ? 'ok' : 'sinEmail',
        id: j.id || null,
        nombre: j.nombre || v.nombre,
        apellido: v.apellido,
        email: j.email || v.email.toLowerCase(), // el servidor guarda el email en minúsculas
        mensaje: v.mensaje,
        fecha: new Date()
      });
      return;
    }
    if (status === 400) return mostrarErroresServidor(json);
    if (status === 502) return mostrarErrorGeneral(MSG.guardado);
    if (status === 429) return mostrarErrorGeneral(MSG.demasiadas);
    mostrarErrorGeneral(MSG.noDisponible);
  }

  function estadoEnvio(activo) {
    btnEnviar.disabled = activo;
    spinner.style.display = activo ? 'block' : 'none';
    btnTexto.textContent = activo ? 'Enviando…' : textoBoton;
    mostrar($('estadoEnvio'), activo);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    limpiarErrores();

    const v = leerValores();
    const errores = validar(v);
    if (Object.keys(errores).length) { mostrarErroresCampo(errores, true); return; }

    enviando = true;
    estadoEnvio(true);
    try {
      const datos = new FormData(form); // incluye el campo trampa "web" y "origen"
      ['nombre', 'apellido', 'email', 'mensaje'].forEach((k) => datos.set(k, v[k]));
      const { status, json } = await enviarAlServidor(datos);
      manejarRespuesta(status, json, v);
    } catch (err) {
      mostrarErrorGeneral(err && err.name === 'AbortError' ? MSG.timeout : MSG.red);
    } finally {
      enviando = false;
      estadoEnvio(false);
    }
  });

  /* ═══ Resultado: los 5 pasos con los datos reales del visitante, de uno en uno ═══ */
  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }
  const FECHA_FMT = { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const HORA_FMT  = { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' };
  const ESTADOS = {
    hecho:     { icono: 'check',  texto: 'Hecho' },
    espera:    { icono: 'reloj',  texto: 'En espera' },
    fallo:     { icono: 'alerta', texto: 'Ha fallado' },
    apagado:   { icono: 'pausa',  texto: 'En pausa' },
    pendiente: { icono: 'reloj',  texto: 'Pendiente' }
  };
  const panelInicial = $('panelLista').cloneNode(true); // para volver a empezar
  let temporizador = null;
  let revelados = [];

  /* Pone un paso en su estado: color del nodo + icono + texto */
  function ponerEstado(li, estado) {
    li.dataset.estado = estado;
    li.classList.remove('hecho', 'espera', 'fallo', 'apagado', 'pendiente');
    li.classList.add(estado);
    const e = ESTADOS[estado];
    li.querySelector('.nodo').replaceChildren(estado === 'pendiente' ? li.dataset.numero : icono(e.icono));
    li.querySelector('.estado-paso').replaceChildren(icono(e.icono), e.texto);
  }

  /* Un paso del resultado: llega «pendiente» y se enciende con su estado final al revelarse */
  function paso(numero, estado, titulo, texto, extra) {
    const li = el('li', 'paso esperando');
    li.dataset.numero = String(numero);
    li.dataset.final = estado;
    const nodo = el('div', 'nodo');
    nodo.setAttribute('aria-hidden', 'true');
    const tx = el('div', 'res-texto');
    const fila = el('div', 'res-fila');
    fila.append(el('h3', '', titulo), el('span', 'estado-paso'));
    tx.append(fila, el('p', '', texto));
    if (extra) { const ex = el('div', 'res-extra'); ex.append(extra); tx.append(ex); }
    li.append(nodo, tx);
    ponerEstado(li, 'pendiente');
    return li;
  }

  function revelar(li) {
    li.classList.remove('esperando');
    li.classList.add('visible');
    ponerEstado(li, li.dataset.final);
    if (!reducido()) li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function vistaHoja(r) {
    const caja = el('div');
    const hoja = el('div', 'pieza hoja');
    const barra = el('div', 'pieza-barra');
    barra.append(icono('hoja'), 'Google Sheets · pestaña «Leads»');
    const scroll = el('div', 'hoja-scroll');
    scroll.tabIndex = 0; // se puede desplazar con el teclado si no cabe
    scroll.setAttribute('aria-label', 'Fila nueva en Google Sheets');
    const tabla = el('table');
    const cab = el('tr');
    ['ID', 'Nombre', 'Apellido', 'Email', 'Mensaje', 'Fecha', 'Origen'].forEach((t) => cab.append(el('th', '', t)));
    const previas = el('tr', 'previas');
    const prev = el('td', '', 'registros anteriores…'); prev.colSpan = 7; previas.append(prev);
    const nueva = el('tr', 'fila-nueva');
    [r.id || '—', r.nombre, r.apellido || '—', r.email, r.mensaje || '—', r.fecha.toLocaleString('es-ES', FECHA_FMT), 'web-form-demo']
      .forEach((t) => { const td = el('td', '', t); td.title = t; nueva.append(td); });
    const thead = el('thead'); thead.append(cab);
    const tbody = el('tbody'); tbody.append(previas, nueva);
    tabla.append(thead, tbody); scroll.append(tabla); hoja.append(barra, scroll); caja.append(hoja);
    caja.append(el('p', 'nota-pie', 'La hora de la fila real puede ir unos segundos por detrás: si un servicio tarda en contestar, el sistema lo reintenta.'));
    return caja;
  }

  /* Los textos son los mismos que envía el flujo de n8n (salvo el pie con el aviso de datos, que aquí se omite): si cambias uno, cambia el otro */
  function vistaCorreo(r, numero) {
    const primero = numero === 1;
    const caja = el('div');
    const t = el('div', 'pieza');
    const barra = el('div', 'pieza-barra');
    barra.append(icono('correo'), 'Correo · bandeja de entrada');
    const cab = el('div', 'correo-cab');
    const dl = el('dl');
    dl.append(el('dt', '', 'De'), el('dd', '', 'Equipo de Atención al Cliente'), el('dt', '', 'Para'), el('dd', '', r.email));
    cab.append(dl, el('p', 'asunto', primero ? 'Hemos recibido tu solicitud' : 'Sobre tu solicitud: cómo seguimos'));
    const cuerpo = el('div', 'pieza-cuerpo');
    const hola = el('p'); hola.append('Hola ', el('strong', '', r.nombre), ',');
    cuerpo.append(hola);
    if (primero) {
      cuerpo.append(
        el('p', '', 'Gracias por ponerte en contacto con nosotros. Hemos recibido tu solicitud y ya la tenemos registrada.'),
        el('p', '', 'Nos pondremos en contacto contigo a la mayor brevedad posible.'));
    } else {
      const cita = r.mensaje ? ' («' + (r.mensaje.length > 80 ? r.mensaje.slice(0, 80) + '...' : r.mensaje) + '»)' : '';
      const paso2 = el('p');
      paso2.append(el('strong', '', 'Responde a este correo con el día y la franja en que prefieres que te llamemos'), ' (por ejemplo, «jueves por la mañana»). Con eso reservamos 15 minutos para revisar tu caso y proponerte una solución concreta.');
      cuerpo.append(
        el('p', '', 'Hace 5 minutos recibimos tu solicitud' + cita + ' y no queremos que te quedes esperando. Todavía no hemos podido contestarte en persona, así que te dejamos ya el siguiente paso.'),
        paso2);
    }
    const firma = el('p'); firma.append('Un saludo, ', el('strong', '', 'Equipo de Atención al Cliente'));
    cuerpo.append(firma);
    if (!primero) {
      const nota = el('div', 'nota-demo');
      const np = el('p'); np.append(el('strong', '', 'Sobre esta demo: '), 'este correo lo ha enviado el sistema solo: pasaron 5 minutos y nadie había marcado tu solicitud como atendida en la hoja. Si alguien la hubiera marcado, no habrías recibido nada, porque una persona ya te habría contestado. El plazo (aquí, 5 minutos; en un negocio real puede ser, por ejemplo, 24 horas), el texto y el número de correos se adaptan a lo que necesite la automatización de cada cliente.');
      nota.append(np);
      cuerpo.append(nota);
    }
    t.append(barra, cab, cuerpo);
    caja.append(t, el('p', 'nota-pie', 'El correo real termina con un aviso sobre el tratamiento de tus datos.'));
    return caja;
  }

  function vistaTelegram(r) {
    const t = el('div', 'pieza');
    const cab = el('div', 'tg-cab');
    const nombreBot = el('span', '', 'Demo Leads'); nombreBot.append(el('small', '', 'bot de Telegram'));
    cab.append(el('span', 'tg-avatar', 'DL'), nombreBot);
    const b = el('div', 'tg-burbuja');
    const l = (txt) => el('span', 'linea', txt);
    const nombreCompleto = r.nombre + (r.apellido ? ' ' + r.apellido : '');
    const msg = r.mensaje.length > 80 ? r.mensaje.slice(0, 80) + '...' : r.mensaje;
    b.append(
      el('strong', 'linea', '🔔 [Demo Leads] — Nuevo lead recibido'),
      l('👤 Nombre: ' + nombreCompleto),
      l('📧 Email: ' + r.email),
      l('💬 Mensaje: ' + (msg || '—')),
      l('🕐 Hora: ' + r.fecha.toLocaleString('es-ES', FECHA_FMT)),
      l('🆔 ID: ' + (r.id || '—')),
      el('span', 'tg-hora', r.fecha.toLocaleTimeString('es-ES', HORA_FMT)));
    t.append(cab, b);
    return t;
  }

  function cuentaAtras(li, alTerminar) {
    const box = el('div', 'cuenta');
    box.setAttribute('role', 'timer');
    const etiqueta = el('span', '', 'Segundo correo en');
    const tiempo = el('span', 'tiempo');
    box.append(etiqueta, tiempo);
    const fin = Date.now() + SEGUNDOS_SEGUIMIENTO * 1000; // con la hora real: si la pestaña se pausa, no se desfasa
    function tick() {
      const quedan = Math.max(0, Math.round((fin - Date.now()) / 1000));
      if (quedan === 0) {
        clearInterval(temporizador); temporizador = null;
        box.classList.add('hecha'); etiqueta.remove();
        tiempo.replaceChildren(icono('check'), 'Ya debería estar en tu bandeja de entrada');
        li.dataset.final = 'hecho';
        if (!li.classList.contains('esperando')) ponerEstado(li, 'hecho');
        if (alTerminar) alTerminar();
        return;
      }
      tiempo.textContent = Math.floor(quedan / 60) + ':' + String(quedan % 60).padStart(2, '0');
    }
    tick();
    temporizador = setInterval(tick, 1000);
    return box;
  }

  function pararTiempos() {
    clearInterval(temporizador); temporizador = null;
    revelados.forEach(clearTimeout); revelados = [];
  }

  function mostrarResultado(r) {
    form.reset(); // los datos del visitante no se quedan en el formulario
    actualizarContadorMsg();
    pararTiempos();
    const ok = r.tipo === 'ok';

    /* Izquierda: el formulario deja sitio al aviso y al cierre */
    const enviado = $('enviado');
    const aviso = el('div', 'aviso ' + (ok ? 'correcto' : 'parcial'));
    aviso.append(icono(ok ? 'check' : 'alerta'), el('b', '', ok ? 'Enviado. Mira cómo avanza, paso a paso.' : 'Guardado, pero no hemos podido enviarte el correo.'));
    const resumen = el('p');
    if (ok) resumen.append(el('strong', '', 'Con cada contacto nuevo pasa lo mismo, a cualquier hora y sin que nadie intervenga.'));
    else resumen.append(el('strong', '', 'Un sistema bien hecho avisa de cada fallo. '), 'En esta demo, el responsable recibe un aviso para poder resolverlo.');
    const pregunta = el('p', 'res-pregunta', '¿Cuánto tiempo pierde tu negocio en tareas así? Cuéntanos tu caso y vemos qué se puede automatizar.');
    const botones = el('div', 'res-botones');
    if (CONTACTO_EMAIL) {
      const a = el('a', 'btn-primario', 'Quiero saber más');
      a.href = 'mailto:' + CONTACTO_EMAIL + '?subject=' + encodeURIComponent('Quiero automatizar mis leads');
      a.style.width = 'auto'; a.style.marginTop = '0';
      botones.append(a);
    }
    const compartir = el('button', 'btn-secundario'); compartir.type = 'button';
    compartir.append(icono('enlace'), el('span', '', 'Compartir esta demo'));
    compartir.addEventListener('click', () => compartirDemo(compartir.lastChild));
    const otra = el('button', 'btn-secundario', '← Probar con otro email'); otra.type = 'button';
    otra.addEventListener('click', reiniciar);
    botones.append(compartir, otra);
    enviado.replaceChildren(aviso, resumen, pregunta, botones);
    mostrar(form, false); mostrar($('notaObligatorios'), false);
    mostrar(enviado, true);

    /* Derecha: los 5 pasos, con lo que ha pasado de verdad */
    $('t-panel').textContent = ok ? 'Tu demo en marcha' : 'Guardado, pero con un fallo';
    $('panelIntro').textContent = ok ? 'Cada paso se enciende cuando le toca, de uno en uno.' : 'Esto es lo que ha pasado con tu solicitud, paso a paso.';
    const nombreCompleto = r.nombre + (r.apellido ? ' ' + r.apellido : '');
    const lista = el('ol', 'flujo');
    lista.id = 'panelLista';
    lista.append(
      paso(1, 'hecho', 'Recibido desde tu web', nombreCompleto + ' · ' + r.email),
      paso(2, 'hecho', 'Registrado en Google Sheets', 'Una fila nueva en la pestaña «Leads»' + (r.id ? ' (ID: ' + r.id + ').' : '.'), vistaHoja(r)));
    if (ok) {
      lista.append(
        paso(3, 'hecho', 'Respuesta enviada', 'Un correo a ' + r.email + ', en segundos. Si no lo ves, mira en la carpeta de spam.', vistaCorreo(r, 1)),
        paso(4, 'hecho', 'Aviso en el móvil del negocio', 'Quien gestiona el negocio recibe tus datos por Telegram, al momento.', vistaTelegram(r)));
      const ex = el('div');
      const li5 = paso(5, 'espera', 'Segundo correo si nadie contesta',
        'Pasado el plazo, el sistema mira en Google Sheets si alguien marcó tu solicitud como atendida. Si nadie lo hizo, avisa al negocio por Telegram y te envía este correo, con el asunto «Sobre tu solicitud: cómo seguimos». En la demo el plazo son 5 minutos y nadie lo marca, así que llega a ' + r.email + ', aunque cierres esta página. En un negocio real, el plazo y el texto se adaptan a cada caso (por ejemplo, 24 horas).', ex);
      ex.append(cuentaAtras(li5, () => { // al llegar a cero se muestra lo que dice el segundo correo
        const correo2 = vistaCorreo(r, 2); correo2.classList.add('aparece'); ex.append(correo2);
      }));
      lista.append(li5);
    } else {
      lista.append(
        paso(3, 'fallo', 'No se pudo enviar la respuesta', 'No hemos podido enviar el correo a ' + r.email + '. El responsable ya ha recibido un aviso con la causa.'),
        paso(4, 'apagado', 'Aviso en el móvil del negocio', 'En pausa: el sistema se detiene si falla el primer correo.'),
        paso(5, 'apagado', 'Segundo correo si nadie contesta', 'En pausa: el sistema se detiene si falla el primer correo.'));
    }
    $('panelLista').replaceWith(lista);

    const panel = $('panel');
    panel.scrollIntoView({ behavior: suave(), block: 'start' });
    $('t-panel').focus({ preventScroll: true });

    /* Los pasos se encienden de uno en uno */
    const pasos = lista.querySelectorAll('.paso');
    if (reducido()) { pasos.forEach(revelar); return; }
    pasos.forEach((li, i) => revelados.push(setTimeout(() => revelar(li), 600 + i * MS_ENTRE_PASOS)));
  }

  function compartirDemo(texto) {
    const original = texto.textContent;
    const aviso = (t) => { texto.textContent = t; setTimeout(() => { texto.textContent = original; }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(URL_DEMO).then(() => aviso('Enlace copiado'), () => aviso(URL_DEMO));
    } else aviso(URL_DEMO);
  }

  function reiniciar() {
    pararTiempos();
    limpiarErrores();
    mostrar($('enviado'), false);
    mostrar(form, true); mostrar($('notaObligatorios'), true);
    $('t-panel').textContent = 'Lo que pasa al enviar';
    $('panelIntro').textContent = 'Envía el formulario y mira cada paso encenderse, de uno en uno.';
    $('panelLista').replaceWith(panelInicial.cloneNode(true));
    $('probar').scrollIntoView({ behavior: suave(), block: 'start' });
    $('nombre').focus({ preventScroll: true });
  }

  /* Política de privacidad en ventana emergente (<dialog>: Escape cierra y el foco queda atrapado dentro) */
  const dialogo = $('privacidad');
  const abrirPolitica = (e) => { if (e) e.preventDefault(); if (!dialogo.open) dialogo.showModal(); };
  document.getElementById('anio').textContent = new Date().getFullYear();
  document.querySelectorAll('a[href="#privacidad"], [data-abrir-politica]').forEach((n) => n.addEventListener('click', abrirPolitica));
  $('cerrarPolitica').addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('click', (e) => { if (e.target === dialogo) dialogo.close(); }); // clic en el fondo
  if (location.hash === '#privacidad') abrirPolitica();

  /* ═══ Arranque ═══ */
  if (SIMULANDO) {
    const b = $('bannerSim');
    b.textContent = 'MODO SIMULACIÓN (' + MODO_SIM + '): no se envía nada a n8n. Cambia con ?simular=200 | 202 | 400 | 400-trampa | 400-temporal | 502 | 429 | 500 | timeout | red | real';
    mostrar(b, true);
    document.body.classList.add('con-banner');
  }
  cargarContador();
})();
