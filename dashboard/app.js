/**
 * Mis Gastos — dashboard
 *
 * Página estática (sin frameworks ni build). Pide los datos a la API de Apps Script
 * (`?accion=datos&token=…`) y lo calcula todo en el navegador.
 *
 * Estado:
 *   datos    → { gastos: [...], carpetas: [...], viajeActivo }  (respuesta de la API)
 *   periodo  → 'mes' | 'mesAnterior' | 'anio' | 'todo' | 'custom'
 *   ruta     → { carpeta, subcarpeta } — carpeta seleccionada (null = todas)
 *
 * El token y la URL se guardan en localStorage de ese dispositivo.
 */
(function () {
  'use strict';

  const CLAVE_URL = 'misGastos.apiUrl';
  const CLAVE_TOKEN = 'misGastos.token';
  const CLAVE_CACHE = 'misGastos.cache';
  const GASTOS_POR_PAGINA = 50;

  const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const eurosRedondo = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
  const fechaLarga = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const nombreMes = new Intl.DateTimeFormat('es-ES', { month: 'short' });

  const estado = {
    datos: null,
    periodo: 'mes',
    desde: null,
    hasta: null,
    ruta: null,
    busqueda: '',
    soloOtros: false,
    limite: GASTOS_POR_PAGINA,
    grafico: null,
  };

  const $ = (id) => document.getElementById(id);

  // ─────────────── Almacenamiento local (puede fallar en modo privado) ───────────────

  function leerLocal(clave) {
    try { return localStorage.getItem(clave); } catch (e) { return null; }
  }
  function guardarLocal(clave, valor) {
    try {
      if (valor === null) localStorage.removeItem(clave);
      else localStorage.setItem(clave, valor);
    } catch (e) { /* sin almacenamiento: seguimos sin caché */ }
  }

  function apiUrl() {
    return leerLocal(CLAVE_URL) || (window.MIS_GASTOS_CONFIG && window.MIS_GASTOS_CONFIG.apiUrl) || '';
  }

  // ─────────────── API ───────────────

  async function pedirDatos(url, token) {
    const r = await fetch(url + '?accion=datos&token=' + encodeURIComponent(token));
    if (!r.ok) throw new Error('La API respondió ' + r.status);
    const json = await r.json();
    if (!json.ok) throw new Error(json.error || 'Error desconocido');
    json.gastos.forEach((g) => { g.fechaObj = new Date(g.fecha); });
    return json;
  }

  async function cargar() {
    const url = apiUrl();
    const token = leerLocal(CLAVE_TOKEN);
    if (!url || !token) { mostrarConfig(false); return; }

    mostrarDashboard();
    const cache = leerLocal(CLAVE_CACHE);
    if (cache && !estado.datos) {
      try {
        const datos = JSON.parse(cache);
        datos.gastos.forEach((g) => { g.fechaObj = new Date(g.fecha); });
        estado.datos = datos;
        pintar();
      } catch (e) { /* caché corrupta: se ignora */ }
    }

    $('estado').textContent = 'Actualizando…';
    try {
      const datos = await pedirDatos(url, token);
      estado.datos = datos;
      guardarLocal(CLAVE_CACHE, JSON.stringify({ gastos: datos.gastos.map(sinFechaObj), carpetas: datos.carpetas, viajeActivo: datos.viajeActivo }));
      $('estado').textContent = 'Actualizado a las ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      pintar();
    } catch (e) {
      $('estado').textContent = 'No se pudo actualizar: ' + e.message + (estado.datos ? ' (mostrando la última copia)' : '');
      if (/token/i.test(e.message)) mostrarConfig(true, e.message);
    }
  }

  function sinFechaObj(g) {
    const copia = Object.assign({}, g);
    delete copia.fechaObj;
    return copia;
  }

  // ─────────────── Pantallas ───────────────

  function mostrarConfig(sePuedeCancelar, error) {
    $('pantalla-dashboard').hidden = true;
    $('pantalla-config').hidden = false;
    $('campo-url').value = apiUrl();
    $('campo-token').value = leerLocal(CLAVE_TOKEN) || '';
    $('boton-cancelar-config').hidden = !sePuedeCancelar;
    $('error-config').hidden = !error;
    $('error-config').textContent = error || '';
  }

  function mostrarDashboard() {
    $('pantalla-config').hidden = true;
    $('pantalla-dashboard').hidden = false;
  }

  // ─────────────── Periodos ───────────────

  /** Devuelve { desde, hasta, anterior: {desde, hasta} | null, etiqueta } con `hasta` exclusivo. */
  function rangoPeriodo() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = hoy.getMonth();
    const manana = new Date(y, m, hoy.getDate() + 1);
    switch (estado.periodo) {
      case 'mes': {
        const desde = new Date(y, m, 1);
        // Comparamos con los mismos días del mes pasado (1→hoy), no con el mes entero.
        const antDesde = new Date(y, m - 1, 1);
        const antHasta = new Date(y, m - 1, Math.min(hoy.getDate() + 1, diasDelMes(y, m - 1) + 1));
        return { desde, hasta: manana, anterior: { desde: antDesde, hasta: antHasta }, etiqueta: 'Este mes', comparacion: 'mismo día del mes pasado' };
      }
      case 'mesAnterior': {
        return {
          desde: new Date(y, m - 1, 1), hasta: new Date(y, m, 1),
          anterior: { desde: new Date(y, m - 2, 1), hasta: new Date(y, m - 1, 1) },
          etiqueta: capitalizar(new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))),
          comparacion: 'el mes anterior',
        };
      }
      case 'anio': {
        return {
          desde: new Date(y, 0, 1), hasta: manana,
          anterior: { desde: new Date(y - 1, 0, 1), hasta: new Date(y - 1, m, hoy.getDate() + 1) },
          etiqueta: 'En ' + y, comparacion: 'mismo día del año pasado',
        };
      }
      case 'custom': {
        const desde = estado.desde ? new Date(estado.desde + 'T00:00') : null;
        const hasta = estado.hasta ? new Date(new Date(estado.hasta + 'T00:00').getTime() + 864e5) : null;
        return { desde, hasta, anterior: null, etiqueta: 'Fechas elegidas' };
      }
      default:
        return { desde: null, hasta: null, anterior: null, etiqueta: 'Todo' };
    }
  }

  function diasDelMes(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function capitalizar(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function enRango(g, desde, hasta) {
    return (!desde || g.fechaObj >= desde) && (!hasta || g.fechaObj < hasta);
  }

  function enRuta(g) {
    const r = estado.ruta;
    if (!r) return true;
    if (g.carpeta !== r.carpeta) return false;
    return r.subcarpeta === undefined || g.subcarpeta === r.subcarpeta;
  }

  const suma = (lista) => lista.reduce((t, g) => t + g.importe, 0);

  // ─────────────── Pintado ───────────────

  function pintar() {
    if (!estado.datos) return;
    const rango = rangoPeriodo();
    const delPeriodo = estado.datos.gastos.filter((g) => enRango(g, rango.desde, rango.hasta) && enRuta(g));

    pintarSelectorPeriodo();
    pintarMigas();
    pintarResumen(rango, delPeriodo);
    pintarCarpetas(delPeriodo);
    pintarGrafico();
    pintarViajes();
    pintarLista(delPeriodo);
  }

  function pintarSelectorPeriodo() {
    document.querySelectorAll('#selector-periodo button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.periodo === estado.periodo));
    });
    $('fechas-custom').hidden = estado.periodo !== 'custom';
  }

  function pintarMigas() {
    const nav = $('migas');
    nav.innerHTML = '';
    const r = estado.ruta;
    if (!r) return;
    const partes = [{ texto: 'Todas', ruta: null }, { texto: r.carpeta, ruta: { carpeta: r.carpeta } }];
    if (r.subcarpeta !== undefined) partes.push({ texto: r.subcarpeta || r.carpeta + ' (general)', ruta: r });
    partes.forEach((p, i) => {
      if (i > 0) nav.insertAdjacentHTML('beforeend', '<span class="sep">›</span>');
      if (i === partes.length - 1) {
        nav.insertAdjacentHTML('beforeend', '<strong>' + esc(p.texto) + '</strong>');
      } else {
        const b = document.createElement('button');
        b.textContent = p.texto;
        b.addEventListener('click', () => irA(p.ruta));
        nav.appendChild(b);
      }
    });
  }

  function pintarResumen(rango, delPeriodo) {
    const total = suma(delPeriodo);
    const r = estado.ruta;
    const donde = r ? ' · ' + (r.subcarpeta ? r.carpeta + ' / ' + r.subcarpeta : r.carpeta) : '';
    $('resumen-etiqueta').textContent = rango.etiqueta + donde;
    $('resumen-total').textContent = euros.format(total);
    $('resumen-num').textContent = delPeriodo.length + (delPeriodo.length === 1 ? ' gasto' : ' gastos');

    const delta = $('resumen-delta');
    delta.className = '';
    delta.textContent = '';
    if (rango.anterior) {
      const antes = suma(estado.datos.gastos.filter((g) => enRango(g, rango.anterior.desde, rango.anterior.hasta) && enRuta(g)));
      if (antes > 0) {
        const pct = Math.round(((total - antes) / antes) * 100);
        const flecha = pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
        delta.textContent = flecha + ' ' + Math.abs(pct) + ' % vs ' + rango.comparacion + ' (' + eurosRedondo.format(antes) + ')';
        delta.className = pct > 0 ? 'delta-sube' : pct < 0 ? 'delta-baja' : '';
      }
    }
  }

  function pintarCarpetas(delPeriodo) {
    const seccion = $('seccion-carpetas');
    const r = estado.ruta;
    // Dentro de una subcarpeta concreta no hay nada más que desglosar.
    if (r && r.subcarpeta !== undefined) { seccion.hidden = true; return; }
    seccion.hidden = false;

    const porClave = new Map();
    delPeriodo.forEach((g) => {
      const clave = r ? g.subcarpeta : g.carpeta;
      porClave.set(clave, (porClave.get(clave) || 0) + g.importe);
    });
    const filas = Array.from(porClave, ([clave, total]) => ({ clave, total })).sort((a, b) => b.total - a.total);
    // Carpeta sin subcarpetas: el desglose sería una sola barra al 100 %.
    if (r && filas.every((f) => f.clave === '')) { seccion.hidden = true; return; }
    const total = suma(delPeriodo);
    const max = filas.length ? filas[0].total : 0;

    $('titulo-carpetas').textContent = r ? 'Dentro de ' + r.carpeta : 'Por carpeta';
    const ul = $('lista-carpetas');
    ul.innerHTML = '';
    if (!filas.length) { ul.innerHTML = '<li class="vacio">No hay gastos en este periodo.</li>'; return; }

    filas.forEach((f) => {
      const nombre = r ? (f.clave || r.carpeta + ' (general)') : f.clave;
      const pct = total > 0 ? Math.round((f.total / total) * 100) : 0;
      const li = document.createElement('li');
      li.innerHTML =
        '<button type="button">' +
          '<div class="barra-fila"><span>' + esc(nombre) + '</span>' +
          '<span class="barra-valor">' + euros.format(f.total) + '<small>' + pct + ' %</small></span></div>' +
          '<div class="barra-pista"><div class="barra-relleno" style="width:' + (max ? (f.total / max) * 100 : 0).toFixed(1) + '%"></div></div>' +
        '</button>';
      li.querySelector('button').addEventListener('click', () => {
        irA(r ? { carpeta: r.carpeta, subcarpeta: f.clave } : { carpeta: f.clave });
      });
      ul.appendChild(li);
    });
  }

  function pintarGrafico() {
    if (!window.Chart || !estado.datos) return; // sin librería (sin conexión) o sin datos aún
    const hoy = new Date();
    const meses = [];
    for (let i = 11; i >= 0; i--) meses.push(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1));
    const totales = meses.map((inicio) => {
      const fin = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1);
      return suma(estado.datos.gastos.filter((g) => enRango(g, inicio, fin) && enRuta(g)));
    });
    const etiquetas = meses.map((d) => capitalizar(nombreMes.format(d).replace('.', '')) + (d.getMonth() === 0 ? ' ' + String(d.getFullYear()).slice(2) : ''));
    const r = estado.ruta;
    $('titulo-evolucion').textContent = 'Últimos 12 meses' + (r ? ' · ' + (r.subcarpeta ? r.carpeta + ' / ' + r.subcarpeta : r.carpeta) : '');

    const css = getComputedStyle(document.documentElement);
    const color = (v) => css.getPropertyValue(v).trim();

    if (estado.grafico) estado.grafico.destroy();
    estado.grafico = new Chart($('grafico-meses'), {
      type: 'bar',
      data: {
        labels: etiquetas,
        datasets: [{
          label: 'Gasto',
          data: totales,
          backgroundColor: color('--acento'),
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'bottom',
          maxBarThickness: 28,
        }],
      },
      options: {
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => capitalizar(new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(meses[items[0].dataIndex])),
              label: (item) => euros.format(item.parsed.y),
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: color('--texto-2'), maxRotation: 0, autoSkip: true }, border: { color: color('--rejilla') } },
          y: {
            beginAtZero: true,
            grid: { color: color('--rejilla') },
            border: { display: false },
            ticks: { color: color('--texto-2'), maxTicksLimit: 5, callback: (v) => eurosRedondo.format(v) },
          },
        },
      },
    });
  }

  function pintarViajes() {
    const archivados = new Set(estado.datos.carpetas
      .filter((c) => c.carpeta === 'Viajes' && c.archivada).map((c) => c.subcarpeta));
    const viajes = new Map();
    estado.datos.gastos.forEach((g) => {
      if (g.carpeta !== 'Viajes' || !g.subcarpeta || g.subcarpeta === 'Otros') return;
      const v = viajes.get(g.subcarpeta) || { nombre: g.subcarpeta, total: 0, primero: g.fechaObj, ultimo: g.fechaObj };
      v.total += g.importe;
      if (g.fechaObj < v.primero) v.primero = g.fechaObj;
      if (g.fechaObj > v.ultimo) v.ultimo = g.fechaObj;
      viajes.set(g.subcarpeta, v);
    });
    const lista = Array.from(viajes.values()).sort((a, b) => b.ultimo - a.ultimo);
    const ul = $('lista-viajes');
    $('seccion-viajes').hidden = !lista.length;
    ul.innerHTML = '';
    lista.forEach((v) => {
      const li = document.createElement('li');
      const insignias =
        (v.nombre === estado.datos.viajeActivo ? '<span class="insignia">activo</span>' : '') +
        (archivados.has(v.nombre) ? '<span class="insignia">archivado</span>' : '');
      li.innerHTML =
        '<button type="button">' +
          '<div class="viaje-nombre">' + esc(v.nombre) + insignias + '</div>' +
          '<div class="viaje-total">' + euros.format(v.total) + '</div>' +
          '<div class="viaje-fechas">' + fechaCorta.format(v.primero) + ' – ' + fechaLarga.format(v.ultimo) + '</div>' +
        '</button>';
      li.querySelector('button').addEventListener('click', () => {
        estado.periodo = 'todo';
        irA({ carpeta: 'Viajes', subcarpeta: v.nombre });
      });
      ul.appendChild(li);
    });
  }

  function pintarLista(delPeriodo) {
    const q = estado.busqueda.trim().toLowerCase();
    const filtrados = delPeriodo
      .filter((g) => !estado.soloOtros || g.carpeta === 'Otros' || g.subcarpeta === 'Otros')
      .filter((g) => !q || (g.concepto + ' ' + g.nota + ' ' + g.carpeta + ' ' + g.subcarpeta).toLowerCase().includes(q))
      .sort((a, b) => b.fechaObj - a.fechaObj);

    const ul = $('lista-gastos');
    ul.innerHTML = '';
    if (!filtrados.length) ul.innerHTML = '<li class="vacio">No hay gastos que mostrar.</li>';
    filtrados.slice(0, estado.limite).forEach((g) => {
      const li = document.createElement('li');
      const carpeta = g.subcarpeta ? g.carpeta + ' / ' + g.subcarpeta : g.carpeta;
      li.innerHTML =
        '<div>' +
          '<div class="gasto-concepto">' + esc(g.concepto || '(sin concepto)') + '</div>' +
          '<div class="gasto-meta">' + fechaLarga.format(g.fechaObj) + ' · ' + esc(carpeta) + '</div>' +
          (g.nota ? '<div class="gasto-nota">' + esc(g.nota) + '</div>' : '') +
        '</div>' +
        '<div class="gasto-importe">' + euros.format(g.importe) + '</div>';
      ul.appendChild(li);
    });
    $('boton-ver-mas').hidden = filtrados.length <= estado.limite;
  }

  function irA(ruta) {
    estado.ruta = ruta;
    estado.limite = GASTOS_POR_PAGINA;
    pintar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ─────────────── Eventos ───────────────

  function iniciar() {
    $('form-config').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const url = $('campo-url').value.trim();
      const token = $('campo-token').value.trim();
      $('error-config').hidden = true;
      try {
        const datos = await pedirDatos(url, token);
        guardarLocal(CLAVE_URL, url);
        guardarLocal(CLAVE_TOKEN, token);
        estado.datos = datos;
        cargar();
      } catch (e) {
        $('error-config').textContent = 'No se pudo conectar: ' + e.message;
        $('error-config').hidden = false;
      }
    });
    $('boton-cancelar-config').addEventListener('click', mostrarDashboard);
    $('boton-ajustes').addEventListener('click', () => mostrarConfig(true));
    $('boton-recargar').addEventListener('click', cargar);

    document.querySelectorAll('#selector-periodo button').forEach((b) => {
      b.addEventListener('click', () => {
        estado.periodo = b.dataset.periodo;
        estado.limite = GASTOS_POR_PAGINA;
        pintar();
      });
    });
    $('fecha-desde').addEventListener('change', (e) => { estado.desde = e.target.value || null; pintar(); });
    $('fecha-hasta').addEventListener('change', (e) => { estado.hasta = e.target.value || null; pintar(); });
    $('buscador').addEventListener('input', (e) => { estado.busqueda = e.target.value; estado.limite = GASTOS_POR_PAGINA; pintar(); });
    $('solo-otros').addEventListener('change', (e) => { estado.soloOtros = e.target.checked; pintar(); });
    $('boton-ver-mas').addEventListener('click', () => { estado.limite += GASTOS_POR_PAGINA; pintar(); });

    // Repintar el gráfico al cambiar entre modo claro y oscuro.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', pintarGrafico);
    // Al volver a la app desde segundo plano, refrescar.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && estado.datos) cargar(); });

    cargar();
  }

  iniciar();
})();
