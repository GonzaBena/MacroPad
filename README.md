# Arduino Controller

App de escritorio (Electron) para capturar señales seriales de un Arduino y ejecutar acciones configurables.

## Instalación

```bash
npm install
npm start
```

> Primera vez tarda un poco porque Electron descarga los binarios de `serialport`.

## Uso

1. **Conectar** → seleccioná el puerto (ej: COM3 en Windows, /dev/ttyUSB0 en Linux) y el baud rate (default 9600).
2. **Agregar señal** → clic en "+ AGREGAR", escribí la señal que manda tu Arduino (ej: `BUTTON_1`) y elegí qué hace.
3. **Listo** → cada vez que el Arduino envíe esa señal, la acción se ejecuta automáticamente.

## Tipos de acción

| Tipo             | Descripción                      | Ejemplo de valor                    |
| ---------------- | -------------------------------- | ----------------------------------- |
| Abrir URL        | Abre el navegador predeterminado | `https://youtube.com`               |
| Ejecutar comando | Corre un comando del sistema     | `notepad.exe` / `open -a "Spotify"` |
| Notificación     | Muestra un mensaje en la app     | `¡Botón presionado!`                |

## Arduino

El sketch tiene que enviar strings por `Serial.println()`. Esas strings son las "señales":

```cpp
Serial.begin(9600);

// En loop():
if (buttonPressed) {
  Serial.println("MI_SEÑAL");  // ← esto va en la app
}
```

La señal debe coincidir **exactamente** (case sensitive).

## Empaquetar como ejecutable

```bash
npm install electron-builder --save-dev
npm run build
```

Genera el instalador en la carpeta `dist/`.

## Estructura

```
arduino-controller/
├── main.js               # Proceso principal: serial + acciones
├── preload.js            # Bridge Node ↔ renderer
├── renderer/
│   ├── index.html        # Estructura base de la UI
│   ├── style.css         # Estilos globales
│   ├── views/            # Componentes y pestañas HTML individuales
│   └── js/               # Módulos de lógica de la interfaz
├── arduino_example/
│   └── arduino_example.ino
└── package.json
```

## Agregar nuevos tipos de acción

En `main.js`, función `executeAction()`:

```javascript
case 'mi_accion':
  // tu lógica acá
  break;
```

Y agregarlo al `<select>` en el menú de pasos de `renderer/js/state.js` (en `STEP_TYPES`).

## Agregar nuevas Pestañas y Ventanas

La aplicación utiliza un sistema modular para su interfaz. Todo el HTML de los componentes se carga dinámicamente desde `renderer/views/` y la lógica reside en `renderer/js/`.

### 1. Crear una nueva Pestaña (Tab)

1. **Crear la vista HTML**: Crea un nuevo archivo en `renderer/views/mi-pestana.html` con el contenido.
2. **Modificar `index.html`**:
   - Agregá el botón en la barra de pestañas (dentro de `<div class="tabs">`):
     ```html
     <div class="tab" onclick="switchTab('mi_pestana', this)">Mi Pestaña</div>
     ```
   - Agregá el contenedor vacío donde se inyectará tu vista:
     ```html
     <div class="tab-pane" id="tab-mi_pestana"></div>
     ```
3. **Cargar la vista en `js/main.js`**:
   Dentro del evento `DOMContentLoaded`, agregá la carga asíncrona:
   ```javascript
   await loadView("tab-mi_pestana", "views/mi-pestana.html");
   ```
4. **Agregar lógica**: Crea un archivo `js/mi-pestana.js` con tus funciones. Si vas a usar eventos `onclick` o `oninput` directamente en tu HTML, asegurate de exponer esas funciones globalmente al final del archivo (ej. `window.miFuncion = miFuncion`). Importalo luego en `main.js`.

### 2. Crear Ventanas o Modales

1. **Crear la vista HTML**: Diseñá el modal en `renderer/views/mi-modal.html`. Podés usar la clase `.cmd-modal-overlay` de base y ocultarlo por defecto (`style="display: none;"`).
2. **Agregar el contenedor en `index.html`**:
   Al final del body, junto al otro modal:
   ```html
   <div id="mi-modal-container"></div>
   ```
3. **Cargarlo en `js/main.js`**:
   ```javascript
   await loadView("mi-modal-container", "views/mi-modal.html");
   ```
4. **Mostrar y ocultar**: Agregá funciones en tu lógica (ej. en `ui.js`) que hagan `document.getElementById('id_del_overlay_del_modal').style.display = 'flex'` para mostrarlo, o `'none'` para cerrarlo.
