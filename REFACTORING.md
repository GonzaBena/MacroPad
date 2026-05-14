# Plan de Refactorización y Mejora (PokePad)

Este documento detalla la estrategia para mejorar la seguridad, el rendimiento y la mantenibilidad de PokePad, basado en el análisis realizado en Mayo de 2026.

## 1. Análisis de Seguridad 🛡️

### Estado Actual
- Uso correcto de `contextIsolation: true` y `nodeIntegration: false`.
- `preload.ts` utiliza `contextBridge` de forma segura.

### Mejoras Pendientes
- **Validación Estricta de IPC:** Expandir el uso de `zod` a todos los canales `ipcMain`. Nunca confiar en `data: any`.
- **Navigation Constraints:** Implementar `setWindowOpenHandler` y bloquear navegaciones no deseadas en el Main Process.

## 2. Velocidad y Rendimiento ⚡

### Estado Actual
- Carga "Eager" (inmediata) de todos los módulos en el arranque.
- `workflows.ts` sobrecargado (>100KB), afectando la interactividad del DOM.

### Mejoras Pendientes
- **Lazy Loading de Módulos:** Retrasar la inicialización de módulos (Serial, Keyboard, etc.) hasta que sean necesarios.
- **Delegación de Eventos:** Optimizar el manejo de eventos en el editor de flujos para reducir el uso de CPU y memoria.

## 3. Estrategia de Refactorización (Roadmap) 🏗️

### Fase A: Patrón de Registro (Registry Pattern)
- **UIRegistry:** Crear un sistema donde las pestañas y secciones de la Activity Bar se registren dinámicamente. Esto permitirá que los plugins o nuevos módulos agreguen UI sin modificar el core.
- **Core Blocks Registry:** Tratar los bloques integrados (core) igual que los plugins. Mover la lógica de cada bloque a archivos individuales en `core-blocks/` y registrarlos automáticamente.

### Fase B: Desacoplamiento de `workflows.ts`
- Dividir el archivo monolítico en:
    1. **Render Engine:** Encargado puramente del dibujado de bloques.
    2. **Context Manager:** Lógica de manipulación (drag&drop, portapapeles).
    3. **Parameter Factory:** Generación automática de UI de configuración basada en esquemas (Zod/JSON).

### Fase C: Estandarización de la UI
- Migrar de inyección de HTML crudo (`innerHTML`) a **Web Components nativos** o funciones de fábrica que retornen `HTMLElement`.
- Asegurar que toda la UI sea modular y fácil de testear de forma aislada.
