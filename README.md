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

## Agregar nuevos bloques a los Workflows

Para agregar un nuevo tipo de bloque (paso) que se pueda usar en los flujos de trabajo, seguí estos pasos:

### 1. Definir el tipo en el Frontend
En `renderer/js/state.js`, agregá el nuevo tipo al objeto `STEP_TYPES`:

```javascript
export const STEP_TYPES = {
  // ... existentes
  mi_nuevo_bloque: { 
    label: "Nombre para mostrar", 
    icon: "🚀", 
    cls: "t-mi-clase-css" 
  },
};
```

### 2. Crear la interfaz del bloque
En `renderer/js/workflows.js`, dentro de la función `buildStepParams(container, step, path)`, agregá un nuevo `case` para tu tipo:

```javascript
case "mi_nuevo_bloque": {
  const row = makeRow("Configuración del bloque");
  const wrap = document.createElement("div"); wrap.className = "param-input-row";
  
  // Usá makeInput para que el valor se guarde automáticamente en params.mi_parametro
  const inp = makeInput("text", p.mi_parametro || "", "placeholder...", "mi_parametro");
  inp.className = "param-input flex-1";
  
  wrap.appendChild(inp);
  wrap.appendChild(makeVarLink("mi_parametro")); // Permitir usar variables
  row.appendChild(wrap);
  container.appendChild(row);
  break;
}
```

### 3. Implementar la ejecución en el Backend
En `main-process/execution.js`, dentro de la función `executeStep(step, context)`, agregá la lógica de ejecución:

```javascript
case "mi_nuevo_bloque": {
  // Obtené los parámetros (se resuelven automáticamente si usás resolveValue)
  const miValor = resolveValue(p.mi_parametro, context);
  
  // Tu lógica de ejecución aquí (debe ser async)
  await miFuncionDeEjecucion(miValor);
  break;
}
```

### 4. Estilos (Opcional)
Si definiste una clase CSS en el paso 1 (ej: `t-mi-clase-css`), podés agregar estilos para el borde o el icono en `renderer/css/workflows.css`.

---

## Agregar nuevos tipos de acción (Legado)
Esta sección aplica a la lógica antigua. Para el sistema de Workflows actual, seguí los pasos de la sección anterior.

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

### 3. Agregar Menús y Submenús

La barra de título contiene un menú personalizado. Podés agregar nuevos menús o submenús siguiendo esta estructura en `index.html`:

#### Agregar un Menú Principal
Agregá un bloque `.menu-wrapper` dentro de `<div class="tb-menu">`:
```html
<div class="menu-wrapper">
  <div class="menu-btn">Nuevo Menú</div>
  <div class="dropdown">
    <div class="dd-item" id="menu-accion-1">Acción 1</div>
    <div class="dd-divider"></div>
    <div class="dd-item" id="menu-accion-2">Acción 2</div>
  </div>
</div>
```

#### Agregar un Submenú
Para que un item tenga un submenú, agregá la clase `.has-submenu` al `.dd-item` e inyectá un `.dd-submenu` dentro:
```html
<div class="dd-item has-submenu">
  Más Opciones
  <div class="dd-submenu">
    <div class="dd-item" id="sub-1">Sub Opción A</div>
    <div class="dd-item" id="sub-2">Sub Opción B</div>
  </div>
</div>
```

#### Manejar clics
En `js/main.js` o un módulo dedicado, agregá el listener usando el ID que definiste:
```javascript
document.getElementById('menu-accion-1').addEventListener('click', () => {
  console.log("Acción ejecutada");
});
```
