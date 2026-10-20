# Arquitectura

```
┌──────────────── iPhone ────────────────┐
│ Automatización "Transacción" (Apple Pay)│──┐
│ Atajo "Apuntar gasto" (manual / Siri)   │──┤  POST accion=anadir
│ Atajo "Viaje activo"                    │──┤  POST accion=viaje
└─────────────────────────────────────────┘  │  GET  accion=menu
                                             ▼
                      ┌──────────────────────────────────────┐
                      │ API: Google Apps Script (web app)    │
                      │ apps-script/Codigo.js                │
                      │ token en Script Properties           │
                      └──────────────┬───────────────────────┘
                                     │ lee / escribe
                      ┌──────────────▼───────────────────────┐
                      │ Google Sheet "Mis Gastos"            │
                      │ pestañas: Gastos · Carpetas · Config │
                      └──────────────▲───────────────────────┘
                                     │ GET accion=datos
                      ┌──────────────┴───────────────────────┐
                      │ Dashboard (GitHub Pages)             │
                      │ dashboard/ — HTML + JS + Chart.js    │
                      └──────────────────────────────────────┘
```

## Decisiones y por qué

| Decisión | Motivo |
|---|---|
| **Atajos de iOS** en vez de una app propia | La automatización "Transacción" rellena importe y comercio al pagar con Apple Pay. Sin App Store, sin código nativo. |
| **Google Sheets** como base de datos | Gratis, editable a mano desde el móvil, copia de seguridad e historial de versiones incluidos. El volumen (cientos o pocos miles de filas al año) es mínimo. |
| **Apps Script** como API | Vive dentro de la hoja, gratis, sin servidor que mantener. |
| **Token compartido** en lugar de login de Google | Los Atajos no pueden hacer OAuth con comodidad. La web app es pública pero toda petición sin el token correcto se rechaza. |
| **Dashboard estático** sin frameworks | Nada que compilar ni actualizar; cualquier IA o persona lo entiende leyendo 3 ficheros. |
| **Colores fijos por carpeta** | Cada carpeta tiene siempre el mismo color (orden de la pestaña Carpetas → 8 tonos de una paleta validada para daltonismo; «Otros» en gris). El donut muestra como máximo 6 trozos (5 + «Resto»); la leyenda lista todas. |
| **POST con `Content-Type: text/plain`** desde el dashboard | Apps Script no responde a la petición previa (preflight) de CORS; con text/plain el navegador no la hace. |
| **Repo público** | GitHub Pages gratis. No contiene datos ni el token. |
| **Solo se guarda tu parte** | Decisión de la usuaria: si pagas 100 € entre 5, se guardan 20 €. No hay seguimiento de deudas. |
| **Carpetas en la hoja**, no en el código | Añadir/archivar carpetas no requiere desplegar nada. |
| **Etiquetas `"Carpeta / Subcarpeta"`** | Es lo que se muestra en el menú del atajo y lo que se envía de vuelta a la API; un único formato en todo el sistema. |

## La hoja

### Gastos
| Columna | Tipo | Ejemplo | Notas |
|---|---|---|---|
| `id` | texto (8 car.) | `5630fab1` | Generado por la API |
| `fecha` | fecha-hora | `2026-10-20 13:28` | Zona Europe/Madrid. Hora del servidor al recibir el gasto |
| `importe` | número | `20` | **Tu parte**, en euros |
| `concepto` | texto | `Mercadona` | En Apple Pay es el comercio |
| `carpeta` | texto | `Ocio` | |
| `subcarpeta` | texto | `Deporte` | Puede estar vacío |
| `nota` | texto | `peluquería` | Se pide al elegir una carpeta «Otros» |
| `origen` | texto | `apple pay` / `manual` | |

Se puede editar a mano (corregir carpeta, importe, borrar filas). Mantén los nombres de carpeta tal y como están en la pestaña Carpetas.

### Carpetas
`carpeta · subcarpeta · mas_usada (casilla) · archivada (casilla)`. Cada fila es una opción elegible. Una fila con subcarpeta vacía significa que la carpeta principal se puede elegir sin subcarpeta (p. ej. `Compras` además de `Compras / Ropa`). El orden de las filas es el orden del menú.

### Config
`clave · valor`. De momento solo `viaje_activo` (nombre de una subcarpeta de Viajes, o vacío).

## Seguridad
- El token es una cadena aleatoria de 32 caracteres guardada en **Script Properties** (no en la hoja).
- Quien tenga el token puede leer y añadir gastos. Si se filtra: ejecutar `regenerarToken()` y actualizar atajos y dashboard (ver `tareas-comunes.md`).
- La web app se ejecuta como la dueña ("Execute as: me") con acceso "Anyone": por eso cualquiera puede *llamarla*, pero sin token solo recibe `Token incorrecto`.

## Límites conocidos
- La automatización de Apple Pay solo salta al pagar con el iPhone/Watch en tienda; Bizum, efectivo y tarjeta física se apuntan con el atajo manual.
- En el extranjero Apple Pay puede dar el importe en moneda local: usa "Otra cantidad" para escribirlo en euros.
- El dashboard carga todos los gastos de golpe. Con decenas de miles de filas habría que paginar o agregar en la API; no es un problema previsible.
