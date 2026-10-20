# Atajos del iPhone

Hay que montar **dos atajos** y **una automatización**:

| Nombre | Tipo | Para qué |
|---|---|---|
| **Apuntar gasto** | Atajo | El "motor": pregunta carpeta y cuánto es tuyo, y lo envía. Se usa a mano (Bizum, efectivo…) y lo llama la automatización. |
| **Viaje activo** | Atajo | Elegir el viaje que sale primero en el menú. |
| **Al pagar con Apple Pay** | Automatización "Transacción" | Llama a *Apuntar gasto* con el importe y el comercio. |

> 💡 **Truco:** los atajos se sincronizan por iCloud. Puedes montarlos en la app **Atajos del Mac** (más cómodo para pegar la URL y el token) y aparecerán en el iPhone. La **automatización** sí hay que crearla en el iPhone.

Necesitas dos valores (te los da quien configuró el proyecto; **no están en este repositorio**):
- **URL de la API**: la de `dashboard/config.js` (termina en `/exec`).
- **TOKEN**: tu clave secreta.

Convenciones de esta guía: **negrita** = nombre de la acción (búscala en el buscador de acciones); `Nombre` = variable; "texto" = lo que escribes.

---

## 1. Atajo «Apuntar gasto»

Crear atajo nuevo → nombre **Apuntar gasto**. En sus ajustes (ⓘ): activa **Mostrar en hoja de compartir: no** y **Entrada: cualquiera** (si lo pregunta).

### Bloque A — Datos de conexión
1. **Texto** → pega la URL de la API → **Establecer variable** `URL`.
2. **Texto** → pega el TOKEN → **Establecer variable** `TOKEN`.

### Bloque B — ¿De dónde viene el gasto?
3. **Si** `Entrada del atajo` **tiene algún valor**
   1. **Obtener valor del diccionario** → *Valor* para la clave "importe" en `Entrada del atajo` → **Establecer variable** `Importe`.
   2. **Obtener valor del diccionario** → *Valor* para la clave "concepto" en `Entrada del atajo` → **Establecer variable** `Concepto`.
   3. **Texto** "apple pay" → **Establecer variable** `Origen`.
4. **De lo contrario**
   1. **Solicitar entrada** → tipo *Número*, pregunta "¿Cuánto has pagado (€)?" → **Establecer variable** `Importe`.
   2. **Solicitar entrada** → tipo *Texto*, pregunta "¿Concepto?" → **Establecer variable** `Concepto`.
   3. **Texto** "manual" → **Establecer variable** `Origen`.
5. **Finalizar si**

### Bloque C — Elegir carpeta
6. **Texto** → `URL`?accion=menu&token=`TOKEN` (inserta las variables tocando en "Variables").
7. **Obtener contenido de URL** (de la acción anterior). Método GET.
8. **Establecer variable** `Menú` (con el resultado anterior).
9. **Obtener valor del diccionario** → *Valor* para la clave "principales" en `Menú`.
10. **Elegir de la lista** → solicitud: "`Importe` · `Concepto`" → **Establecer variable** `Carpeta`.
11. **Si** `Carpeta` **es** "Más…"
    1. **Obtener valor del diccionario** → "todas" en `Menú`.
    2. **Elegir de la lista** → solicitud "Todas las carpetas" → **Establecer variable** `Carpeta`.
12. **Finalizar si**

### Bloque D — Nota para «Otros»
13. **Si** `Carpeta` **contiene** "Otros"
    1. **Solicitar entrada** → *Texto*, "Nota (qué era)" → **Establecer variable** `Nota`.
14. **Finalizar si**

### Bloque E — ¿Cuánto es tuyo?
15. **Elegir del menú** → solicitud "¿Cuánto es tuyo?" con tres opciones: "Todo", "Dividir entre…", "Otra cantidad".
    - **Todo:** (no añadas nada)
    - **Dividir entre…:** **Solicitar entrada** → *Número*, "¿Entre cuántas personas?" → **Establecer variable** `Partes`.
    - **Otra cantidad:** **Solicitar entrada** → *Número*, "¿Cuánto es tuyo (€)?" → **Establecer variable** `MiParte`.
16. **Finalizar menú**

