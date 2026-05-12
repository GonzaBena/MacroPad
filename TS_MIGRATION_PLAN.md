# PokePad: TypeScript Migration Plan

This document outlines the incremental strategy to migrate PokePad from JavaScript to TypeScript. The goal is to improve maintainability and type safety without halting development.

## Progress Tracking
- [ ] Phase 1: Environment Setup
- [ ] Phase 2: Core Types & State
- [ ] Phase 3: IPC & Preload (The Bridge)
- [ ] Phase 4: Main Process Migration
- [ ] Phase 5: Renderer Process Migration
- [ ] Phase 6: Full Strict Mode & Cleanup

---

## Phase 1: Environment Setup ✅
Setup the infrastructure to support both JS and TS.

- [x] Install dependencies:
  - `typescript`
  - `@types/node`, `@types/jest`
  - `@types/serialport` (if available/needed)
- [x] Initialize `tsconfig.json` with `allowJs: true` and `checkJs: false`.
- [x] Update build scripts in `package.json` to handle TS (via Babel or `tsc`).
- [x] Verify that `npm start` and `npm test` still work with the hybrid setup.

## Phase 2: Core Types & State ✅
Define the "Source of Truth" for PokePad's data structures.

- [x] Create `src/types/` (or similar) to host shared interfaces.
- [x] Define `Workflow`, `Step`, `Signal`, and `AppConfig` interfaces.
- [x] Migrate `renderer/js/state.js` to `state.ts`.
- [x] Ensure the global `state` object is strictly typed.

## Phase 3: IPC & Preload (The Bridge) ✅
The most critical part for Electron stability.

- [x] Define a shared `IpcEvents` interface for all Main-to-Renderer communication.
- [x] Migrate `preload.js` to `preload.ts`.
- [x] Use `contextBridge.exposeInMainWorld` with proper typing for the `window.arduino` object.

## Phase 4: Main Process Migration ✅
Typing the "Brain" of the application.

- [x] Migrate `main-process/execution.js` to `.ts`.
  - Type the `executeStep` and `resolveValue` functions.
- [x] Migrate `main-process/serial.js` and other modules.
- [x] Finally, migrate `main.js` to `main.ts`.

## Phase 5: Renderer Process Migration 🎨
UI logic and Workflow editor.

- [ ] Migrate `renderer/js/workflows.js` (complex UI logic).
- [ ] Migrate `renderer/js/ui.js` and other helper modules.
- [ ] Convert all view-specific scripts.

## Phase 6: Final Polish 🧹
- [ ] Enable `strict: true` in `tsconfig.json`.
- [ ] Remove `allowJs` and ensure all files are `.ts` or `.tsx`.
- [ ] Final audit of type safety and performance.

---

## Risks & Mitigations
- **SerialPort Native Modules:** Ensure `@electron/rebuild` is run after adding TS dependencies.
- **Workflow Breaking Changes:** Maintain a strong test suite in `test/` and run it after every file migration.
- **UI Interaction:** Be careful with `window` object extensions; use global declaration files (`env.d.ts`).
