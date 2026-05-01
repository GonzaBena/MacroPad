# Análisis de Mejoras para PokePad

Revisé el proyecto completo. Estas son mis recomendaciones organizadas por prioridad e impacto.

---

## 🔴 Seguridad (Crítico)

### 1. Content Security Policy (CSP) — Falta por completo

La consola ya lo advierte: `Insecure Content-Security-Policy`. No hay ningún CSP definido.

**Impacto**: Sin CSP, un XSS o una inyección de contenido podría ejecutar código arbitrario en el renderer, que a su vez tiene acceso a IPC con el main process (teclado, shell, scripts, etc.).

**Solución**: Agregar CSP en el `<meta>` tag de `index.html` y/o en la sesión de Electron:

```html
<meta http-equiv="Content-Security-Policy" 
  content="default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:;">
```

> [!CAUTION]
> Actualmente la app permite `unsafe-eval` implícitamente. Esto es especialmente peligroso porque PokePad tiene acceso a `exec()`, `shell.openExternal()`, y `clipboard`.

---

### 2. Inyección de comandos en `run_cmd` y `keyboard.js`

En [execution.js](file:///g:/poketech/main-process/execution.js#L105-L117), `runCmd()` pasa el string directamente a `exec()`:

```javascript
exec(cmd, (err, stdout) => { ... });
```

Y en [keyboard.js](file:///g:/poketech/main-process/keyboard.js#L80-L82), se interpolan strings directamente en comandos de PowerShell:

```javascript
exec(`powershell -command "... SendKeys::SendWait('${modPre}${key}')"`, ...);
```

**Impacto**: Si un workflow es importado/compartido o si un input se manipula, se puede ejecutar código arbitrario a nivel de sistema operativo.

**Soluciones**:
- Para `run_cmd`: usar `execFile` con argumentos separados en vez de `exec`, o sanitizar/escapar el input.
- Para `keyboard.js`: escapar los caracteres especiales de PowerShell, o usar `execFile("powershell", ["-command", script])` con el script como argumento separado.
- Para `runScript`: ya escriben a un archivo temporal, lo cual es mejor, pero considerar sandboxing (e.g., limitar network access, filesystem access).

---

### 3. `shell.openExternal()` sin validación de URL

En [execution.js:79](file:///g:/poketech/main-process/execution.js#L77-L82):

```javascript
if (targetUrl && !/^https?:\/\//i.test(targetUrl)) targetUrl = "https://" + targetUrl;
await shell.openExternal(targetUrl);
```

**Impacto**: `shell.openExternal` puede abrir URIs como `file://`, `javascript:`, `data:`, o protocolos custom del OS. El regex solo valida que empiece con `http`, pero no previene que alguien pase `javascript:alert()` o un `file://` path.

**Solución**: Validar estrictamente que la URL sea HTTP/HTTPS después del prepend:

```javascript
const parsed = new URL(targetUrl);
if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Protocol not allowed');
```

---

### 4. Listeners IPC sin cleanup — Memory leak en preload

En [preload.js](file:///g:/poketech/preload.js), los `onStatus`, `onData`, etc. usan `ipcRenderer.on()` pero nunca se hace `removeListener`. Si la ventana se recarga (hot reload), se duplican handlers.

**Solución**: Devolver una función de cleanup o usar `ipcRenderer.once`, o exponer un `removeAll`:

```javascript
onStatus: (cb) => {
  ipcRenderer.removeAllListeners("serial-status");
  ipcRenderer.on("serial-status", (_, d) => cb(d));
},
```

---

### 5. Scripts temporales se escriben con permisos del usuario actual

En [execution.js:128](file:///g:/poketech/main-process/execution.js#L126-L128), `runScript` escribe archivos en `os.tmpdir()`. Esto no es un riesgo crítico, pero en sistemas multi-usuario el directorio tmp puede ser accesible por otros usuarios.

**Solución**: Crear un subdirectorio privado con `mkdirSync` y permisos restrictivos, o usar `app.getPath('temp')`.

---

## 🟡 Features de Alto Impacto

### 6. Importar/Exportar workflows

Los workflows viven solo en `localStorage`. Si el usuario cambia de PC, reinstala, o limpia el caché, **pierde toda su configuración**.

**Propuesta**:
- Agregar botones "Exportar configuración" / "Importar configuración" que guarden/carguen un `.json`.
- Usar `dialog.showSaveDialog` / `dialog.showOpenDialog` desde el main process.
- Bonus: permitir exportar un workflow individual.

---

### 7. Persistencia en archivo (no solo localStorage)

`localStorage` en Electron es frágil — se borra con `--clear-data`, bugs de Chromium, o si el usuario limpia datos.

**Propuesta**: Migrar la persistencia a un archivo JSON en `app.getPath('userData')` gestionado desde el main process. Esto es más robusto y permite backups automáticos.

---

### 8. Reconexión automática al puerto serial

Actualmente, si el Arduino se desconecta (cable suelto, reset), el usuario tiene que reconectar manualmente.

**Propuesta**: Implementar auto-reconnect en [serial.js](file:///g:/poketech/main-process/serial.js):
- En el evento `close`, intentar reconectar cada 3-5 segundos.
- Mostrar un indicador visual "Reconectando..." en la UI.
- Tener un límite de reintentos configurable.

---

### 9. Undo/Redo para edición de workflows

El menú "Editar > Deshacer" no hace nada actualmente. Para una app donde los usuarios configuran flujos complejos, esto es importante.

**Propuesta**: Implementar un stack de snapshots del estado de workflows:
```javascript
const history = [];
const future = [];
function pushHistory() { history.push(JSON.parse(JSON.stringify(state.signals))); }
function undo() { if (history.length) { future.push(state.signals); state.signals = history.pop(); } }
```

---

### 10. Variables / Condicionales en workflows

Los flujos actuales son lineales (paso 1 → paso 2 → ...). Sería muy poderoso agregar:

- **Variables**: guardar el resultado de un `run_cmd` o `run_script` y usarlo en pasos siguientes.
- **Condicionales**: if/else basado en el resultado del paso anterior.
- **Loops**: repetir N veces un grupo de pasos.

Esto convertiría PokePad de un "macro runner" a una herramienta de automatización seria.

---

### 11. Perfil / Contexto de aplicación activo

Detectar la aplicación activa en el foreground y permitir que los workflows cambien según el contexto. Ejemplo:
- Si estoy en VS Code, el botón abre la terminal.
- Si estoy en el navegador, el botón cambia de pestaña.

---

## 🟢 Calidad y DX (Developer Experience)

### 12. Logging estructurado en el main process

Actualmente se usa `console.log` / `console.error` sin formato. Para debugging en producción sería útil:
- Un módulo de logging con niveles (debug, info, warn, error).
- Escribir logs a un archivo rotado en `app.getPath('logs')`.

---

### 13. Manejo de errores centralizado

Muchos bloques `catch` solo hacen `console.error(e)` o se ignoran silenciosamente. En una app que controla hardware:
- Los errores deberían mostrarse al usuario de forma clara.
- Un crash en `executeSequence` no debería dejar `runningSequences` en estado inconsistente.

**Propuesta**: Agregar un `try/finally` para garantizar cleanup:

```javascript
// execution.js
async function executeSequence(signal) {
  // ...
  try {
    for (const step of entry.steps) { ... }
  } finally {
    runningSequences.delete(signal); // SIEMPRE limpia
    if (win) win.webContents.send("sequence-end", signal);
  }
}
```

---

### 14. Tests automatizados

No hay tests. Para un proyecto que interactúa con hardware y el OS, al menos deberían existir:
- Unit tests para `highlightCode()`, `escHtml()`, `migrateType()`, `migrateParams()`.
- Tests de integración para el flujo IPC (pueden mockearse).
- Tests de snapshot para los workflows serializados.

---

### 15. Validación de datos al cargar desde localStorage

En [state.js:106](file:///g:/poketech/renderer/js/state.js#L105-L136), `loadSignalsData()` parsea JSON de localStorage sin validar la estructura. Si el JSON está corrupto o tiene un formato inesperado, la app puede crashear silenciosamente.

**Propuesta**: Agregar un schema validation básico o al menos validar que cada entry tenga `steps` como array y `color` como string.

---

## 📋 Resumen por Prioridad

| Prioridad | Mejora | Tipo |
|-----------|--------|------|
| 🔴 P0 | CSP Policy | Seguridad |
| 🔴 P0 | Inyección de comandos en `exec()` | Seguridad |
| 🔴 P0 | Validación de URL en `openExternal` | Seguridad |
| 🔴 P1 | Memory leak en IPC listeners | Seguridad/Estabilidad |
| 🟡 P1 | Exportar/Importar workflows | Feature |
| 🟡 P1 | Persistencia en archivo | Feature/Estabilidad |
| 🟡 P1 | Auto-reconnect serial | Feature |
| 🟡 P2 | Undo/Redo | Feature |
| 🟡 P2 | Manejo de errores centralizado | Calidad |
| 🟢 P2 | Tests automatizados | Calidad |
| 🟢 P3 | Variables/Condicionales en workflows | Feature |
| 🟢 P3 | Perfiles por aplicación | Feature |
| 🟢 P3 | Logging estructurado | Calidad |
| 🟢 P3 | Validación de datos | Calidad |

