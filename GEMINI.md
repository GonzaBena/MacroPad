# PokePad - Development Guidelines

# Constrains
- always execute tests
- if it doesn't exists you will create it
- you will create a plan step by step to each request
- you will consider each corner cases

PokePad is an Electron-based desktop application designed to capture serial signals from an external device (like an Arduino-based Macroball) and execute highly configurable workflows (sequences of actions).

## Project Overview

- **Core Technology:** Electron, Node.js.
- **Automation:** Uses `@nut-tree-fork/nut-js` for keyboard, mouse, and system automation.
- **Communication:** Uses `serialport` for RS-232 / Serial communication with hardware.
- **Architecture:**
  - **Main Process (`main.js`):** Entry point and orchestrator.
  - **`main-process/`:** Modularized backend logic (execution engine, serial handling, persistence, etc.).
  - **`renderer/`:** Frontend logic and views.
    - **`views/`:** HTML fragments loaded dynamically by the UI.
    - **`js/`:** State management, UI logic, and workflow rendering.
    - **`css/`:** Modularized CSS for different components.
  - **`preload.js`:** Secure IPC bridge exposing the `arduino` API to the renderer.
- **Workflow Engine:** Workflows are sequences of "Steps" (blocks) that support variables, control flow (loops, conditions), and various system actions (screenshots, notifications, scripts).

## Building and Running

- **Install dependencies:** `npm install`
- **Run in development mode:** `npm start`
- **Run tests:** `npm test`
- **Build production installers:** `npm run build` (uses `electron-builder`)

## Development Conventions

### 1. Adding New Workflow Blocks (Steps)
There are two ways to add new workflow blocks:

#### Option A: Custom Plugins (Recommended)
Create a new folder in the `plugins/` directory (either in the project root for development or in `%APPDATA%/pokepad/plugins/` for production).
- **`manifest.json`**: Define metadata, icon, and parameters schema.
- **`index.js`**: Export an `async (params, context, utils) => { ... }` function.
Custom blocks are automatically loaded and rendered by the UI.

#### Option B: Built-in Blocks (Core)
For core features, you must update:
- **`renderer/js/state.ts`**: Register in `STEP_TYPES`.
- **`renderer/js/workflows.ts`**: Implement UI in `buildStepParams` and `getStepSummary`.
- **`main-process/execution.ts`**: Implement logic in `executeStep`.

### 2. UI Modularity
- Avoid large HTML files. New tabs or modals should be created as partials in `renderer/views/` and loaded using the `loadView` helper in `renderer/js/ui.js`.
- Logic for views should be modularized in `renderer/js/` and functions exposed to the `window` object if they need to be called from inline HTML events (though event listeners in `main.js` are preferred).

### 3. State Management
- The global frontend state is managed in `renderer/js/state.js`.
- Any modification to `state.signals` should be preceded by a call to `pushUndo()` to maintain a consistent undo/redo stack.
- Use `saveSignals()` to persist changes to disk (via IPC) and broadcast them to the hardware.

### 4. Styling and Themes
- Styles are located in `renderer/css/`.
- Themes are JSON files in `assets/themes/`.
- Use CSS variables (e.g., `--amber`, `--bg`, `--surface`) to ensure theme compatibility.
- New color variables should be documented in the README for theme creators.

## Key Files Summary

- `main.js`: Electron entry point and IPC registration.
- `preload.js`: IPC bridge definition.
- `main-process/execution.js`: The "brain" that runs workflows step-by-step.
- `renderer/js/state.js`: Centralized application state and constants.
- `renderer/js/workflows.js`: Core logic for the workflow editor UI.
- `renderer/js/ui.js`: General UI helpers (modals, toasts, view loading).
- `pokepad-data.json`: Local persistence file (created at runtime).
