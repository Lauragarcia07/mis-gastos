/**
 * Mis Gastos — API
 *
 * Script vinculado a la hoja de Google "Mis Gastos". Se publica como aplicación
 * web y hace de API para:
 *   - los Atajos del iPhone (añadir gastos, consultar el menú, cambiar el viaje activo)
 *   - el dashboard web (leer todos los gastos y carpetas)
 *
 * Todas las peticiones llevan un `token` que tiene que coincidir con la
 * propiedad de script TOKEN (la crea `configurar()`).
 *
 * Ver docs/api.md para el detalle de cada acción.
 */

const HOJA_GASTOS = 'Gastos';
const HOJA_CARPETAS = 'Carpetas';
const HOJA_CONFIG = 'Config';

const COLUMNAS_GASTOS = ['id', 'fecha', 'importe', 'concepto', 'carpeta', 'subcarpeta', 'nota', 'origen'];
const COLUMNAS_CARPETAS = ['carpeta', 'subcarpeta', 'mas_usada', 'archivada'];
const COLUMNAS_CONFIG = ['clave', 'valor'];

// Solo se usan la primera vez, para rellenar la pestaña Carpetas.
// Después, las carpetas se editan directamente en la hoja.
const CARPETAS_INICIALES = [
  // [carpeta, subcarpeta, mas_usada, archivada]
  ['Casa', '', true, false],
  ['Supermercado', '', true, false],
  ['Comida fuera', '', true, false],
  ['Transporte', '', true, false],
  ['Ocio', 'Deporte', false, false],
  ['Ocio', 'Otros', true, false],
  ['Compras', '', false, false],
  ['Compras', 'Ropa', false, false],
  ['Suscripciones', '', false, false],
  ['Viajes', 'Islandia', false, false],
  ['Viajes', 'Otros', false, false],
  ['Otros', 'Regalos', false, false],
  ['Otros', 'Otros', false, false],
];

const SEPARADOR = ' / ';
const OPCION_MAS = 'Más…';
const SIN_VIAJE = 'Ninguno';
const ZONA_HORARIA = 'Europe/Madrid';

// ───────────────────────────── Configuración inicial ─────────────────────────────

/**
 * Ejecutar UNA vez desde el editor de Apps Script (o con `clasp run configurar`).
 * Crea las pestañas que falten, rellena las carpetas iniciales y genera el token.
 * Es seguro volver a ejecutarla: no borra nada que ya exista.
 */