### Bloque F — Enviar
17. **Obtener contenido de URL** → URL: `URL`. Despliega *Mostrar más*:
    - Método: **POST**
    - Cuerpo de la solicitud: **JSON**, con estos campos (todos de tipo *Texto*):

      | Clave | Valor |
      |---|---|
      | token | `TOKEN` |
      | accion | anadir |
      | importe | `Importe` |
      | dividir_entre | `Partes` |
      | mi_parte | `MiParte` |
      | concepto | `Concepto` |
      | carpeta | `Carpeta` |
      | nota | `Nota` |
      | origen | `Origen` |
18. **Establecer variable** `Respuesta`.
19. **Obtener valor del diccionario** → "ok" en `Respuesta`.
20. **Si** (resultado) **es** "1" *(en algunas versiones aparece como "Verdadero"; si no funciona, usa* **contiene** *"1")*
    1. **Obtener valor del diccionario** → "mensaje" en `Respuesta`.
    2. **Mostrar notificación** → "✅ Guardado: " + (resultado).
21. **De lo contrario**
    1. **Obtener valor del diccionario** → "error" en `Respuesta`.
    2. **Mostrar alerta** → "❌ No se ha guardado: " + (resultado).
22. **Finalizar si**

Las variables que no se usan (por ejemplo `Partes` si eliges "Todo") se envían vacías y la API las ignora.

### Cómo lanzarlo a mano
- **Widget:** mantén pulsada la pantalla de inicio → **+** → Atajos → elige *Apuntar gasto*.
- **Botón de Acción** (iPhone 15 Pro o posterior): Ajustes → Botón de Acción → Atajo → *Apuntar gasto*.
- **Siri:** "Oye Siri, apuntar gasto".

### Prueba
Ejecútalo a mano: 1 € · concepto "PRUEBA" · Otros / Otros · Todo. Debe salir "✅ Guardado: 1,00 € · Otros / Otros" y aparecer la fila en la hoja. Bórrala después.

---

## 2. Automatización «Al pagar con Apple Pay»

En el **iPhone**: app Atajos → pestaña **Automatización** → **+** (Nueva automatización) → **Transacción**.
1. **Tarjeta:** todas tus tarjetas. **Categorías / comercios:** todos.
2. Marca **Ejecutar inmediatamente** y desactiva *Notificar al ejecutarse*.
3. **Siguiente** → **Nueva automatización en blanco** y añade:
   1. **Diccionario** con dos claves de tipo *Texto*:
      - "importe" → variable `Entrada del atajo` → toca la variable y elige la propiedad **Importe**.
      - "concepto" → `Entrada del atajo` → propiedad **Comercio**.
   2. **Ejecutar atajo** → *Apuntar gasto*, con entrada: el **Diccionario** anterior. (Desactiva *Mostrar mientras se ejecuta* si aparece, para que no se abra la app.)
4. **OK**.

### Prueba
Paga algo pequeño con Apple Pay (un café). Debe aparecer el menú de carpetas con el importe y el comercio arriba.

---

## 3. Atajo «Viaje activo»

1. **Texto** → URL → **Establecer variable** `URL`. **Texto** → TOKEN → **Establecer variable** `TOKEN`.
2. **Texto** → `URL`?accion=menu&token=`TOKEN` → **Obtener contenido de URL**.
3. **Obtener valor del diccionario** → "viajes".
4. **Elegir de la lista** → solicitud "¿Qué viaje está activo?" → **Establecer variable** `Viaje`.
5. **Obtener contenido de URL** → `URL`, método **POST**, cuerpo **JSON**: token=`TOKEN`, accion="viaje", viaje=`Viaje`.
6. **Obtener valor del diccionario** → "mensaje" → **Mostrar notificación**.

---

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| "Token incorrecto" | El TOKEN del atajo no coincide (¿se regeneró?). Cámbialo en los dos atajos. |
| "No existe la carpeta …" | Se renombró una carpeta en la hoja mientras el menú estaba abierto. Vuelve a lanzar el atajo. |
| La automatización no salta | Solo funciona al pagar con Apple Pay en tienda. Revisa que *Ejecutar inmediatamente* esté activo. |
| El importe sale en otra moneda | Elige "Otra cantidad" y escríbelo en euros. |
| El atajo no hace nada / error de red | Sin conexión. Apúntalo a mano más tarde o directamente en la hoja. |
