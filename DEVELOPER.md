# Guía del Desarrollador - PokePad 🚀

Bienvenido a la arquitectura modular de PokePad. Este documento explica cómo funciona el sistema internamente y cómo puedes extenderlo.

---

## 🏗️ Arquitectura General

PokePad es una aplicación de **Electron**, lo que significa que se divide en dos procesos principales:

### 1. Main Process (`main.ts`, `main-process/`)
Es el corazón de la aplicación. Tiene acceso completo a Node.js y al sistema operativo.
- **Responsabilidades**: Comunicación Serial, Ejecución de Workflows, Gestión de Archivos, Persistencia, Servidor de Plugins.
- **Seguridad**: Solo el Main Process puede ejecutar comandos del sistema o manipular archivos sensibles.

### 2. Renderer Process (`renderer/`)
Es la interfaz de usuario (una página web).
- **Responsabilidades**: Renderizado de la UI, Gestión del Estado Visual, Edición de Workflows.
- **Restricción**: Por seguridad (Context Isolation), el Renderer no tiene acceso directo a Node.js. Se comunica con el Main a través de un puente (Bridge).

### 3. Preload Bridge (`preload.ts`)
El puente seguro que expone funciones específicas del Main al Renderer mediante el objeto global `window.arduino`.

---

## 🔄 Flujo de Datos y Estado

PokePad utiliza un flujo de datos unidireccional para mantener la consistencia:

1. **Usuario realiza una acción** (ej: añade un paso a un workflow).
2. **Renderer actualiza su estado local** (`renderer/js/state.ts`).
3. **Renderer envía el nuevo estado al Main** via IPC (`saveSignals`).
4. **Main persiste el estado en disco** (`pokepad-data.json`) y lo envía al hardware si es necesario.

---

## 🧱 Extensibilidad: El Patrón Registry

Utilizamos un **Registry Pattern** para permitir que la aplicación crezca sin volverse un monolito inmanejable.

### Carpeta `renderer/js/registry/`
- **`block-registry.ts`**: Gestiona todos los tipos de pasos (steps). Si quieres crear un bloque nuevo, regístralo aquí.
- **`ui-registry.ts`**: Gestiona las pestañas de la Activity Bar. Permite inyectar vistas HTML dinámicamente.

---

## 🧱 Cómo crear un Nuevo Bloque (Step)

1. **Define el bloque**: En `renderer/js/blocks/core-blocks.ts` (o un nuevo archivo), registra tu bloque:

```typescript
blockRegistry.register({
  type: 'mi_nuevo_bloque',
  label: 'Nombre Visual',
  icon: '🚀',
  cls: 't-mi-clase-css',
  
  getSummary: (step) => `Configurado con: ${step.params?.mi_param || 'nada'}`,
  
  renderParams: (container, step, path, utils) => {
    // Usar helpers de UI para crear inputs
  }
});
```

2. **Implementa la ejecución**: En `main-process/execution.ts`, añade la lógica en el `switch` de `executeStep`.

---

## 🔌 Sistema de Plugins

PokePad soporta plugins externos que pueden añadir bloques de ejecución y vistas de UI sin tocar el código fuente del core.

Para una guía detallada sobre cómo crear plugins, consulta [PLUGIN_API.md](./PLUGIN_API.md).

---

## 🛠️ Herramientas de Desarrollo

- `npm start`: Inicia la app en modo desarrollo con recarga automática.
- `npm test`: Ejecuta la suite de pruebas unitarias (Jest). **Siempre corre los tests antes de enviar un PR.**
- `npm run build`: Genera el instalador de producción usando `electron-builder`.

---

## 🤝 Cómo Contribuir

Si quieres ayudar a mejorar PokePad, consulta nuestra guía de contribución en [CONTRIBUTING.md](./CONTRIBUTING.md).

