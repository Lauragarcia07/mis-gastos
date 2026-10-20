# Tareas comunes

## Añadir una carpeta o subcarpeta
1. Abre la hoja → pestaña **Carpetas**.
2. Añade una fila: `carpeta`, `subcarpeta` (vacía si no tiene), casillas `mas_usada` / `archivada`. Si no aparecen casillas en la fila nueva: selecciona las celdas → Insertar → Casilla de verificación.
3. Listo: aparece en el atajo y en el dashboard al momento. No hay que desplegar nada.

**Mover gastos de «Otros» a la carpeta nueva:** en el dashboard activa *Solo «Otros»* y busca por la nota. En la hoja, pestaña **Gastos**, cambia `carpeta`/`subcarpeta` de esas filas (Datos → Crear un filtro ayuda). Escribe los nombres exactamente igual que en Carpetas.

## Renombrar una carpeta
Cámbiala en **Carpetas** y también en las filas de **Gastos** (Editar → Buscar y reemplazar, limitado a esa columna). Si no, los gastos antiguos seguirán apareciendo con el nombre viejo en el dashboard.

## Empezar un viaje
1. Pestaña **Carpetas** → fila nueva: `Viajes` · `Marruecos`.
2. Atajo **Viaje activo** → elige *Marruecos*.

## Cerrar (archivar) un viaje
1. Atajo **Viaje activo** → *Ninguno*.
2. Pestaña **Carpetas** → marca `archivada` en la fila del viaje.

Los gastos se conservan y el viaje sigue en la sección *Viajes* del dashboard con la etiqueta "archivado".

## Cambiar las carpetas del menú rápido
Marca/desmarca `mas_usada` en **Carpetas**. El orden del menú es el orden de las filas.

## Corregir o borrar un gasto
Directamente en la pestaña **Gastos**: edita la celda o borra la fila entera. No toques la columna `id`.

## Cambiar el token (si se ha filtrado)
1. Editor de Apps Script (hoja → Extensiones → Apps Script) → función `regenerarToken` → ▶ Ejecutar → copia el token del registro.
2. Cambia el token en los atajos **Apuntar gasto** y **Viaje activo**.
3. En el dashboard: ⚙︎ → pega el token nuevo (en cada dispositivo).

## Publicar cambios de código
- **Dashboard:** commit + push a `main`. GitHub Actions lo publica en 1–2 minutos.
- **API:** ver «Cómo desplegar cambios» en [`AGENTS.md`](../AGENTS.md). Importante usar siempre el mismo deploymentId para no cambiar la URL.

## Instalar el dashboard en el iPhone
Safari → abre la URL del dashboard → botón Compartir → **Añadir a pantalla de inicio**. La primera vez pide la URL de la API (ya viene rellena) y el token.

## Copia de seguridad
Google Sheets guarda historial (Archivo → Historial de versiones). Para una copia aparte: Archivo → Descargar → .xlsx o .csv.
