import { state, loadSignalsData, loadConfig, saveConfig } from './state.js';
import { loadView, initResizers, initMenu, initKeyboardShortcuts, showToast, openConfigView, undo, redo, exportConfig, importConfig, closeConfigView, saveConfigView, closeCmdModal, about, applyTheme } from './ui.js';
import { handleConnectionStatus, refreshPorts, toggleConnect, cancelReconnect } from './connection.js';
import { log, filterLog, clearLog, sendSerial } from './monitor.js';
import { buildStepMenu, renderSignalList, updateParam, initFlowDelegation, addSignal, deleteCurrentSignal, updateSignalLabel, toggleAssignMenu, assignSpeed, testCurrentSignal, toggleStepMenu, importWorkflow, initAssignDropdown } from './workflows.js';

window.addEventListener("DOMContentLoaded", async () => {
  // 1. Cargar las vistas
  await loadView("main-sidebar", "views/sidebar.html");
  await loadView("tab-monitor", "views/monitor.html");
  await loadView("tab-workflows", "views/workflows.html");
  await loadView("cmd-modal-overlay", "views/cmd-modal.html");

  // 2. Cablear event listeners de index.html (sin onclick inline — requerido por CSP)
  document.getElementById("wbtn-min")?.addEventListener("click", () => window.arduino.minimize());
  document.getElementById("wbtn-max")?.addEventListener("click", () => window.arduino.maximize());
  document.getElementById("wbtn-close")?.addEventListener("click", () => window.arduino.close());
  document.getElementById("menu-config")?.addEventListener("click", openConfigView);
  document.getElementById("menu-exit")?.addEventListener("click", () => window.arduino.close());
  document.getElementById("menu-undo")?.addEventListener("click", undo);
  document.getElementById("menu-redo")?.addEventListener("click", redo);
  document.getElementById("menu-about")?.addEventListener("click", about);
  document.getElementById("menu-check-updates")?.addEventListener("click", () => window.arduino.checkForUpdates());

  // Tabs — delegado con data-tab
  document.querySelectorAll(".tab[data-tab]").forEach((tabEl) => {
    tabEl.addEventListener("click", () => {
      const name = tabEl.dataset.tab;
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      tabEl.classList.add("active");
      document.getElementById(`tab-${name}`)?.classList.add("active");
    });
  });

  // 3. Setup inicial
  initResizers();
  initMenu();
  initKeyboardShortcuts();
  initZoom();
  buildStepMenu();
  initFlowDelegation(); // Event delegation para step cards

  // 4. Cablear elementos de las vistas cargadas
  // Sidebar
  document.getElementById("btn-conn")?.addEventListener("click", toggleConnect);
  document.getElementById("btn-refresh-ports")?.addEventListener("click", refreshPorts);
  document.getElementById("btn-refresh-ports2")?.addEventListener("click", refreshPorts);
  document.getElementById("btn-cancel-reconnect")?.addEventListener("click", cancelReconnect);

  // Monitor
  document.getElementById("log-filter")?.addEventListener("input", filterLog);
  document.getElementById("btn-clear-log")?.addEventListener("click", clearLog);
  document.getElementById("send-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendSerial();
  });
  document.getElementById("btn-send-serial")?.addEventListener("click", sendSerial);

  // Workflows panel
  document.getElementById("new-sig-cfg")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSignal();
  });
  document.getElementById("btn-add-signal")?.addEventListener("click", addSignal);
  document.getElementById("btn-import-workflow")?.addEventListener("click", (e) => {
    e.stopPropagation();
    importWorkflow(e);
  });
  document.getElementById("add-step-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleStepMenu();
  });
  document.getElementById("se-label-input")?.addEventListener("input", (e) => updateSignalLabel(e.target.value));
  document.getElementById("btn-assign")?.addEventListener("click", (e) => toggleAssignMenu(e));
  document.getElementById("btn-test")?.addEventListener("click", testCurrentSignal);
  document.getElementById("btn-del-sig")?.addEventListener("click", deleteCurrentSignal);

  // Config view
  document.getElementById("btn-back-config")?.addEventListener("click", closeConfigView);
  document.getElementById("btn-save-config")?.addEventListener("click", saveConfigView);
  document.getElementById("btn-export")?.addEventListener("click", exportConfig);
  document.getElementById("btn-import")?.addEventListener("click", importConfig);

  // Modal close
  document.getElementById("btn-close-modal")?.addEventListener("click", closeCmdModal);

  // Close menus on outside click
  document.addEventListener("click", (e) => {
    // Step menu
    const menu = document.getElementById("step-menu");
    if (menu && menu.classList.contains("open") && !e.target.closest("#step-menu"))
      menu.classList.remove("open");
    
    // Assign dropdown
    const drop = document.getElementById("assign-dropdown");
    if (drop && drop.classList.contains("show") && !e.target.closest(".assign-dropdown-wrap"))
      drop.classList.remove("show");
  });

  // 5. Cargar datos
  await loadConfig();
  await loadSignalsData();

  // 6. Aplicar pestaña inicial
  const initialTab = state.config.initialTab || "monitor";
  const tabBtn = document.querySelector(`.tab[data-tab="${initialTab}"]`);
  if (tabBtn) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
    tabBtn.classList.add("active");
    document.getElementById(`tab-${initialTab}`)?.classList.add("active");
  }

  renderSignalList();
  initAssignDropdown();
  
  // Sincronizar estado de conexión al iniciar
  const initStatus = await window.arduino.getConnectionStatus();
  if (initStatus) {
    handleConnectionStatus(initStatus.connected, initStatus.port, initStatus.baud, false, 0, 0);
  } else {
    refreshPorts();
  }

  // 6. IPC listeners
  window.arduino.onStatus(({ connected: c, port, baud, reconnecting, attempt, maxAttempts }) => {
    handleConnectionStatus(c, port, baud, reconnecting, attempt, maxAttempts);
  });

  window.arduino.onData(({ signal }) => {
    state.stats.sig++;
    document.getElementById("st-sig").textContent = state.stats.sig;
    log(signal, "sig");
    const entry = state.signals[signal];
    if (entry?.steps?.length) {
      state.stats.act += entry.steps.length;
      document.getElementById("st-act").textContent = state.stats.act;
      log(`Ejecutando ${entry.steps.length} paso(s) para "${signal}"`, "act");
    }
  });

  window.arduino.onSequenceStart((signal) => {
    const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(signal)}"]`);
    if (card) card.classList.add("running");
  });

  window.arduino.onSequenceEnd((signal) => {
    const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(signal)}"]`);
    if (card) card.classList.remove("running");
  });

  window.arduino.onError((msg) => {
    state.stats.err++;
    document.getElementById("st-err").textContent = state.stats.err;
    log(`Error: ${msg}`, "err");
  });

  window.arduino.onNotification(({ title, body }) => showToast(title, body));

  window.arduino.onActionResult(({ cmd, ok, output }) => {
    const result = (output || "").trim();
    if (result) {
      document.getElementById("cmd-modal-cmd").textContent = cmd;
      const outEl = document.getElementById("cmd-modal-output");
      outEl.textContent = result;
      outEl.className = ok ? "" : "error";
      document.getElementById("cmd-modal-overlay").classList.remove("d-none");
    }
  });

  window.arduino.onKeyCaptured((combo) => {
    if (state.capturingIdx === null) return;
    const idx = state.capturingIdx;
    state.capturingIdx = null;
    const input = document.querySelector(`.param-input[data-idx="${idx}"][data-param="combo"]`);
    if (input) {
      input.value = combo;
      input.classList.remove("capturing");
      input.readOnly = false;
    }
    updateParam(idx, "combo", combo);
  });

  log("Sistema listo", "sys");

  // Listen for update notifications
  window.arduino.onUpdateMessage(({ text, type }) => {
    showToast(type === "error" ? "Actualizador" : "PokePad Update", text);
  });

  // Listen for theme changes from other windows
  window.arduino.onApplyTheme(async () => {
    await loadConfig();
  });
});

