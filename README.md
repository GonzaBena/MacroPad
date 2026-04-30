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
├── preload.js            # Bridge seguro Node ↔ renderer
├── renderer/
│   ├── index.html        # UI
│   ├── style.css         # Estilos
│   └── app.js            # Lógica del renderer
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

Y agregarlo al `<select>` en el modal de `index.html`.
