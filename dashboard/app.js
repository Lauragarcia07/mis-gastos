/**
 * Mis Gastos — dashboard
 *
 * Página estática (sin frameworks ni build), pensada para el móvil. Pide los datos a la
 * API de Apps Script (`?accion=datos&token=…`) y lo calcula todo en el navegador.
 * También edita y borra gastos (POST `accion: editar | borrar`).
 *
 * Pestañas:
 *   resumen → héroe con total, donut por carpeta (con detalle por subcarpeta),
 *             barras apiladas de 12 meses y últimos gastos
 *   gastos  → lista agrupada por día con buscador y filtros; tocar un gasto lo edita
 *   viajes  → una tarjeta por viaje con total, días y media diaria
 *
 * Colores: cada carpeta tiene un color FIJO según su orden en la pestaña Carpetas
 * (8 tonos de la paleta categórica validada; «Otros» y lo que no cabe, en gris).
 * El donut muestra como máximo 6 trozos: las 5 carpetas que más gastan + «Resto».
 *
 * El token y la URL se guardan en localStorage de ese dispositivo.
 */
(function () {
  'use strict';

  const CLAVE_URL = 'misGastos.apiUrl';
  const CLAVE_TOKEN = 'misGastos.token';
  const CLAVE_CACHE = 'misGastos.cache';
  const GASTOS_POR_PAGINA = 60;
  const MAX_TROZOS = 5;            // + «Resto» = 6 trozos como máximo en el donut
  const NUM_COLORES = 8;           // --c1 … --c8 en styles.css

  const EMOJI_CARPETA = {
    'Casa': '🏠', 'Supermercado': '🛒', 'Comida fuera': '🍽️', 'Transporte': '🚗',
    'Ocio': '🎉', 'Compras': '🛍️', 'Suscripciones': '📺', 'Viajes': '✈️', 'Otros': '📦',
  };
  const EMOJI_SUBCARPETA = { 'Deporte': '🏃', 'Ropa': '👕', 'Regalos': '🎁' };

  const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
  const eurosRedondo = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const fmtDiaLargo = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
  const fmtFechaCorta = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
  const fmtFechaLarga = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'short' });
  const fmtMesLargo = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
  const fmtHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

  const estado = {
    datos: null,
    pestana: 'resumen',
    periodo: 'mes',
    desde: null,
    hasta: null,
    ruta: null,              // carpeta abierta en el donut (string) o null
    busqueda: '',
    soloOtros: false,
    filtroCarpeta: '',       // 'c:Ocio' (carpeta entera) | 's:Ocio|Deporte' (subcarpeta) | ''
    filtroViaje: '',
    limite: GASTOS_POR_PAGINA,
    graficos: {},
    editando: null,
    animar: true,
  };

  const $ = (id) => document.getElementById(id);

  // ───────────────────────────── Almacenamiento local ─────────────────────────────

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

  // ───────────────────────────── API ─────────────────────────────

  function prepararDatos(datos) {
    datos.gastos.forEach((g) => { g.fechaObj = new Date(g.fecha); });
    return datos;
  }

  async function pedirDatos(url, token) {
    const r = await fetch(url + '?accion=datos&token=' + encodeURIComponent(token));
    if (!r.ok) throw new Error('La API respondió ' + r.status);
    const json = await r.json();
    if (!json.ok) throw new Error(json.error || 'Error desconocido');
    return prepararDatos(json);
  }

  /** POST a la API. text/plain evita la petición previa de CORS, que Apps Script no admite. */
  async function enviar(cuerpo) {
    const r = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ token: leerLocal(CLAVE_TOKEN) }, cuerpo)),
    });
    const json = await r.json();
    if (!json.ok) throw new Error(json.error || 'Error desconocido');
    return json;
  }

  function guardarCache() {
    const d = estado.datos;
    guardarLocal(CLAVE_CACHE, JSON.stringify({
      gastos: d.gastos.map((g) => { const c = Object.assign({}, g); delete c.fechaObj; return c; }),
      carpetas: d.carpetas,
      viajeActivo: d.viajeActivo,
    }));
  }

  async function cargar() {
    const url = apiUrl();
    const token = leerLocal(CLAVE_TOKEN);
    if (!url || !token) { mostrarConfig(false); return; }

    mostrarApp();
    if (!estado.datos) {
      try {
        const cache = leerLocal(CLAVE_CACHE);
        if (cache) { estado.datos = prepararDatos(JSON.parse(cache)); pintar(); }
      } catch (e) { /* caché corrupta: se ignora */ }
    }

    $('estado').textContent = 'Actualizando…';
    try {
      estado.datos = await pedirDatos(url, token);
      guardarCache();
      $('estado').textContent = 'Actualizado a las ' + fmtHora.format(new Date());
      pintar();
    } catch (e) {
      $('estado').textContent = 'Sin conexión' + (estado.datos ? ' · mostrando la última copia' : '');
      if (/token/i.test(e.message)) mostrarConfig(true, e.message);
    }
  }

  // ───────────────────────────── Pantallas ─────────────────────────────

  function mostrarConfig(sePuedeCancelar, error) {
    $('pantalla-app').hidden = true;
    $('pantalla-config').hidden = false;
    $('campo-url').value = apiUrl();
    $('campo-token').value = leerLocal(CLAVE_TOKEN) || '';
    $('boton-cancelar-config').hidden = !sePuedeCancelar;
    $('error-config').hidden = !error;
    $('error-config').textContent = error || '';
  }

  function mostrarApp() {
    $('pantalla-config').hidden = true;
    $('pantalla-app').hidden = false;
  }

  function avisar(texto) {
    const el = $('aviso');
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => { el.hidden = true; }, 2200);
  }

  // ───────────────────────────── Colores e iconos ─────────────────────────────

  function variableCss(nombre) {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  }

  /** Color fijo de cada carpeta según su orden en la pestaña Carpetas. */
  function colorCarpeta(carpeta) {
    if (carpeta === 'Otros' || carpeta === 'Resto') return variableCss('--c-gris');
    const orden = [];
    estado.datos.carpetas.concat(estado.datos.gastos).forEach((c) => {
      if (c.carpeta !== 'Otros' && orden.indexOf(c.carpeta) === -1) orden.push(c.carpeta);
    });
    const i = orden.indexOf(carpeta);
    return i >= 0 && i < NUM_COLORES ? variableCss('--c' + (i + 1)) : variableCss('--c-gris');
  }

  /** Subcarpetas: tonos del color de su carpeta, del más intenso al más suave. */
  function colorSubcarpeta(carpeta, subcarpeta) {
    if (subcarpeta === 'Resto') return variableCss('--c-gris');
    const subs = [];
    estado.datos.carpetas.concat(estado.datos.gastos).forEach((c) => {
      if (c.carpeta === carpeta && subs.indexOf(c.subcarpeta) === -1) subs.push(c.subcarpeta);
    });
    const pasos = [0, 0.38, 0.6, 0.75, 0.85];
    const i = Math.max(0, subs.indexOf(subcarpeta));
    return mezclar(colorCarpeta(carpeta), variableCss('--superficie'), pasos[Math.min(i, pasos.length - 1)]);
  }

  function mezclar(hexA, hexB, t) {
    const a = parseInt(hexA.slice(1), 16);
    const b = parseInt(hexB.slice(1), 16);
    const canal = (desp) => Math.round(((a >> desp) & 255) * (1 - t) + ((b >> desp) & 255) * t);
    return '#' + [16, 8, 0].map((d) => canal(d).toString(16).padStart(2, '0')).join('');
  }

  function emoji(carpeta, subcarpeta) {
    if (subcarpeta && EMOJI_SUBCARPETA[subcarpeta]) return EMOJI_SUBCARPETA[subcarpeta];
    return EMOJI_CARPETA[carpeta] || '📁';
  }

  function etiqueta(carpeta, subcarpeta) {
    return subcarpeta ? carpeta + ' / ' + subcarpeta : carpeta;
  }

  // ───────────────────────────── Periodos ─────────────────────────────

  /** { desde, hasta (exclusivo), dias, anterior, etiqueta, comparacion } */
  function rangoPeriodo() {
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = hoy.getMonth();
    const d = hoy.getDate();
    const manana = new Date(y, m, d + 1);
    switch (estado.periodo) {
      case 'mes':
        return {
          desde: new Date(y, m, 1), hasta: manana, dias: d,
          // Comparamos con los mismos días del mes pasado (1 → hoy), no con el mes entero.
          anterior: { desde: new Date(y, m - 1, 1), hasta: new Date(y, m - 1, Math.min(d, diasDelMes(y, m - 1)) + 1) },
          etiqueta: capitalizar(fmtMesLargo.format(hoy).split(' ')[0]), comparacion: 'mismo día del mes pasado',
          prevision: true,
        };
      case 'mesAnterior':
        return {
          desde: new Date(y, m - 1, 1), hasta: new Date(y, m, 1), dias: diasDelMes(y, m - 1),
          anterior: { desde: new Date(y, m - 2, 1), hasta: new Date(y, m - 1, 1) },
          etiqueta: capitalizar(fmtMesLargo.format(new Date(y, m - 1, 1))), comparacion: 'el mes anterior',
        };
      case 'anio':
        return {
          desde: new Date(y, 0, 1), hasta: manana, dias: Math.round((manana - new Date(y, 0, 1)) / 864e5),
          anterior: { desde: new Date(y - 1, 0, 1), hasta: new Date(y - 1, m, d + 1) },
          etiqueta: 'En ' + y, comparacion: 'mismo día del año pasado',
        };
      case 'custom': {
        const desde = estado.desde ? new Date(estado.desde + 'T00:00') : null;
        const hasta = estado.hasta ? new Date(new Date(estado.hasta + 'T00:00').getTime() + 864e5) : manana;
        const inicio = desde || primeraFecha() || hasta;
        return { desde, hasta, dias: Math.max(1, Math.round((hasta - inicio) / 864e5)), etiqueta: 'Fechas elegidas' };
      }
      default: {
        const inicio = primeraFecha() || hoy;
        const inicioDia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
        return { desde: null, hasta: null, dias: Math.max(1, Math.round((manana - inicioDia) / 864e5)), etiqueta: 'Desde el principio' };
      }
    }
  }

  function primeraFecha() {
    return estado.datos.gastos.reduce((min, g) => (!min || g.fechaObj < min ? g.fechaObj : min), null);
  }
  function diasDelMes(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function capitalizar(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function enRango(g, desde, hasta) { return (!desde || g.fechaObj >= desde) && (!hasta || g.fechaObj < hasta); }
  const suma = (lista) => lista.reduce((t, g) => t + g.importe, 0);

  // ───────────────────────────── Pintado general ─────────────────────────────

  function pintar() {
    if (!estado.datos) return;
    document.querySelectorAll('.pestanas button').forEach((b) => {
      if (b.dataset.pestana === estado.pestana) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    ['resumen', 'gastos', 'viajes'].forEach((p) => { $('pestana-' + p).hidden = p !== estado.pestana; });
    $('titulo-pestana').textContent = { resumen: 'Resumen', gastos: 'Gastos', viajes: 'Viajes' }[estado.pestana];

    const viaje = estado.datos.viajeActivo;
    $('pastilla-viaje').hidden = !viaje;
    $('pastilla-viaje').textContent = '✈️ ' + viaje;

    const conPeriodo = estado.pestana !== 'viajes' && !estado.filtroViaje;
    $('barra-periodo').hidden = !conPeriodo;
    document.querySelectorAll('#barra-periodo button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.periodo === estado.periodo));
    });
    $('fechas-custom').hidden = !conPeriodo || estado.periodo !== 'custom';

    if (estado.pestana === 'resumen') pintarResumen();
    if (estado.pestana === 'gastos') pintarGastos();
    if (estado.pestana === 'viajes') pintarViajes();
    estado.animar = false;
  }

  function irAPestana(p) {
    estado.pestana = p;
    estado.limite = GASTOS_POR_PAGINA;
    estado.animar = true;
    pintar();
    window.scrollTo({ top: 0 });
  }

  // ───────────────────────────── Resumen ─────────────────────────────

  function pintarResumen() {
    const rango = rangoPeriodo();
    const delPeriodo = estado.datos.gastos.filter((g) => enRango(g, rango.desde, rango.hasta));
    pintarHeroe(rango, delPeriodo);
    pintarDonut(delPeriodo);
    pintarMeses();
    pintarUltimos();
  }

  function pintarHeroe(rango, delPeriodo) {
    const total = suma(delPeriodo);
    $('heroe-etiqueta').textContent = rango.etiqueta;
    $('heroe-total').textContent = euros.format(total);
    $('stat-num').textContent = delPeriodo.length;
    const media = total / Math.max(1, rango.dias);
    $('stat-media').textContent = eurosRedondo.format(media);

    if (rango.prevision) {
      const hoy = new Date();
      $('stat-extra').textContent = eurosRedondo.format(media * diasDelMes(hoy.getFullYear(), hoy.getMonth()));
      $('stat-extra-etiqueta').textContent = 'previsión del mes';
    } else {
      const mayor = delPeriodo.reduce((max, g) => Math.max(max, g.importe), 0);
      $('stat-extra').textContent = eurosRedondo.format(mayor);
      $('stat-extra-etiqueta').textContent = 'mayor gasto';
    }

    const delta = $('heroe-delta');
    delta.textContent = '';
    if (rango.anterior) {
      const antes = suma(estado.datos.gastos.filter((g) => enRango(g, rango.anterior.desde, rango.anterior.hasta)));
      if (antes > 0) {
        const pct = Math.round(((total - antes) / antes) * 100);
        const flecha = pct > 0 ? '▲' : pct < 0 ? '▼' : '=';
        delta.textContent = flecha + ' ' + Math.abs(pct) + ' % vs ' + rango.comparacion;
      }
    }
  }

  /** Agrupa importes por clave y devuelve [{clave, total}] de mayor a menor. */
  function agrupar(gastos, claveDe) {
    const mapa = new Map();
    gastos.forEach((g) => { const k = claveDe(g); mapa.set(k, (mapa.get(k) || 0) + g.importe); });
    return Array.from(mapa, ([clave, total]) => ({ clave, total })).sort((a, b) => b.total - a.total);
  }

  function tieneSubcarpetas(carpeta) {
    return estado.datos.carpetas.concat(estado.datos.gastos)
      .some((c) => c.carpeta === carpeta && c.subcarpeta);
  }

  function pintarDonut(delPeriodo) {
    const ruta = estado.ruta;
    const gastos = ruta ? delPeriodo.filter((g) => g.carpeta === ruta) : delPeriodo;
    const filas = agrupar(gastos, (g) => (ruta ? g.subcarpeta : g.carpeta));
    const total = suma(gastos);

    $('titulo-donut').textContent = ruta ? emoji(ruta) + ' ' + ruta : '¿En qué se va?';
    $('boton-volver-donut').hidden = !ruta;
    $('donut-total').textContent = eurosRedondo.format(total);
    $('donut-etiqueta').textContent = ruta ? 'en ' + ruta.toLowerCase() : 'en total';

    // Trozos: los MAX_TROZOS mayores con su color; el resto, juntos en gris.
    const conResto = filas.length > MAX_TROZOS + 1;
    const visibles = conResto ? filas.slice(0, MAX_TROZOS) : filas;
    const enResto = conResto ? filas.slice(MAX_TROZOS) : [];
    const nombreDe = (clave) => (ruta ? (clave || 'General') : clave);
    const colorDe = (clave) => (ruta ? colorSubcarpeta(ruta, clave) : colorCarpeta(clave));

    const trozos = visibles.map((f) => ({ clave: f.clave, nombre: nombreDe(f.clave), total: f.total, color: colorDe(f.clave) }));
    if (conResto) trozos.push({ clave: null, nombre: 'Resto', total: suma(enResto.map((f) => ({ importe: f.total }))), color: variableCss('--c-gris') });

    dibujarDonut(trozos, total);

    // Leyenda: TODAS las carpetas (las del resto con punto gris), con importe y %.
    const ul = $('leyenda-donut');
    ul.innerHTML = '';
    if (!filas.length) {
      ul.innerHTML = '<li class="vacio"><span class="vacio-icono">🌱</span>No hay gastos en este periodo.</li>';
      return;
    }
    filas.forEach((f, i) => {
      const color = conResto && i >= MAX_TROZOS ? variableCss('--c-gris') : colorDe(f.clave);
      const pct = total > 0 ? Math.round((f.total / total) * 100) : 0;
      const sub = ruta ? f.clave : '';
      const carpeta = ruta || f.clave;
      const abre = !ruta && tieneSubcarpetas(f.clave);
      const li = document.createElement('li');
      li.innerHTML =
        '<button type="button">' +
          '<span class="leyenda-icono" style="--color:' + color + '">' + emoji(carpeta, sub) + '</span>' +
          '<span class="leyenda-nombre">' + esc(nombreDe(f.clave)) + '<span class="leyenda-pct">' + pct + ' %' + '</span></span>' +
          '<span class="leyenda-valor">' + euros.format(f.total) + '</span>' +
          '<span class="leyenda-flecha">›</span>' +
        '</button>';
      li.querySelector('button').addEventListener('click', () => {
        if (abre) abrirCarpeta(f.clave);
        else verGastosDe(carpeta, ruta ? f.clave : null);
      });
      ul.appendChild(li);
    });
  }

  function dibujarDonut(trozos, total) {
    if (!window.Chart) return;
    if (estado.graficos.donut) estado.graficos.donut.destroy();
    const vacio = total <= 0;
    estado.graficos.donut = new Chart($('grafico-donut'), {
      type: 'doughnut',
      data: {
        labels: vacio ? [''] : trozos.map((t) => t.nombre),
        datasets: [{
          data: vacio ? [1] : trozos.map((t) => t.total),
          backgroundColor: vacio ? [variableCss('--rejilla')] : trozos.map((t) => t.color),
          borderColor: variableCss('--superficie'),
          borderWidth: 3,
          borderRadius: 6,
          hoverOffset: vacio ? 0 : 8,
        }],
      },
      options: {
        cutout: '68%',
        layout: { padding: 8 },
        animation: estado.animar ? { animateRotate: true, duration: 600 } : false,
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: !vacio,
            callbacks: {
              label: (item) => ' ' + euros.format(item.parsed) + ' · ' + Math.round((item.parsed / total) * 100) + ' %',
            },
          },
        },
        onClick: (evento, elementos) => {
          if (vacio || !elementos.length) return;
          const t = trozos[elementos[0].index];
          if (!t || t.clave === null) return; // «Resto»: el detalle está en la leyenda
          if (!estado.ruta && tieneSubcarpetas(t.clave)) abrirCarpeta(t.clave);
          else verGastosDe(estado.ruta || t.clave, estado.ruta ? t.clave : null);
        },
      },
    });
  }

  function abrirCarpeta(carpeta) {
    estado.ruta = carpeta;
    estado.animar = true;
    pintar();
  }

  function pintarMeses() {
    if (!window.Chart) return;
    const hoy = new Date();
    const meses = [];
    for (let i = 11; i >= 0; i--) meses.push(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1));
    const inicio = meses[0];
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
    const ruta = estado.ruta;
    const gastos = estado.datos.gastos.filter((g) => enRango(g, inicio, fin) && (!ruta || g.carpeta === ruta));
    const claveDe = (g) => (ruta ? g.subcarpeta : g.carpeta);

    // Mismas reglas que el donut: 5 series con color + «Resto» en gris.
    const ranking = agrupar(gastos, claveDe).map((f) => f.clave);
    const conResto = ranking.length > MAX_TROZOS + 1;
    const principales = conResto ? ranking.slice(0, MAX_TROZOS) : ranking;
    const series = principales.map((k) => ({
      clave: k,
      nombre: ruta ? (k || 'General') : k,
      color: ruta ? colorSubcarpeta(ruta, k) : colorCarpeta(k),
    }));
    if (conResto) series.push({ clave: null, nombre: 'Resto', color: variableCss('--c-gris') });

    const indiceMes = (g) => (g.fechaObj.getFullYear() - inicio.getFullYear()) * 12 + g.fechaObj.getMonth() - inicio.getMonth();
    const valores = series.map(() => new Array(12).fill(0));
    gastos.forEach((g) => {
      let s = principales.indexOf(claveDe(g));
      if (s === -1) s = series.length - 1;
      valores[s][indiceMes(g)] += g.importe;
    });

    const etiquetas = meses.map((d) => capitalizar(fmtMes.format(d).replace('.', '')));
    const superficie = variableCss('--superficie');
    if (estado.graficos.meses) estado.graficos.meses.destroy();
    estado.graficos.meses = new Chart($('grafico-meses'), {
      type: 'bar',
      data: {
        labels: etiquetas,
        datasets: series.map((s, i) => ({
          label: s.nombre,
          data: valores[i],
          backgroundColor: s.color,
          borderColor: superficie,
          borderWidth: { top: 2 },
          borderSkipped: 'bottom',
          borderRadius: 4,
          maxBarThickness: 26,
        })),
      },
      options: {
        maintainAspectRatio: false,
        animation: estado.animar ? { duration: 400 } : false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (item) => item.parsed.y > 0,
            itemSort: (a, b) => b.parsed.y - a.parsed.y,
            callbacks: {
              title: (items) => capitalizar(fmtMesLargo.format(meses[items[0].dataIndex])),
              label: (item) => ' ' + item.dataset.label + ': ' + euros.format(item.parsed.y),
              footer: (items) => 'Total: ' + euros.format(items.reduce((t, i) => t + i.parsed.y, 0)),
            },
          },
        },
        scales: {
          x: {
            stacked: true, grid: { display: false },
            ticks: { color: variableCss('--texto-2'), maxRotation: 0, autoSkip: true, font: { size: 11 } },
            border: { color: variableCss('--rejilla') },
          },
          y: {
            stacked: true, beginAtZero: true,
            grid: { color: variableCss('--rejilla') }, border: { display: false },
            ticks: { color: variableCss('--texto-3'), maxTicksLimit: 4, callback: (v) => eurosRedondo.format(v), font: { size: 11 } },
          },
        },
      },
    });

    const leyenda = $('leyenda-meses');
    leyenda.innerHTML = series.length > 1
      ? series.map((s) => '<li><span class="punto" style="--color:' + s.color + '"></span>' + esc(s.nombre) + '</li>').join('')
      : '';
  }

  function pintarUltimos() {
    const ultimos = estado.datos.gastos.slice().sort((a, b) => b.fechaObj - a.fechaObj).slice(0, 5);
    const ul = $('ultimos-gastos');
    ul.innerHTML = '';
    if (!ultimos.length) { ul.innerHTML = '<li class="vacio">Aún no hay gastos.</li>'; return; }
    ultimos.forEach((g) => ul.appendChild(filaGasto(g, true)));
  }

  // ───────────────────────────── Gastos ─────────────────────────────

  function verGastosDe(carpeta, subcarpeta) {
    estado.filtroCarpeta = subcarpeta === null ? 'c:' + carpeta : 's:' + carpeta + '|' + subcarpeta;
    estado.filtroViaje = '';
    irAPestana('gastos');
  }

  function gastosFiltrados() {
    const rango = rangoPeriodo();
    const q = estado.busqueda.trim().toLowerCase();
    const f = estado.filtroCarpeta;
    return estado.datos.gastos.filter((g) => {
      if (estado.filtroViaje) {
        if (g.carpeta !== 'Viajes' || g.subcarpeta !== estado.filtroViaje) return false;
      } else if (!enRango(g, rango.desde, rango.hasta)) return false;
      if (f.startsWith('c:') && g.carpeta !== f.slice(2)) return false;
      if (f.startsWith('s:')) {
        const [c, s] = f.slice(2).split('|');
        if (g.carpeta !== c || g.subcarpeta !== s) return false;
      }
      if (estado.soloOtros && g.carpeta !== 'Otros' && g.subcarpeta !== 'Otros') return false;
      if (q && !(g.concepto + ' ' + g.nota + ' ' + g.carpeta + ' ' + g.subcarpeta).toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => b.fechaObj - a.fechaObj);
  }

  function pintarOpcionesCarpeta() {
    const select = $('filtro-carpeta');
    const opciones = ['<option value="">Todas las carpetas</option>'];
    const vistas = [];
    estado.datos.carpetas.forEach((c) => {
      if (vistas.indexOf(c.carpeta) === -1) {
        vistas.push(c.carpeta);
        opciones.push('<option value="c:' + esc(c.carpeta) + '">' + emoji(c.carpeta) + ' ' + esc(c.carpeta) + (tieneSubcarpetas(c.carpeta) ? ' (todo)' : '') + '</option>');
      }
      if (c.subcarpeta) {
        opciones.push('<option value="s:' + esc(c.carpeta + '|' + c.subcarpeta) + '">&nbsp;&nbsp;&nbsp;' + esc(etiqueta(c.carpeta, c.subcarpeta)) + '</option>');
      }
    });
    select.innerHTML = opciones.join('');
    select.value = estado.filtroCarpeta;
  }

  function pintarGastos() {
    pintarOpcionesCarpeta();
    $('solo-otros').checked = estado.soloOtros;
    if ($('buscador').value !== estado.busqueda) $('buscador').value = estado.busqueda;

    const chips = $('filtros-activos');
    chips.innerHTML = '';
    if (estado.filtroViaje) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = '✈️ ' + estado.filtroViaje + '  ✕';
      b.addEventListener('click', () => { estado.filtroViaje = ''; pintar(); });
      chips.appendChild(b);
    }

    const lista = gastosFiltrados();
    $('resumen-filtro').innerHTML = lista.length
      ? '<strong>' + euros.format(suma(lista)) + '</strong> en ' + lista.length + (lista.length === 1 ? ' gasto' : ' gastos')
      : '';

    const cont = $('lista-dias');
    cont.innerHTML = '';
    if (!lista.length) {
      cont.innerHTML = '<div class="tarjeta vacio"><span class="vacio-icono">🔍</span>No hay gastos que coincidan.</div>';
      $('boton-ver-mas').hidden = true;
      return;
    }

    // Agrupar por día (solo lo que se muestra, pero con el total del día completo).
    const totalesDia = new Map();
    lista.forEach((g) => { const k = claveDia(g.fechaObj); totalesDia.set(k, (totalesDia.get(k) || 0) + g.importe); });
    let diaActual = null;
    let ul = null;
    lista.slice(0, estado.limite).forEach((g) => {
      const k = claveDia(g.fechaObj);
      if (k !== diaActual) {
        diaActual = k;
        const bloque = document.createElement('div');
        bloque.className = 'dia';
        bloque.innerHTML =
          '<div class="dia-cabecera"><span>' + nombreDia(g.fechaObj) + '</span><span>' + euros.format(totalesDia.get(k)) + '</span></div>' +
          '<div class="tarjeta"><ul class="lista-gastos"></ul></div>';
        cont.appendChild(bloque);
        ul = bloque.querySelector('ul');
      }
      ul.appendChild(filaGasto(g, false));
    });
    $('boton-ver-mas').hidden = lista.length <= estado.limite;
  }

  function claveDia(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

  function nombreDia(d) {
    const hoy = new Date();
    const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
    if (claveDia(d) === claveDia(hoy)) return 'Hoy';
    if (claveDia(d) === claveDia(ayer)) return 'Ayer';
    const texto = fmtDiaLargo.format(d);
    return d.getFullYear() === hoy.getFullYear() ? texto : texto + ' ' + d.getFullYear();
  }

  function filaGasto(g, conFecha) {
    const li = document.createElement('li');
    const meta = (conFecha ? fmtFechaCorta.format(g.fechaObj) + ' · ' : '') + etiqueta(g.carpeta, g.subcarpeta);
    li.innerHTML =
      '<button type="button" class="gasto">' +
        '<span class="gasto-icono" style="--color:' + colorCarpeta(g.carpeta) + '">' + emoji(g.carpeta, g.subcarpeta) + '</span>' +
        '<span class="gasto-textos">' +
          '<span class="gasto-concepto">' + esc(g.concepto || 'Sin concepto') + '</span>' +
          '<span class="gasto-meta">' + esc(meta) + (g.nota ? ' · <span class="gasto-nota">' + esc(g.nota) + '</span>' : '') + '</span>' +
        '</span>' +
        '<span class="gasto-importe">' + euros.format(g.importe) + '</span>' +
      '</button>';
    li.querySelector('button').addEventListener('click', () => abrirEditor(g));
    return li;
  }

  // ───────────────────────────── Viajes ─────────────────────────────

  function pintarViajes() {
    const d = estado.datos;
    const viajes = new Map();
    // Viajes definidos en la hoja (aunque aún no tengan gastos)…
    d.carpetas.forEach((c) => {
      if (c.carpeta === 'Viajes' && c.subcarpeta && c.subcarpeta !== 'Otros') {
        viajes.set(c.subcarpeta, { nombre: c.subcarpeta, archivado: c.archivada, gastos: [] });
      }
    });
    // …y los que aparezcan en los gastos.
    d.gastos.forEach((g) => {
      if (g.carpeta !== 'Viajes' || !g.subcarpeta || g.subcarpeta === 'Otros') return;
      if (!viajes.has(g.subcarpeta)) viajes.set(g.subcarpeta, { nombre: g.subcarpeta, archivado: false, gastos: [] });
      viajes.get(g.subcarpeta).gastos.push(g);
    });

    const hoy = new Date();
    const lista = Array.from(viajes.values()).map((v) => {
      const fechas = v.gastos.map((g) => g.fechaObj).sort((a, b) => a - b);
      const activo = v.nombre === d.viajeActivo;
      const primero = fechas[0] || null;
      const ultimo = activo ? hoy : fechas[fechas.length - 1] || null;
      const dias = primero ? Math.max(1, Math.round((diaSinHora(ultimo) - diaSinHora(primero)) / 864e5) + 1) : 0;
      return Object.assign(v, { total: suma(v.gastos), primero, ultimo, dias, activo });
    }).sort((a, b) => (b.activo - a.activo) || ((b.ultimo || 0) - (a.ultimo || 0)));

    const ul = $('lista-viajes');
    ul.innerHTML = '';
    if (!lista.length) {
      ul.innerHTML = '<li class="tarjeta vacio"><span class="vacio-icono">🧳</span>Aún no hay viajes. Añade uno en la pestaña Carpetas de la hoja (Viajes · nombre).</li>';
      return;
    }
    lista.forEach((v) => {
      const insignia = v.activo ? '<span class="insignia insignia-activa">En curso</span>'
        : v.archivado ? '<span class="insignia">Archivado</span>' : '';
      const fechas = v.primero
        ? fmtFechaCorta.format(v.primero) + ' – ' + (v.activo ? 'hoy' : fmtFechaLarga.format(v.ultimo))
        : 'Sin gastos todavía';
      const li = document.createElement('li');
      li.innerHTML =
        '<button type="button" class="viaje">' +
          '<div class="viaje-cabecera"><span class="viaje-nombre">✈️ ' + esc(v.nombre) + '</span>' + insignia + '</div>' +
          '<div class="viaje-total">' + euros.format(v.total) + '</div>' +
          '<div class="viaje-fechas">' + fechas + '</div>' +
          '<div class="viaje-stats">' +
            '<div><span class="stat-valor">' + v.dias + '</span><span class="stat-etiqueta">' + (v.dias === 1 ? 'día' : 'días') + '</span></div>' +
            '<div><span class="stat-valor">' + (v.dias ? eurosRedondo.format(v.total / v.dias) : '—') + '</span><span class="stat-etiqueta">al día</span></div>' +
            '<div><span class="stat-valor">' + v.gastos.length + '</span><span class="stat-etiqueta">gastos</span></div>' +
          '</div>' +
        '</button>';
      li.querySelector('button').addEventListener('click', () => {
        estado.filtroViaje = v.nombre;
        estado.filtroCarpeta = '';
        irAPestana('gastos');
      });
      ul.appendChild(li);
    });
  }

  function diaSinHora(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  // ───────────────────────────── Editar / borrar ─────────────────────────────

  function abrirEditor(g) {
    estado.editando = g;
    $('editar-importe').value = g.importe;
    $('editar-concepto').value = g.concepto;
    $('editar-nota').value = g.nota;
    $('editar-fecha').value = g.fecha.slice(0, 16);

    const actual = etiqueta(g.carpeta, g.subcarpeta);
    const opciones = estado.datos.carpetas
      .filter((c) => !c.archivada || etiqueta(c.carpeta, c.subcarpeta) === actual)
      .map((c) => etiqueta(c.carpeta, c.subcarpeta));
    if (opciones.indexOf(actual) === -1) opciones.unshift(actual);
    $('editar-carpeta').innerHTML = opciones.map((o) => '<option>' + esc(o) + '</option>').join('');
    $('editar-carpeta').value = actual;

    $('error-editar').hidden = true;
    reiniciarBorrar();
    $('velo').hidden = false;
    $('hoja-editar').hidden = false;
  }

  function cerrarEditor() {
    estado.editando = null;
    $('velo').hidden = true;
    $('hoja-editar').hidden = true;
  }

  function reiniciarBorrar() {
    const b = $('boton-borrar');
    b.classList.remove('confirmar');
    b.textContent = 'Borrar gasto';
  }

  async function guardarEdicion(ev) {
    ev.preventDefault();
    const g = estado.editando;
    if (!g) return;
    const cambios = {};
    const importe = Math.round(parseFloat($('editar-importe').value) * 100) / 100;
    if (importe !== g.importe) cambios.importe = importe;
    const concepto = $('editar-concepto').value.trim();
    if (concepto !== g.concepto) cambios.concepto = concepto;
    const nota = $('editar-nota').value.trim();
    if (nota !== g.nota) cambios.nota = nota;
    const carpeta = $('editar-carpeta').value;
    if (carpeta !== etiqueta(g.carpeta, g.subcarpeta)) cambios.carpeta = carpeta;
    const fecha = $('editar-fecha').value;
    if (fecha !== g.fecha.slice(0, 16)) cambios.fecha = fecha;

    if (!Object.keys(cambios).length) { cerrarEditor(); return; }
    const boton = $('boton-guardar');
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      await enviar(Object.assign({ accion: 'editar', id: g.id }, cambios));
      if (cambios.importe !== undefined) g.importe = importe;
      if (cambios.concepto !== undefined) g.concepto = concepto;
      if (cambios.nota !== undefined) g.nota = nota;
      if (cambios.carpeta !== undefined) {
        const partes = carpeta.split(' / ');
        g.carpeta = partes[0];
        g.subcarpeta = partes[1] || '';
      }
      if (cambios.fecha !== undefined) { g.fecha = fecha; g.fechaObj = new Date(fecha); }
      guardarCache();
      cerrarEditor();
      pintar();
      avisar('✓ Gasto actualizado');
    } catch (e) {
      $('error-editar').textContent = 'No se pudo guardar: ' + e.message;
      $('error-editar').hidden = false;
    } finally {
      boton.disabled = false;
      boton.textContent = 'Guardar';
    }
  }

  async function borrarGasto() {
    const g = estado.editando;
    const b = $('boton-borrar');
    if (!g) return;
    // Primer toque: pedir confirmación. Segundo toque: borrar.
    if (!b.classList.contains('confirmar')) {
      b.classList.add('confirmar');
      b.textContent = '¿Seguro? Toca otra vez para borrar';
      return;
    }
    b.disabled = true;
    b.textContent = 'Borrando…';
    try {
      await enviar({ accion: 'borrar', id: g.id });
      estado.datos.gastos = estado.datos.gastos.filter((x) => x.id !== g.id);
      guardarCache();
      cerrarEditor();
      pintar();
      avisar('🗑 Gasto borrado');
    } catch (e) {
      $('error-editar').textContent = 'No se pudo borrar: ' + e.message;
      $('error-editar').hidden = false;
      reiniciarBorrar();
    } finally {
      b.disabled = false;
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ───────────────────────────── Eventos ─────────────────────────────

  function iniciar() {
    $('form-config').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const url = $('campo-url').value.trim();
      const token = $('campo-token').value.trim();
      $('error-config').hidden = true;
      try {
        estado.datos = await pedirDatos(url, token);
        guardarLocal(CLAVE_URL, url);
        guardarLocal(CLAVE_TOKEN, token);
        cargar();
      } catch (e) {
        $('error-config').textContent = 'No se pudo conectar: ' + e.message;
        $('error-config').hidden = false;
      }
    });
    $('boton-cancelar-config').addEventListener('click', mostrarApp);
    $('boton-ajustes').addEventListener('click', () => mostrarConfig(true));
    $('boton-recargar').addEventListener('click', cargar);

    document.querySelectorAll('.pestanas button').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.pestana === 'gastos' && estado.pestana !== 'gastos') {
          // Entrar desde la barra muestra todo el periodo, sin filtros heredados.
          estado.filtroCarpeta = '';
          estado.filtroViaje = '';
        }
        irAPestana(b.dataset.pestana);
      });
    });
    document.querySelectorAll('[data-ir-a]').forEach((b) => {
      b.addEventListener('click', () => { estado.filtroCarpeta = ''; estado.filtroViaje = ''; irAPestana(b.dataset.irA); });
    });

    document.querySelectorAll('#barra-periodo button').forEach((b) => {
      b.addEventListener('click', () => {
        estado.periodo = b.dataset.periodo;
        estado.limite = GASTOS_POR_PAGINA;
        estado.animar = true;
        pintar();
      });
    });
    $('fecha-desde').addEventListener('change', (e) => { estado.desde = e.target.value || null; pintar(); });
    $('fecha-hasta').addEventListener('change', (e) => { estado.hasta = e.target.value || null; pintar(); });
    $('boton-volver-donut').addEventListener('click', () => { estado.ruta = null; estado.animar = true; pintar(); });

    $('buscador').addEventListener('input', (e) => { estado.busqueda = e.target.value; estado.limite = GASTOS_POR_PAGINA; pintar(); });
    $('filtro-carpeta').addEventListener('change', (e) => { estado.filtroCarpeta = e.target.value; estado.limite = GASTOS_POR_PAGINA; pintar(); });
    $('solo-otros').addEventListener('change', (e) => { estado.soloOtros = e.target.checked; pintar(); });
    $('boton-ver-mas').addEventListener('click', () => { estado.limite += GASTOS_POR_PAGINA; pintar(); });

    $('form-editar').addEventListener('submit', guardarEdicion);
    $('boton-cancelar-editar').addEventListener('click', cerrarEditor);
    $('velo').addEventListener('click', cerrarEditor);
    $('boton-borrar').addEventListener('click', borrarGasto);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && estado.editando) cerrarEditor(); });

    // Repintar al cambiar entre modo claro y oscuro (los gráficos leen los colores al dibujarse).
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => pintar());
    // Al volver a la app desde segundo plano, refrescar.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && estado.datos && !estado.editando) cargar();
    });

    cargar();
  }

  iniciar();
})();