function configurar() {
  const libro = SpreadsheetApp.getActiveSpreadsheet();

  const gastos = obtenerOCrearHoja_(libro, HOJA_GASTOS, COLUMNAS_GASTOS);
  gastos.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm');
  gastos.getRange('C:C').setNumberFormat('#,##0.00 €');

  const carpetas = obtenerOCrearHoja_(libro, HOJA_CARPETAS, COLUMNAS_CARPETAS);
  if (carpetas.getLastRow() === 1) {
    carpetas.getRange(2, 1, CARPETAS_INICIALES.length, 4).setValues(CARPETAS_INICIALES);
  }
  carpetas.getRange('C2:D').insertCheckboxes();

  const config = obtenerOCrearHoja_(libro, HOJA_CONFIG, COLUMNAS_CONFIG);
  if (config.getLastRow() === 1) {
    config.appendRow(['viaje_activo', '']);
  }

  // La pestaña "Hoja 1" que crea Google por defecto sobra.
  const porDefecto = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1');
  if (porDefecto && libro.getSheets().length > 1) libro.deleteSheet(porDefecto);

  const propiedades = PropertiesService.getScriptProperties();
  if (!propiedades.getProperty('TOKEN')) {
    propiedades.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  Logger.log('TOKEN: ' + propiedades.getProperty('TOKEN'));
  return { token: propiedades.getProperty('TOKEN') };
}

/** Genera un token nuevo. Los atajos y el dashboard dejarán de funcionar hasta poner el nuevo. */
function regenerarToken() {
  const token = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  Logger.log('TOKEN nuevo: ' + token);
  return { token: token };
}

function obtenerOCrearHoja_(libro, nombre, columnas) {
  let hoja = libro.getSheetByName(nombre);
  if (!hoja) hoja = libro.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(columnas);
    hoja.getRange(1, 1, 1, columnas.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
  return hoja;
}

// ───────────────────────────── Entradas HTTP ─────────────────────────────

function doGet(e) {
  return responder_(function () {
    const p = (e && e.parameter) || {};
    comprobarToken_(p.token);
    switch (p.accion || 'datos') {
      case 'datos': return leerDatos_();
      case 'menu': return construirMenu_();
      default: throw new Error('Acción desconocida: ' + p.accion);
    }
  });
}

function doPost(e) {
  return responder_(function () {
    let cuerpo = {};
    if (e && e.postData && e.postData.contents) {
      try {
        cuerpo = JSON.parse(e.postData.contents);
      } catch (err) {
        throw new Error('El cuerpo de la petición no es JSON válido');
      }
    }
    // Los atajos también pueden mandar los campos como formulario.
    if (e && e.parameter) {
      Object.keys(e.parameter).forEach(function (k) {
        if (cuerpo[k] === undefined) cuerpo[k] = e.parameter[k];
      });
    }
    comprobarToken_(cuerpo.token);
    switch (cuerpo.accion) {
      case 'anadir': return anadirGasto_(cuerpo);
      case 'viaje': return cambiarViajeActivo_(cuerpo.viaje);
      case 'borrar': return borrarGasto_(cuerpo.id);
      case 'editar': return editarGasto_(cuerpo);
      default: throw new Error('Acción desconocida: ' + cuerpo.accion);
    }
  });
}

function responder_(fn) {
  let salida;
  try {
    salida = Object.assign({ ok: true }, fn());
  } catch (err) {
    salida = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(salida))
    .setMimeType(ContentService.MimeType.JSON);
}

function comprobarToken_(token) {
  const esperado = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!esperado) throw new Error('Falta configurar el token: ejecuta configurar()');
  if (!token || String(token) !== esperado) throw new Error('Token incorrecto');
}

// ───────────────────────────── Acciones ─────────────────────────────

/** Todo lo que necesita el dashboard. */
function leerDatos_() {
  const filas = leerFilas_(HOJA_GASTOS);
  const gastos = filas
    .filter(function (f) { return f.fecha !== '' && f.importe !== ''; })
    .map(function (f) {
      return {
        id: String(f.id),
        fecha: f.fecha instanceof Date
          ? Utilities.formatDate(f.fecha, ZONA_HORARIA, "yyyy-MM-dd'T'HH:mm")
          : String(f.fecha),
        importe: Number(f.importe),
        concepto: String(f.concepto),
        carpeta: String(f.carpeta),
        subcarpeta: String(f.subcarpeta),
        nota: String(f.nota),
        origen: String(f.origen),
      };
    });
  return {
    gastos: gastos,
    carpetas: leerCarpetas_(),
    viajeActivo: leerConfig_('viaje_activo'),
  };
}

/**
 * Listas listas para usar en "Elegir de la lista" de Atajos.
 *   principales: viaje activo (si hay) + carpetas marcadas como más usadas + "Más…"
 *   todas:       todas las carpetas no archivadas
 *   viajes:      "Ninguno" + viajes no archivados (para el atajo "Viaje activo")
 */
function construirMenu_() {
  const activas = leerCarpetas_().filter(function (c) { return !c.archivada; });
  const todas = activas.map(etiqueta_);

  const principales = [];
  const viaje = leerConfig_('viaje_activo');
  if (viaje) principales.push(etiqueta_({ carpeta: 'Viajes', subcarpeta: viaje }));
  activas.forEach(function (c) {
    const e = etiqueta_(c);
    if (c.mas_usada && principales.indexOf(e) === -1) principales.push(e);
  });
  // "Más…" solo tiene sentido si queda alguna carpeta fuera del menú rápido.
  const faltaAlguna = todas.some(function (e) { return principales.indexOf(e) === -1; });
  if (faltaAlguna) principales.push(OPCION_MAS);

  const viajes = [SIN_VIAJE].concat(activas
    .filter(function (c) { return c.carpeta === 'Viajes' && c.subcarpeta && c.subcarpeta !== 'Otros'; })
    .map(function (c) { return c.subcarpeta; }));

  return { principales: principales, todas: todas, viajes: viajes, viajeActivo: viaje };
}

/**
 * Guarda un gasto. Solo se guarda TU parte:
 *   - si llega `mi_parte`, se usa tal cual;
 *   - si no, `importe` / `dividir_entre` (por defecto 1).
 */
function anadirGasto_(d) {
  const total = parsearImporte_(d.importe);
  let importe;
  if (d.mi_parte !== undefined && String(d.mi_parte).trim() !== '') {
    importe = parsearImporte_(d.mi_parte);
  } else {
    const partes = d.dividir_entre ? parseInt(d.dividir_entre, 10) : 1;
    if (!(partes >= 1)) throw new Error('"dividir_entre" tiene que ser un número entero mayor que 0');
    importe = total / partes;
  }
  importe = Math.round(importe * 100) / 100;
  if (!(importe > 0)) throw new Error('El importe tiene que ser mayor que 0');

  const destino = resolverCarpeta_(d.carpeta);
  const fecha = d.fecha ? new Date(d.fecha) : new Date();
  if (isNaN(fecha.getTime())) throw new Error('Fecha no válida: ' + d.fecha);

  const fila = [
    Utilities.getUuid().slice(0, 8),
    fecha,
    importe,
    String(d.concepto || '').trim(),
    destino.carpeta,
    destino.subcarpeta,
    String(d.nota || '').trim(),
    String(d.origen || 'manual').trim(),
  ];

  const cerrojo = LockService.getScriptLock();
  cerrojo.waitLock(10000);
  try {
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_GASTOS).appendRow(fila);
  } finally {
    cerrojo.releaseLock();
  }

  return {
    id: fila[0],
    importe: importe,
    mensaje: formatearEuros_(importe) + ' · ' + etiqueta_(destino),
  };
}

