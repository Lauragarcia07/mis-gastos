# Instalación desde cero

Solo hace falta si se pierde la hoja o se quiere montar en otra cuenta. Ya está hecho para la cuenta actual.

## Requisitos
- Cuenta de Google y cuenta de GitHub.
- Node.js, `git`, `gh` (GitHub CLI) y `clasp` (`npm install -g @google/clasp`).

## 1. API y hoja
1. Activa la API de Apps Script **con la misma cuenta** con la que harás login: https://script.google.com/home/usersettings
2. `clasp login` (elige esa cuenta).
3. Crea la hoja con su script vinculado:
   ```bash
   cd apps-script
   rm .clasp.json                               # el del proyecto anterior
   clasp create --type sheets --title "Mis Gastos" --rootDir .
   git checkout appsscript.json                 # clasp lo sobrescribe con valores por defecto
   clasp push --force
   clasp deploy --description "v1"              # anota el deploymentId (AKfy…)
   ```
4. Abre la hoja → Extensiones → Apps Script → función `configurar` → ▶ Ejecutar → acepta permisos ("Configuración avanzada → Ir a Mis Gastos"). Copia el `TOKEN` del registro.
   - Si el navegador tiene varias cuentas de Google, hazlo en una ventana de incógnito con solo la cuenta dueña.
5. URL de la API: `https://script.google.com/macros/s/<deploymentId>/exec`. Ponla en `dashboard/config.js` y actualiza el deploymentId en `AGENTS.md`.
6. Prueba: `curl -sL "<URL>?accion=menu&token=<TOKEN>"` → debe devolver `"ok":true`.

## 2. Dashboard
1. Sube el repo a GitHub (público) y en *Settings → Pages* elige **Source: GitHub Actions** (o `gh api -X POST repos/<usuario>/<repo>/pages -f build_type=workflow`).
2. El workflow publica `dashboard/` en `https://<usuario>.github.io/<repo>/`.

## 3. Atajos
Sigue [`atajos.md`](atajos.md) con la URL y el token nuevos.
