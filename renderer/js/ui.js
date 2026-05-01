import { state, saveConfig } from './state.js';

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
  document.getElementById("cmd-modal-overlay").style.display = "none";
}
window.closeCmdModal = closeCmdModal;

function initConfigColorPicker() {
  const hexInput = document.getElementById("cfg-accent");
  const btn      = document.getElementById("cfg-accent-btn");
  const preview  = document.getElementById("cfg-accent-preview");
  const picker   = document.getElementById("cfg-accent-picker");
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
  picker.addEventListener("input",  () => applyColor(picker.value));
  picker.addEventListener("change", () => applyColor(picker.value));

  applyColor(hexInput.value);
}

export function openConfigView() {
  document.getElementById("main-content").style.display = "none";
  document.getElementById("config-view").style.display = "flex";

  // Load current config into inputs
  const themeEl = document.getElementById("cfg-theme");
  const closeEl = document.getElementById("cfg-close");
  const accentEl = document.getElementById("cfg-accent");
  const pickerEl = document.getElementById("cfg-accent-picker");
  if (themeEl) themeEl.value = state.config.theme;
  if (closeEl) closeEl.value = state.config.closeBehavior;
  if (accentEl) { accentEl.value = (state.config.accentColor || "#f5a623").toUpperCase(); }
  if (pickerEl) pickerEl.value = state.config.accentColor || "#f5a623";

  initConfigColorPicker();
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
  document.getElementById("config-view").style.display = "none";
  document.getElementById("main-content").style.display = "";
}
window.closeConfigView = closeConfigView;

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
