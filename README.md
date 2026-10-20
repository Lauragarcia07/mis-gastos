# 💶 Mis Gastos

Sistema personal para **apuntar gastos desde el iPhone en segundos** y **ver en qué se va el dinero**, organizado por carpetas (Supermercado, Ocio / Deporte, Viajes / Islandia…).

- **Apuntar:** al pagar con Apple Pay salta un menú con el importe y el comercio ya rellenos; solo eliges carpeta y cuánto es tuyo. Para Bizum o efectivo hay un atajo manual.
- **Guardar:** todo va a una hoja de Google Sheets que puedes abrir y editar a mano.
- **Ver:** un dashboard web (móvil y PC) con totales, gasto por carpeta, evolución mensual, viajes y lista de gastos.

Coste: 0 €. Los datos viven solo en Google Drive; este repositorio contiene únicamente código.

## Cómo funciona

```
 📱 Atajos del iPhone ──POST──▶ 🔌 API (Google Apps Script) ──▶ 📊 Google Sheet
                                        ▲
 📈 Dashboard (GitHub Pages) ───GET─────┘
```

| Pieza | Dónde está | Código |
|---|---|---|
| Hoja de cálculo "Mis Gastos" | Google Drive | — |
| API | Apps Script vinculado a la hoja | [`apps-script/`](apps-script/) |
| Atajos "Apuntar gasto" y "Viaje activo" + automatización Apple Pay | App Atajos del iPhone | Guía en [`docs/atajos.md`](docs/atajos.md) |
| Dashboard | GitHub Pages | [`dashboard/`](dashboard/) |

## Uso diario

1. **Pagas con Apple Pay** → eliges carpeta → eliges "Todo / Dividir entre… / Otra cantidad" → ✅ guardado.
2. **Bizum / efectivo / tarjeta física** → widget, botón de Acción o "Oye Siri, apunta gasto".
3. **De viaje** → atajo "Viaje activo" → elige el viaje; saldrá el primero en el menú. Al volver, "Ninguno".
4. **Ver gastos** → abre el dashboard (icono en la pantalla de inicio).

Solo se guarda **tu parte** de cada gasto: si pagas 100 € entre 5, se guardan 20 €.

## Carpetas

Se gestionan en la pestaña **Carpetas** de la hoja (sin tocar código):

| Columna | Significado |
|---|---|
| `carpeta` | Carpeta principal (Casa, Ocio, Viajes…) |
| `subcarpeta` | Vacío = la carpeta principal se puede elegir tal cual |
| `mas_usada` | ✅ = sale en el menú rápido del atajo |
| `archivada` | ✅ = deja de salir en el menú (los gastos se conservan) |

Cuando algo no encaja, va a una carpeta **«Otros»** con una nota; luego se crea la carpeta nueva y se mueven esos gastos. Ver [`docs/tareas-comunes.md`](docs/tareas-comunes.md).

## Documentación

- [`docs/arquitectura.md`](docs/arquitectura.md) — cómo encajan las piezas y por qué.
- [`docs/api.md`](docs/api.md) — referencia de la API.
- [`docs/atajos.md`](docs/atajos.md) — montar los atajos del iPhone paso a paso.
- [`docs/tareas-comunes.md`](docs/tareas-comunes.md) — añadir carpetas, archivar viajes, publicar cambios, cambiar el token…
- [`docs/instalacion.md`](docs/instalacion.md) — montar todo desde cero (por si hubiera que rehacerlo).
- [`AGENTS.md`](AGENTS.md) — instrucciones para asistentes de IA que trabajen en este repo.