// ── Lógica de Zoom ──
let zoomTimeout = null;

function applyZoom(factor) {
  state.config.zoomLevel = factor;
  window.arduino.setZoomFactor(factor);
  
  // Guardado debounced para no saturar el disco al hacer scroll rápido
  if (zoomTimeout) clearTimeout(zoomTimeout);
  zoomTimeout = setTimeout(() => {
    saveConfig();
  }, 1000);
}

function initZoom() {
  // 1. Zoom con Rueda del Mouse (Ctrl + Scroll)
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !state.config.enableZoom) return;
    
    e.preventDefault();
    let currentZoom = state.config.zoomLevel || 1.0;
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    const newZoom = Math.min(Math.max(currentZoom + delta, 0.5), 3.0);
    
    applyZoom(newZoom);
  }, { passive: false });

  // 2. Zoom con Teclado (Ctrl + Plus/Minus/0)
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || !state.config.enableZoom) return;

    let currentZoom = state.config.zoomLevel || 1.0;
    
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      applyZoom(Math.min(currentZoom + 0.1, 3.0));
    } else if (e.key === '-') {
      e.preventDefault();
      applyZoom(Math.max(currentZoom - 0.1, 0.5));
    } else if (e.key === '0') {
      e.preventDefault();
      applyZoom(1.0);
    }
  });
}

