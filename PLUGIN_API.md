# Guía de la API de Plugins de PokePad 🔌

PokePad está diseñado para ser totalmente extensible. Puedes añadir nuevos **Bloques de Flujo de Trabajo** (acciones) o incluso **Secciones de UI** completas (pestañas) utilizando nuestro sistema de plugins modular.

## 🏗️ Anatomía de un Plugin

Un plugin es una carpeta que contiene al menos un archivo `manifest.json`. Dependiendo de su funcionalidad, también puede incluir un `index.js` (para la lógica) y varios archivos HTML/CSS/JS (para la interfaz de usuario).

### Estructura Mínima de Carpetas:
```text
mi-plugin/
├── manifest.json       # Esquema de metadatos y parámetros
├── index.js           # Lógica del Proceso Principal (opcional)
├── ui/                # Archivos de extensión de UI (opcional)
│   └── index.html
└── README.md          # Descripción para el gestor de plugins
```

---

## 📄 El `manifest.json`

Este archivo le indica a PokePad qué hace tu plugin y cómo renderizar su interfaz de configuración.

```json
{
  "id": "com.tu-nombre.miplugin",
  "name": "Mi Plugin Increíble",
  "description": "Hace algo asombroso.",
  "version": "1.0.0",
  "author": "Tu Nombre",
  "icon": "🚀",
  "color": "var(--amber)",
  "params": [
    {
      "name": "message",
      "label": "Mensaje Personalizado",
      "type": "string",
      "placeholder": "Escribe algo...",
      "default": "Hola Mundo",
      "required": true
    }
  ],
  "ui": {
    "sidebarIcon": "⭐",
    "sidebarLabel": "Mi Vista",
    "entryPath": "ui/index.html"
  }
}
```

### Tipos de Parámetros:
- `string`: Una entrada de texto.
- `number`: Una entrada numérica.
- `boolean`: Una casilla de verificación.
- `select`: Un menú desplegable (requiere un array de `options`).

---

## ⚙️ Plugins de Bloques en Segundo Plano (`index.js`)

Si tu plugin proporciona un bloque de flujo de trabajo, debes exportar una función en `index.js`. Esta función se ejecuta en el **Proceso Principal** cada vez que se ejecuta un paso del tipo de tu plugin.

```javascript
/**
 * @param {Object} params - Los valores configurados por el usuario en la UI.
 * @param {Object} context - El contexto de ejecución actual (variables, etc.).
 * @param {Object} utils - Funciones auxiliares (log, error).
 */
module.exports = async (params, context, utils) => {
  utils.log(`Ejecutando con el mensaje: ${params.message}`);
  
  // Puedes acceder a variables globales
  const miVar = context.variables['some_variable'];
  
  // Lógica aquí (ej. llamar a una API, controlar hardware, etc.)
};
```

---

## 🎨 Plugins de Pestañas de UI

Si defines una sección `ui` en tu manifiesto, aparecerá una nueva pestaña en la barra lateral de PokePad.

1. **HTML**: Crea un archivo HTML (ej. `ui/index.html`).
2. **Comunicación IPC**: Usa la API `window.arduino` (proporcionada por el script de preload) para comunicarte con la aplicación.

```html
<!-- ui/index.html -->
<div class="panel">
  <h1>UI de Mi Plugin</h1>
  <button id="btn">Obtener Estado de la App</button>
</div>

<script>
  document.getElementById('btn').onclick = async () => {
    const state = await window.arduino.getState();
    console.log("Señales actuales:", state.signals);
  };
</script>
```

---

## 🛠️ Consejos de Desarrollo

- **Desarrollo Local**: Coloca la carpeta de tu plugin en el directorio `plugins/` del proyecto.
- **Recarga en Caliente**: La aplicación vigila la carpeta `plugins/` y los recarga automáticamente cuando guardas cambios.
- **Logs**: Usa `utils.log` para ver la salida en la consola del proceso principal.
- **Estilos**: Usa las variables CSS de PokePad (como `--bg`, `--surface`, `--accent`) para asegurar que tu UI coincida con el tema actual.

---

## 🚀 Compartir tu Plugin

Para compartir tu plugin, comprime la carpeta en un .zip y envíala a otros usuarios. Pueden instalarlo a través de la sección de **Plugins** en PokePad haciendo clic en "Instalar Local (.zip)".

Si quieres que tu plugin aparezca en el **Registro** oficial, por favor abre un Pull Request en el repositorio [Pokepad_plugins](https://github.com/GonzaBena/Pokepad_plugins).