function cambiarViajeActivo_(viaje) {
  viaje = String(viaje || '').trim();
  if (viaje === SIN_VIAJE) viaje = '';
  if (viaje) {
    const existe = leerCarpetas_().some(function (c) {
      return c.carpeta === 'Viajes' && c.subcarpeta === viaje && !c.archivada;
    });
    if (!existe) throw new Error('No existe el viaje "' + viaje + '" (o está archivado)');
  }
  escribirConfig_('viaje_activo', viaje);
  return { viajeActivo: viaje, mensaje: viaje ? 'Viaje activo: ' + viaje : 'Sin viaje activo' };
}

function borrarGasto_(id) {
  id = String(id || '').trim();
  if (!id) throw new Error('Falta el id del gasto');
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_GASTOS);
  const ids = hoja.getRange(1, 1, hoja.getLastRow(), 1).getValues();
  for (let i = ids.length - 1; i >= 1; i--) {
    if (String(ids[i][0]) === id) {
      hoja.deleteRow(i + 1);
      return { id: id, mensaje: 'Gasto borrado' };
    }
  }
  throw new Error('No existe ningún gasto con id ' + id);
}

/**
 * Cambia campos de un gasto existente. Solo se tocan los campos que vengan:
 * carpeta ("Ocio / Deporte"), importe, concepto, nota, fecha.
 */
function editarGasto_(d) {
  const id = String(d.id || '').trim();
  if (!id) throw new Error('Falta el id del gasto');
  const col = function (nombre) { return COLUMNAS_GASTOS.indexOf(nombre) + 1; };
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_GASTOS);
  const ids = hoja.getRange(1, 1, hoja.getLastRow(), 1).getValues();
  let fila = -1;
  for (let i = 1; i < ids.length; i++) {
    if (String(ids[i][0]) === id) { fila = i + 1; break; }
  }
  if (fila === -1) throw new Error('No existe ningún gasto con id ' + id);

  if (d.carpeta !== undefined) {
    const destino = resolverCarpeta_(d.carpeta);
    hoja.getRange(fila, col('carpeta'), 1, 2).setValues([[destino.carpeta, destino.subcarpeta]]);
  }
  if (d.importe !== undefined) {
    const importe = Math.round(parsearImporte_(d.importe) * 100) / 100;
    if (!(importe > 0)) throw new Error('El importe tiene que ser mayor que 0');
    hoja.getRange(fila, col('importe')).setValue(importe);
  }
  if (d.concepto !== undefined) hoja.getRange(fila, col('concepto')).setValue(String(d.concepto).trim());
  if (d.nota !== undefined) hoja.getRange(fila, col('nota')).setValue(String(d.nota).trim());
  if (d.fecha !== undefined) {
    const fecha = new Date(d.fecha);
    if (isNaN(fecha.getTime())) throw new Error('Fecha no válida: ' + d.fecha);
    hoja.getRange(fila, col('fecha')).setValue(fecha);
  }
  return { id: id, mensaje: 'Gasto actualizado' };
}

