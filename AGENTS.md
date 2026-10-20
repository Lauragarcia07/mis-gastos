# Instrucciones para asistentes de IA

Lee esto antes de tocar nada. El proyecto es pequeño a propósito: mantenlo así.

## Qué es
Registro personal de gastos. Los gastos se apuntan desde Atajos de iOS, se guardan en una hoja de Google Sheets a través de una API en Apps Script, y se visualizan en un dashboard estático en GitHub Pages. Detalle en `docs/arquitectura.md`.

La dueña del proyecto sabe algo de programación pero prefiere que la IA haga los cambios y le explique lo justo. Idioma del proyecto: **español** (código, comentarios, documentación y textos de la interfaz).

## Estructura

```
apps-script/          API (Google Apps Script, vinculado a la hoja "Mis Gastos")
  Codigo.js           Todo el backend: doGet/doPost, acciones, utilidades
  appsscript.json     Manifiesto (zona horaria Europe/Madrid, web app pública con token)
  .clasp.json         scriptId del proyecto para `clasp`
dashboard/            Web estática publicada en GitHub Pages (sin build, sin frameworks)
  index.html          Estructura
  styles.css          Estilos (tokens de color claros/oscuros en :root)
  app.js              Lógica: carga datos, pestañas (Resumen/Gastos/Viajes), gráficos, edición
  config.js           URL pública de la API (nunca el token)
docs/                 Documentación para humanos e IAs
.github/workflows/    Publicación automática del dashboard
```

## Reglas

1. **Nunca subas el token** al repositorio (es público). El token vive en: Script Properties de Apps Script, los atajos del iPhone y el localStorage del navegador.
2. **Nunca subas datos de gastos** al repositorio.
3. **Solo se guarda la parte del usuario** de cada gasto (columna `importe`). No añadas "importe total" ni deudas: se descartó expresamente.
4. Las **carpetas son datos, no código**: viven en la pestaña `Carpetas`. No las metas en el código (salvo `CARPETAS_INICIALES`, que solo se usa al crear la hoja).
5. **Compatibilidad con los atajos**: el formato de etiqueta de carpeta es `"Carpeta / Subcarpeta"` y las respuestas tienen `ok`, `mensaje` / `error`. Si cambias la API, no rompas los campos existentes; añade campos nuevos. Si es inevitable, actualiza `docs/atajos.md` y avisa a la usuaria de que tiene que tocar los atajos.
6. **Dashboard sin dependencias nuevas** salvo justificación. Chart.js va fijado por versión desde cdnjs.
   - Diseño **móvil primero** (la usuaria lo mira en el iPhone). Prueba siempre a ~390 px de ancho, en claro y oscuro.
   - Colores de carpeta: tokens `--c1…--c8` y `--c-gris` en `styles.css`; el orden lo da la pestaña Carpetas. No cicles colores ni generes tonos nuevos: lo que no cabe va en gris.
   - Donut: máximo 6 trozos (5 + «Resto»). Barras apiladas: mismas reglas.
   - Escrituras desde el navegador: `fetch` POST con `Content-Type: text/plain` (ver `enviar()` en app.js).
7. Mantén la documentación al día: si cambias comportamiento, actualiza `docs/` y el README en el mismo cambio.

## Cómo desplegar cambios

**API (Apps Script)** — requiere `clasp` con sesión iniciada en la cuenta dueña de la hoja (`lauragarciaalfocea7@gmail.com`):
```bash
cd apps-script
clasp push --force
clasp deploy -i AKfycbzZC7-b3Ik2H04eGfJJ2rYdyuzx0ttphyCRKlkEJ_cyIuCzYKsdl7mB89eyu_QWx0e1 --description "qué cambia"
```
Usa **siempre** `-i <deploymentId>` para conservar la URL; sin `-i` se crea una URL nueva y los atajos y el dashboard dejarían de funcionar. Si añades permisos (scopes) nuevos, la usuaria tendrá que volver a autorizar ejecutando una función desde el editor.

**Dashboard** — basta con hacer push a `main`; el workflow `.github/workflows/pages.yml` lo publica.

## Cómo probar

- Sintaxis: `node --check apps-script/Codigo.js dashboard/app.js`
- API en vivo (pide el token a la usuaria, no lo inventes ni lo guardes en ficheros):
  ```bash
  U=<apiUrl de dashboard/config.js>; T=<token>
  curl -sL "$U?accion=menu&token=$T"
  curl -sL -H 'Content-Type: application/json' --data '{"token":"'$T'","accion":"anadir","importe":1,"carpeta":"Otros / Otros","concepto":"PRUEBA"}' "$U"
  ```
  Con `curl`, **no** uses `-X POST` (rompe la redirección de Google; el POST se ejecuta pero no ves la respuesta). Borra siempre los gastos de prueba con `accion: borrar`.
- Dashboard en local: `python3 -m http.server -d dashboard 8000` y abre http://localhost:8000.
