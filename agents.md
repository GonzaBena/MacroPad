# Instrucciones para Agentes y Asistentes de IA (agents.md)

Este documento contiene las reglas, contexto y mejores prácticas del proyecto **PokePad**. Cualquier asistente de IA o agente que trabaje en este código debe leer y adherirse estrictamente a estas directrices.

## 1. Contexto del Proyecto
**PokePad** es una aplicación de escritorio construida con Electron. Su propósito principal es conectarse a un dispositivo serial (como un Arduino), escuchar "señales" (strings enviadas por el dispositivo) y ejecutar flujos de acciones programadas (atajos de teclado, control multimedia, ejecución de comandos, apertura de URLs, etc.) en la computadora del usuario.

## 2. Stack Tecnológico
- **Core**: Electron (Node.js backend + Chromium frontend).
- **Frontend (Renderer)**: Vanilla JavaScript (ES6 Modules), HTML5 semántico y Vanilla CSS (nada de frameworks como Tailwind o React).
- **Backend (Main Process)**: Node.js con `serialport` para comunicación por hardware y módulos nativos (`child_process`, `robotjs`/`nut.js` si aplica) para las acciones.

## 3. Arquitectura y Estructura

La aplicación está dividida fuertemente en dos procesos que se comunican vía IPC (Inter-Process Communication):

### Main Process (`main-process/` o en `main.js` root)
- Es responsable de la persistencia fuerte, acceso al OS, teclado simulado y la conexión real al puerto serial usando `serialport`.
- **Regla**: El renderer *nunca* debe importar módulos de Node como `fs` o `serialport` directamente. Todo pasa por `preload.js` (en `window.arduino`).

### Renderer Process (`renderer/`)
Usa una arquitectura modular pura basada en la web:
- `renderer/index.html`: Esqueleto principal. Sólo contiene los contenedores (`div`) donde se inyectan las vistas.
- `renderer/views/*.html`: Fragmentos de HTML (pestañas, barras laterales, modales). Se cargan dinámicamente mediante `fetch`.
- `renderer/js/*.js`: Lógica de UI separada en módulos ES6.
  - `state.js`: Fuente única de la verdad (variables globales) de la interfaz.
  - `ui.js`: Manejo genérico de DOM y carga dinámica de vistas.
  - `main.js`: Archivo orquestador principal.

## 4. Reglas de Código y Mejores Prácticas (CRÍTICO)

1. **Manejo de Eventos en HTML**: 
   Debido a que usamos `<script type="module">`, las funciones definidas en los archivos de JavaScript no están en el *scope* global automáticamente. 
   > ⚠️ **Importante**: Si agregas un `onclick="..."` o `oninput="..."` en los archivos HTML de las vistas, **debes** exponer explícitamente esa función al objeto `window` en su respectivo módulo JS (ej. `window.miFuncion = miFuncion;`).

2. **Cero Dependencias UI**:
   - Mantener el frontend limpio de dependencias pesadas. 
   - No usar jQuery, React, ni frameworks de CSS.

3. **Estilos (CSS)**:
   - Todo debe ir en `style.css` (o en archivos separados si el proyecto crece, importados vía `@import`).
   - Usa las variables CSS nativas (`:root { --bg: ... }`) que ya están definidas en lugar de 
   quemar colores hexadecimales sueltos para mantener el diseño oscuro y consistente.

4. **Agregando Nuevas Pestañas/Ventanas**:
   - Crea un archivo `<nombre>.html` en `views/`.
   - Crea un contenedor (`<div id="tab-<nombre>">`) en `index.html`.
   - Carga la vista dinámicamente en `js/main.js` usando `await loadView("tab-<nombre>", "views/<nombre>.html");`.
   - Crea un `<nombre>.js` para la lógica y enlázalo. (Revisar el `README.md` para detalles exactos).

## 5. Mapeo de Acciones a Teclado / OS
Cuando un usuario configura una acción en la pestaña "Configurar" y el Arduino dispara esa señal, la UI manda un comando vía IPC al Main Process.
- El Main Process es el que procesa lógicamente estas tareas en `executeAction()` (o similar) y delega a utilidades subyacentes. Si debes agregar un *nuevo tipo de paso*, hazlo tanto en la UI (en `STEP_TYPES` dentro de `state.js` y el generador de UI) como en el switch/case del Main Process.

## 6. Filosofía de Asistencia
Cuando se te pida realizar una tarea en este proyecto:
1. Piensa paso a paso y respeta la separación entre Módulos JS y Vistas HTML.
2. Si un cambio afecta la UI, usa el sistema de diseño existente (clases `btn`, `btn-ghost`, `param-row`, etc.).
3. No reescribas archivos enteros si puedes hacer ediciones de bloques pequeños.
