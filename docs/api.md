# API

URL base: la que figura en `dashboard/config.js` (`…/exec`). Todas las respuestas son JSON con `ok: true|false`; si `ok` es `false`, hay un campo `error` con el motivo.

Todas las peticiones llevan `token`. Si no coincide: `{"ok":false,"error":"Token incorrecto"}`.

> Google responde con una redirección 302. Atajos y navegadores la siguen bien. Con `curl` usa `-L` y **no** `-X POST` (pasa los datos con `--data` y deja que curl decida).

## GET `?accion=datos&token=…`
Lo que usa el dashboard.
```json
{
  "ok": true,
  "gastos": [
    {"id":"5630fab1","fecha":"2026-10-20T13:28","importe":20,"concepto":"Cena","carpeta":"Viajes","subcarpeta":"Islandia","nota":"","origen":"apple pay"}
  ],
  "carpetas": [{"carpeta":"Ocio","subcarpeta":"Deporte","mas_usada":false,"archivada":false}],
  "viajeActivo": "Islandia"
}
```

## GET `?accion=menu&token=…`
Listas para "Elegir de la lista" en Atajos.
```json
{
  "ok": true,
  "principales": ["Viajes / Islandia", "Casa", "Supermercado", "Comida fuera", "Transporte", "Ocio / Otros", "Más…"],
  "todas": ["Casa", "Supermercado", "…", "Otros / Otros"],
  "viajes": ["Ninguno", "Islandia"],
  "viajeActivo": "Islandia"
}
```
- `principales`: viaje activo (si hay) + carpetas con `mas_usada` + `"Más…"` al final.
- `todas`: todas las carpetas no archivadas, en el orden de la hoja.
- `viajes`: `"Ninguno"` + subcarpetas de Viajes no archivadas (excepto `Otros`).

## POST `accion: "anadir"`
Cuerpo JSON:

| Campo | Obligatorio | Descripción |
|---|---|---|
| `token` | sí | |
| `accion` | sí | `"anadir"` |
| `importe` | sí | Lo pagado. Número o texto: `12.4`, `"12,40 €"`, `"1.234,56"` |
| `carpeta` | sí | Etiqueta tal cual sale en el menú: `"Ocio / Deporte"`, `"Supermercado"`. Tiene que existir en Carpetas (no distingue mayúsculas) |
| `dividir_entre` | no | Entero ≥ 1. Se guarda `importe / dividir_entre` |
| `mi_parte` | no | Si viene (no vacío), se guarda esto e ignora lo anterior |
| `concepto` | no | |
| `nota` | no | |
| `origen` | no | Por defecto `"manual"` |
| `fecha` | no | ISO (`2026-10-20T13:28`). Por defecto, ahora |

Solo se guarda el importe final (tu parte), redondeado a céntimos.

Respuesta:
```json
{"ok":true,"id":"5630fab1","importe":20,"mensaje":"20,00 € · Ocio / Otros"}
```

## POST `accion: "viaje"`
`{"token":"…","accion":"viaje","viaje":"Islandia"}` — `"Ninguno"` o `""` lo desactiva. El viaje tiene que existir en Viajes y no estar archivado.
```json
{"ok":true,"viajeActivo":"Islandia","mensaje":"Viaje activo: Islandia"}
```

## POST `accion: "borrar"`
`{"token":"…","accion":"borrar","id":"5630fab1"}`
```json
{"ok":true,"id":"5630fab1","mensaje":"Gasto borrado"}
```

## Funciones para ejecutar desde el editor de Apps Script
- `configurar()` — crea pestañas que falten, carpetas iniciales y token. Idempotente.
- `regenerarToken()` — crea un token nuevo (el anterior deja de valer).