// ───────────────────────────── Utilidades ─────────────────────────────

function leerFilas_(nombreHoja) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombreHoja);
  if (!hoja) throw new Error('No existe la pestaña "' + nombreHoja + '": ejecuta configurar()');
  const valores = hoja.getDataRange().getValues();
  const cabecera = valores.shift().map(function (c) { return String(c).trim(); });
  return valores.map(function (fila) {
    const obj = {};
    cabecera.forEach(function (col, i) { obj[col] = fila[i]; });
    return obj;
  });
}

function leerCarpetas_() {
  return leerFilas_(HOJA_CARPETAS)
    .filter(function (f) { return String(f.carpeta).trim() !== ''; })
    .map(function (f) {
      return {
        carpeta: String(f.carpeta).trim(),
        subcarpeta: String(f.subcarpeta).trim(),
        mas_usada: f.mas_usada === true,
        archivada: f.archivada === true,
      };
    });
}

function leerConfig_(clave) {
  const fila = leerFilas_(HOJA_CONFIG).filter(function (f) { return f.clave === clave; })[0];
  return fila ? String(fila.valor).trim() : '';
}

function escribirConfig_(clave, valor) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_CONFIG);
  const claves = hoja.getRange(1, 1, hoja.getLastRow(), 1).getValues();
  for (let i = 1; i < claves.length; i++) {
    if (claves[i][0] === clave) {
      hoja.getRange(i + 1, 2).setValue(valor);
      return;
    }
  }
  hoja.appendRow([clave, valor]);
}

/** "Ocio / Deporte" → {carpeta: 'Ocio', subcarpeta: 'Deporte'}. Tiene que existir en Carpetas. */
function resolverCarpeta_(etiqueta) {
  const texto = String(etiqueta || '').trim();
  if (!texto) throw new Error('Falta la carpeta');
  const partes = texto.split('/').map(function (s) { return s.trim(); });
  const buscada = { carpeta: partes[0], subcarpeta: partes[1] || '' };
  const existe = leerCarpetas_().some(function (c) {
    return c.carpeta.toLowerCase() === buscada.carpeta.toLowerCase()
      && c.subcarpeta.toLowerCase() === buscada.subcarpeta.toLowerCase();
  });
  if (!existe) throw new Error('No existe la carpeta "' + texto + '" en la pestaña Carpetas');
  return buscada;
}

function etiqueta_(c) {
  return c.subcarpeta ? c.carpeta + SEPARADOR + c.subcarpeta : c.carpeta;
}

/**
 * Convierte lo que manda Apple Pay o el usuario en un número.
 * Acepta: 12.4 · "12,40 €" · "€12.40" · "1.234,56" · "1,234.56" · "1.500"
 */
function parsearImporte_(valor) {
  if (typeof valor === 'number') return valor;
  let s = String(valor || '').replace(/[^\d.,-]/g, '');
  if (!s) throw new Error('Importe no válido: "' + valor + '"');
  const ultimaComa = s.lastIndexOf(',');
  const ultimoPunto = s.lastIndexOf('.');
  if (ultimaComa !== -1 && ultimoPunto !== -1) {
    // El que aparece más tarde es el separador decimal.
    s = ultimaComa > ultimoPunto
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (ultimaComa !== -1) {
    s = s.replace(',', '.');
  } else if (ultimoPunto !== -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // "1.500" = mil quinientos
  }
  const n = parseFloat(s);
  if (isNaN(n)) throw new Error('Importe no válido: "' + valor + '"');
  return n;
}

function formatearEuros_(n) {
  return n.toFixed(2).replace('.', ',') + ' €';
}
