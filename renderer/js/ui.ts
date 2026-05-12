import { state, saveConfig, applyConfig, undo as stateUndo, redo as stateRedo } from './state.js';
import { renderSignalList, renderFlow } from './workflows.js';

export async function loadView(elementId: string, viewPath: string): Promise<void> {
  const response = await fetch(viewPath);
  const html = await response.text();
  const el = document.getElementById(elementId);
  if (el) el.innerHTML = html;
}

export function switchTab(name: string, el: HTMLElement): void {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
  el.classList.add("active");
  document.getElementById(`tab-${name}`)?.classList.add("active");
}
(window as any).switchTab = switchTab; // expose for inline onclick

export async function applyTheme(): Promise<void> {
  await applyConfig();
}

export function showToast(title: string, body: string): void {
  const c = document.getElementById("toasts");
  if (!c) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `<div class="toast-t">${escHtml(title)}</div><div class="toast-b">${escHtml(body)}</div>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transition = "opacity .3s";
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

export function closeCmdModal(): void {
  document.getElementById("cmd-modal-overlay")?.classList.add("d-none");
}
(window as any).closeCmdModal = closeCmdModal;

export function showCmdModal(): void {
  document.getElementById("cmd-modal-overlay")?.classList.remove("d-none");
}

let confirmCallback: (() => void) | null = null;

export function showConfirm(title: string, message: string, onConfirm: () => void, confirmLabel = "Confirmar"): void {
  const modal = document.getElementById("confirm-modal");
  const titleEl = document.getElementById("confirm-title");
  const msgEl = document.getElementById("confirm-message");
  const okBtn = document.getElementById("confirm-ok");
  if (!modal || !titleEl || !msgEl) return;
  titleEl.textContent = title;
  msgEl.innerHTML = message;
  if (okBtn) okBtn.textContent = confirmLabel;
  confirmCallback = onConfirm;
  modal.classList.remove("d-none");
  (document.getElementById("confirm-ok") as HTMLElement | null)?.focus();
}

function handleConfirmOk(): void {
  if (confirmCallback) confirmCallback();
  closeConfirm();
}

function closeConfirm(): void {
  document.getElementById("confirm-modal")?.classList.add("d-none");
  confirmCallback = null;
}

document.getElementById("confirm-ok")?.addEventListener("click", handleConfirmOk);
document.getElementById("confirm-cancel")?.addEventListener("click", closeConfirm);
document.getElementById("confirm-modal")?.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Enter") handleConfirmOk();
  if (e.key === "Escape") closeConfirm();
});

let promptCallback: ((val: string) => void) | null = null;

export function showPrompt(title: string, defaultValue: string, callback: (val: string) => void): void {
  const modal = document.getElementById("prompt-modal");
  const input = document.getElementById("prompt-input") as HTMLInputElement | null;
  const titleEl = document.getElementById("prompt-title");

  if (!modal || !input || !titleEl) return;

  titleEl.textContent = title;
  input.value = defaultValue || "";
  promptCallback = callback;

  modal.classList.remove("d-none");
  input.focus();
  input.select();
}
(window as any).showPrompt = showPrompt;

function handlePromptConfirm(): void {
  const input = document.getElementById("prompt-input") as HTMLInputElement | null;
  if (!input) return;
  const val = input.value;
  if (promptCallback) {
    promptCallback(val);
  }
  closePrompt();
}

function closePrompt(): void {
  document.getElementById("prompt-modal")?.classList.add("d-none");
  promptCallback = null;
}

// Attach listeners to prompt modal buttons
document.getElementById("prompt-ok")?.addEventListener("click", handlePromptConfirm);
document.getElementById("prompt-cancel")?.addEventListener("click", closePrompt);
document.getElementById("prompt-input")?.addEventListener("keydown", (e: any) => {
  if (e.key === "Enter") handlePromptConfirm();
  if (e.key === "Escape") closePrompt();
});

export function initConfigColorPicker(): void {
  const hexInput = document.getElementById("cfg-accent") as HTMLInputElement | null;
  const btn = document.getElementById("cfg-accent-btn");
  const preview = document.getElementById("cfg-accent-preview");
  const picker = document.getElementById("cfg-accent-picker") as HTMLInputElement | null;
  if (!hexInput || !btn || !preview || !picker) return;

  function isValidHex(val: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(val);
  }

  function applyColor(hex: string): void {
    const upper = hex.toUpperCase();
    if (preview) preview.style.background = upper;
    if (picker && picker.value !== hex) picker.value = hex;
    if (hexInput && hexInput.value !== upper) hexInput.value = upper;
  }

  hexInput.addEventListener("input", () => {
    const raw = hexInput.value;
    const val = raw.startsWith("#") ? raw : "#" + raw;
    if (isValidHex(val)) {
      if (preview) preview.style.background = val;
      if (picker) picker.value = val;
    }
  });

  hexInput.addEventListener("blur", () => {
    const raw = hexInput.value;
    const val = raw.startsWith("#") ? raw : "#" + raw;
    applyColor(isValidHex(val) ? val : picker.value);
  });

  btn.addEventListener("click", () => picker.click());
  picker.addEventListener("input", () => applyColor(picker.value));
  picker.addEventListener("change", () => applyColor(picker.value));

  applyColor(hexInput.value);
}

export function openConfigView(): void {
  window.arduino.openConfigWindow();
}
(window as any).openConfigView = openConfigView;

export function saveConfigView(): void {
  const themeEl = document.getElementById("cfg-theme") as HTMLSelectElement | null;
  const closeEl = document.getElementById("cfg-close") as HTMLSelectElement | null;
  const initialTabEl = document.getElementById("cfg-initial-tab") as HTMLSelectElement | null;
  const startupModeEl = document.getElementById("cfg-startup-mode") as HTMLSelectElement | null;
  const zoomEnabledEl = document.getElementById("cfg-zoom-enabled") as HTMLInputElement | null;
  const accentEl = document.getElementById("cfg-accent") as HTMLInputElement | null;
  const activityBarEl = document.getElementById("cfg-activity-bar") as HTMLSelectElement | null;

  if (themeEl) state.config.theme = themeEl.value;
  if (closeEl) state.config.closeBehavior = closeEl.value as any;
  if (initialTabEl) state.config.initialTab = initialTabEl.value;
  if (startupModeEl) state.config.startupMode = startupModeEl.value;
  if (zoomEnabledEl) state.config.enableZoom = zoomEnabledEl.checked;
  if (accentEl) state.config.accentColor = accentEl.value;
  if (activityBarEl) state.config.activeSidebarSection = activityBarEl.value;

  saveConfig();
  showToast("Configuración", "Los cambios han sido guardados y aplicados.");
  applyTheme();
  closeConfigView();
}
(window as any).saveConfigView = saveConfigView;

export function closeConfigView(): void {
  const configView = document.getElementById("config-view");
  const mainContent = document.getElementById("main-content");
  if (configView) configView.classList.add("d-none");
  if (mainContent) mainContent.classList.remove("d-none");
}
(window as any).closeConfigView = closeConfigView;

// ── Undo / Redo ──

export function undo(): void {
  if (stateUndo()) {
    renderSignalList();
    if (state.selectedSig) renderFlow();
    showToast("Deshacer", "Se deshizo el último cambio");
  } else {
    showToast("Deshacer", "No hay cambios para deshacer");
  }
}
(window as any).undo = undo;

export function redo(): void {
  if (stateRedo()) {
    renderSignalList();
    if (state.selectedSig) renderFlow();
    showToast("Rehacer", "Se rehizo el último cambio");
  } else {
    showToast("Rehacer", "No hay cambios para rehacer");
  }
}
(window as any).redo = redo;

// ── Export / Import ──

export async function exportConfig(): Promise<void> {
  const result = await window.arduino.exportData();
  if (result.ok) {
    showToast("Exportado", `Configuración guardada en:\n${result.path}`);
  } else if (result.error !== "Cancelled") {
    showToast("Error", `No se pudo exportar: ${result.error}`);
  }
}
(window as any).exportConfig = exportConfig;

export async function importConfig(): Promise<void> {
  const result = await window.arduino.importData();
  if (result.ok) {
    // Reload the imported data into state
    if (result.data) {
      state.signals = result.data.signals || {};
      if (result.data.config) {
        state.config = { ...state.config, ...result.data.config };
      }
    }
    renderSignalList();
    showToast("Importado", "Configuración importada exitosamente. Reiniciá la app para aplicar todos los cambios.");
  } else if (result.error !== "Cancelled") {
    showToast("Error", `No se pudo importar: ${result.error}`);
  }
}
(window as any).importConfig = importConfig;

// --- about --
export function about(): void {
  window.arduino.openAboutWindow();
}
(window as any).about = about;

// ── Utilities ──

export function escHtml(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escAttr(s: string | number): string {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;");
}

export function initResizers(): void {
  setupResizer("main-resizer", "main-content", "--main-sidebar-w", 200, 600);
  setupResizer("siglist-resizer", "config-content", "--sig-sidebar-w", 160, 400);
}

function setupResizer(resizerId: string, containerId: string, cssVar: string, minW: number, maxW: number): void {
  const resizer = document.getElementById(resizerId);
  const container = document.getElementById(containerId);
  if (!resizer || !container) return;

  let isDragging = false;

  resizer.addEventListener("mousedown", (e) => {
    isDragging = true;
    resizer.classList.add("dragging");
    container.classList.add("is-resizing");
    document.body.style.cursor = "col-resize";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const containerRect = container.getBoundingClientRect();
    let newWidth = e.clientX - containerRect.left;
    if (newWidth < minW) newWidth = minW;
    if (newWidth > maxW) newWidth = maxW;
    container.style.setProperty(cssVar, `${newWidth}px`);
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      resizer.classList.remove("dragging");
      container.classList.remove("is-resizing");
      document.body.style.cursor = "";
    }
  });
}

export function initMenu(): void {
  const menuBar = document.querySelector('.tb-menu');
  if (!menuBar) return;

  let isActive = false;
  const wrappers = menuBar.querySelectorAll('.menu-wrapper');

  // Cerrar al hacer clic afuera
  document.addEventListener('click', (e) => {
    if (!menuBar.contains(e.target as Node)) {
      isActive = false;
      wrappers.forEach(w => w.classList.remove('open'));
    }
  });

  wrappers.forEach(wrapper => {
    const btn = wrapper.querySelector('.menu-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      if (!isActive) {
        isActive = true;
        wrapper.classList.add('open');
      } else {
        if (wrapper.classList.contains('open')) {
          isActive = false;
          wrapper.classList.remove('open');
        } else {
          wrappers.forEach(w => w.classList.remove('open'));
          wrapper.classList.add('open');
        }
      }
    });

    wrapper.addEventListener('mouseenter', () => {
      if (isActive) {
        wrappers.forEach(w => w.classList.remove('open'));
        wrapper.classList.add('open');
      }
    });
  });

  // Cerrar al hacer clic en una opción
  const items = menuBar.querySelectorAll('.dd-item');
  items.forEach(item => {
    item.addEventListener('click', () => {
      isActive = false;
      wrappers.forEach(w => w.classList.remove('open'));
    });
  });
}

// ── Keyboard shortcuts ──

function toggleSidebar(): void {
  state.config.sidebarCollapsed = !state.config.sidebarCollapsed;
  saveConfig();
}

function navigateToTab(name: string): void {
  (document.querySelector(`.tab[data-tab="${name}"]`) as HTMLElement | null)?.click();
}

const SHORTCUTS = [
  // Edición
  { ctrl: true,                key: 'z', action: undo },
  { ctrl: true,                key: 'y', action: redo },
  { ctrl: true, shift: true,   key: 'z', action: redo },
  // Navegación
  { ctrl: true,                key: 'b', action: toggleSidebar },
  { ctrl: true,                key: ',', action: openConfigView },
  { ctrl: true, shift: true,   key: 'v', action: () => (document.getElementById("ab-btn-global-vars") as HTMLElement | null)?.click() },
  { ctrl: true,                key: '1', action: () => navigateToTab('monitor') },
  { ctrl: true,                key: '2', action: () => navigateToTab('workflows') },
  { ctrl: true,                key: '3', action: () => navigateToTab('metrics') },
];

export function initKeyboardShortcuts(): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    for (const s of SHORTCUTS) {
      if (
        !!(s as any).ctrl === ctrl &&
        !!(s as any).shift === e.shiftKey &&
        e.key.toLowerCase() === s.key.toLowerCase()
      ) {
        e.preventDefault();
        s.action();
        return;
      }
    }
  });
}
