import { state, saveConfig, undo as stateUndo, redo as stateRedo, canUndo, canRedo } from './state.js';
import { renderSignalList, renderFlow } from './workflows.js';

export async function loadView(elementId, viewPath) {
  const response = await fetch(viewPath);
  const html = await response.text();
  document.getElementById(elementId).innerHTML = html;
}

export function switchTab(name, el) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
  el.classList.add("active");
  document.getElementById(`tab-${name}`).classList.add("active");
}
window.switchTab = switchTab; // expose for inline onclick

export function showToast(title, body) {
  const c = document.getElementById("toasts");
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

export function closeCmdModal() {
  document.getElementById("cmd-modal-overlay").classList.add("d-none");
}
window.closeCmdModal = closeCmdModal;

export function showCmdModal() {
  document.getElementById("cmd-modal-overlay").classList.remove("d-none");
}

let promptCallback = null;

export function showPrompt(title, defaultValue, callback) {
  const modal = document.getElementById("prompt-modal");
  const input = document.getElementById("prompt-input");
  const titleEl = document.getElementById("prompt-title");

  if (!modal || !input || !titleEl) return;

  titleEl.textContent = title;
  input.value = defaultValue || "";
  promptCallback = callback;

  modal.classList.remove("d-none");
  input.focus();
  input.select();
}
window.showPrompt = showPrompt;

function handlePromptConfirm() {
  const input = document.getElementById("prompt-input");
  const val = input.value;
  if (promptCallback) {
    promptCallback(val);
  }
  closePrompt();
}

function closePrompt() {
  document.getElementById("prompt-modal").classList.add("d-none");
  promptCallback = null;
}

// Attach listeners to prompt modal buttons
document.getElementById("prompt-ok")?.addEventListener("click", handlePromptConfirm);
document.getElementById("prompt-cancel")?.addEventListener("click", closePrompt);
document.getElementById("prompt-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handlePromptConfirm();
  if (e.key === "Escape") closePrompt();
});

export function initConfigColorPicker() {
  const hexInput = document.getElementById("cfg-accent");
  const btn = document.getElementById("cfg-accent-btn");
  const preview = document.getElementById("cfg-accent-preview");
  const picker = document.getElementById("cfg-accent-picker");
  if (!hexInput || !btn || !preview || !picker) return;

  function isValidHex(val) {
    return /^#[0-9A-Fa-f]{6}$/.test(val);
  }

  function applyColor(hex) {
    const upper = hex.toUpperCase();
    preview.style.background = upper;
    if (picker.value !== hex) picker.value = hex;
    if (hexInput.value !== upper) hexInput.value = upper;
  }

  hexInput.addEventListener("input", () => {
    const raw = hexInput.value;
    const val = raw.startsWith("#") ? raw : "#" + raw;
    if (isValidHex(val)) {
      preview.style.background = val;
      picker.value = val;
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

export function openConfigView() {
  window.arduino.openConfigWindow();
}
window.openConfigView = openConfigView;

export function saveConfigView() {
  const themeEl = document.getElementById("cfg-theme");
  const closeEl = document.getElementById("cfg-close");
  const accentEl = document.getElementById("cfg-accent");

  if (themeEl) state.config.theme = themeEl.value;
  if (closeEl) state.config.closeBehavior = closeEl.value;
  if (accentEl) state.config.accentColor = accentEl.value;

  saveConfig();
  showToast("Configuración", "Los cambios han sido guardados y aplicados.");
  closeConfigView();
}
window.saveConfigView = saveConfigView;

export function closeConfigView() {
  const configView = document.getElementById("config-view");
  const mainContent = document.getElementById("main-content");
  if (configView) configView.classList.add("d-none");
  if (mainContent) mainContent.classList.remove("d-none");
}
window.closeConfigView = closeConfigView;

// ── Undo / Redo ──

export function undo() {
  if (stateUndo()) {
    renderSignalList();
    if (state.selectedSig) renderFlow();
    showToast("Deshacer", "Se deshizo el último cambio");
  } else {
    showToast("Deshacer", "No hay cambios para deshacer");
  }
}
window.undo = undo;

export function redo() {
  if (stateRedo()) {
    renderSignalList();
    if (state.selectedSig) renderFlow();
    showToast("Rehacer", "Se rehizo el último cambio");
  } else {
    showToast("Rehacer", "No hay cambios para rehacer");
  }
}
window.redo = redo;

// ── Export / Import ──

export async function exportConfig() {
  const result = await window.arduino.exportData();
  if (result.ok) {
    showToast("Exportado", `Configuración guardada en:\n${result.path}`);
  } else if (result.error !== "Cancelled") {
    showToast("Error", `No se pudo exportar: ${result.error}`);
  }
}
window.exportConfig = exportConfig;

export async function importConfig() {
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
window.importConfig = importConfig;

// --- about --
export function about() {
  window.arduino.openAboutWindow();
}
window.about = about;

// ── Utilities ──

export function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escAttr(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;");
}

export function initResizers() {
  setupResizer("main-resizer", "main-content", "--main-sidebar-w", 200, 600);
  setupResizer("siglist-resizer", "config-content", "--sig-sidebar-w", 160, 400);
}

function setupResizer(resizerId, containerId, cssVar, minW, maxW) {
  const resizer = document.getElementById(resizerId);
  const container = document.getElementById(containerId);
  if (!resizer || !container) return;

  let isDragging = false;

  resizer.addEventListener("mousedown", (e) => {
    isDragging = true;
    resizer.classList.add("dragging");
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
      document.body.style.cursor = "";
    }
  });
}

export function initMenu() {
  const menuBar = document.querySelector('.tb-menu');
  if (!menuBar) return;

  let isActive = false;
  const wrappers = menuBar.querySelectorAll('.menu-wrapper');

  // Cerrar al hacer clic afuera
  document.addEventListener('click', (e) => {
    if (!menuBar.contains(e.target)) {
      isActive = false;
      wrappers.forEach(w => w.classList.remove('open'));
    }
  });

  wrappers.forEach(wrapper => {
    const btn = wrapper.querySelector('.menu-btn');

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

export function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+Z = Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
    // Ctrl+Shift+Z or Ctrl+Y = Redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
    }
  });
}
