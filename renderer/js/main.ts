import { state, loadSignalsData, loadConfig, saveConfig, saveSignals } from './state.js';
import { loadView, initResizers, initMenu, initKeyboardShortcuts, showToast, openConfigView, undo, redo, exportConfig, importConfig, closeConfigView, saveConfigView, closeCmdModal, about, applyTheme } from './ui.js';
import { handleConnectionStatus, refreshPorts, toggleConnect, cancelReconnect } from './connection.js';
import { log, filterLog, clearLog, sendSerial } from './monitor.js';
import { renderMetrics } from './metrics.js';
import {
  buildStepMenu,
  renderSignalList,
  updateParam,
  initFlowDelegation,
  addSignal,
  addFolder,
  changeSort,
  deleteCurrentSignal,
  updateSignalLabel,
  toggleAssignMenu,
  assignSpeed,
  testCurrentSignal,
  toggleStepMenu,
  importWorkflow,
  initAssignDropdown,
  renderFlow,
  updateCardMeta,
  openGlobalVarsModal,
  renderGlobalVarsSection,
  refreshRunningApps,
} from "./workflows.js";

window.addEventListener("DOMContentLoaded", async () => {
  // 1. Cargar las vistas
  await loadView("main-sidebar", "views/sidebar.html");
  await loadView("tab-monitor", "views/monitor.html");
  await loadView("tab-workflows", "views/workflows.html");
  await loadView("tab-metrics", "views/metrics.html");
  await loadView("cmd-modal-overlay", "views/cmd-modal.html");
  await loadView("app-modal-container", "views/app-modal.html");

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
      const name = (tabEl as HTMLElement).dataset.tab;
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
      tabEl.classList.add("active");
      document.getElementById(`tab-${name}`)?.classList.add("active");
      
      if (name === "metrics") renderMetrics();
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
  // Sidebar — Serial
  document.getElementById("btn-conn")?.addEventListener("click", toggleConnect);
  document.getElementById("btn-refresh-ports")?.addEventListener("click", refreshPorts);
  document.getElementById("btn-refresh-ports2")?.addEventListener("click", refreshPorts);
  document.getElementById("btn-cancel-reconnect")?.addEventListener("click", cancelReconnect);

  // Sidebar — Global Vars
  document.getElementById("btn-sb-add-gv")?.addEventListener("click", openGlobalVarsModal);

  // Monitor
  document.getElementById("log-filter")?.addEventListener("input", filterLog);
  document.getElementById("btn-clear-log")?.addEventListener("click", clearLog);
  document.getElementById("send-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendSerial();
  });
  document.getElementById("btn-send-serial")?.addEventListener("click", sendSerial);

  // Activity Bar
  document.getElementById("ab-btn-serial")?.addEventListener("click", () => switchSidebarSection("serial"));
  document.getElementById("ab-btn-global-vars")?.addEventListener("click", () => {
    switchSidebarSection("global-vars");
    if (!state.config.sidebarCollapsed) renderGlobalVarsSection();
  });
  document.getElementById("ab-btn-add-signal")?.addEventListener("click", addSignal);
  document.getElementById("ab-btn-add-folder")?.addEventListener("click", addFolder);

  // Workflows panel
  const sortSel = document.getElementById("sort-workflows") as HTMLSelectElement | null;
  if (sortSel) {
    sortSel.value = state.config.workflowSort || "original";
    sortSel.addEventListener("change", (e) => changeSort((e.target as HTMLSelectElement).value));
  }

  document.getElementById("btn-import-workflow")?.addEventListener("click", (e) => {
    e.stopPropagation();
    importWorkflow(e);
  });
  document.getElementById("add-step-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleStepMenu();
  });
  document.getElementById("se-label-input")?.addEventListener("input", (e) => updateSignalLabel((e.target as HTMLInputElement).value));
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
    if (menu && menu.classList.contains("open") && !(e.target as HTMLElement).closest("#step-menu"))
      menu.classList.remove("open");
    
    // Assign dropdown
    const drop = document.getElementById("assign-dropdown");
    if (drop && drop.classList.contains("show") && !(e.target as HTMLElement).closest(".assign-dropdown-wrap"))
      drop.classList.remove("show");
  });

  // 5. Cargar datos
  await loadConfig();
  await loadSignalsData();

  // 6. Aplicar pestaña inicial
  const initialTab = state.config.initialTab || "monitor";
  const tabBtn = document.querySelector(`.tab[data-tab="${initialTab}"]`) as HTMLElement | null;
  if (tabBtn) {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
    tabBtn.classList.add("active");
    const pane = document.getElementById(`tab-${initialTab}`);
    if (pane) pane.classList.add("active");
  }

  renderSignalList();
  initAssignDropdown();
  if (!state.config.sidebarCollapsed && state.config.activeSidebarSection === "global-vars") {
    renderGlobalVarsSection();
  }
  refreshRunningApps(); // Pre-fetch apps list
  
  // Sincronizar estado de conexión al iniciar
  const initStatus = await window.arduino.getConnectionStatus();
  if (initStatus?.connected) {
    handleConnectionStatus(initStatus.connected, initStatus.port, initStatus.baud, false, 0, 0);
  } else {
    await refreshPorts();

    // Si hay dispositivos en la lista, esperar a que el auto-connect conecte (máx 10s)
    const portSel = document.getElementById("port-sel") as HTMLSelectElement | null;
    if (portSel && portSel.options.length > 1) {
      const splashStatus = document.getElementById("splash-status");
      if (splashStatus) splashStatus.textContent = "Conectando...";

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 10000);
        window.arduino.onStatus(({ connected, port, baud, reconnecting, attempt, maxAttempts }: any) => {
          if (connected) {
            handleConnectionStatus(connected, port, baud, reconnecting, attempt, maxAttempts);
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    }
  }

  // Ocultar splash una vez que sabemos el estado del dispositivo
  const splash = document.getElementById("splash");
  if (splash) {
    splash.classList.add("fade-out");
    splash.addEventListener("transitionend", () => splash.classList.add("hidden"), { once: true });
  }

  // 6. IPC listeners
  window.arduino.onStatus(({ connected: c, port, baud, reconnecting, attempt, maxAttempts }) => {
    handleConnectionStatus(c, port, baud, reconnecting, attempt, maxAttempts);
  });

  window.arduino.onData(({ signal }) => {
    state.stats.sig++;
    const sigEl = document.getElementById("st-sig");
    if (sigEl) sigEl.textContent = String(state.stats.sig);
    log(signal, "sig");
    const entry = state.signals[signal];
    if (entry?.steps?.length) {
      state.stats.act += entry.steps.length;
      const actEl = document.getElementById("st-act");
      if (actEl) actEl.textContent = String(state.stats.act);
      log(`Ejecutando ${entry.steps.length} paso(s) para "${signal}"`, "act");
    }
  });

  window.arduino.onSequenceStart((signal) => {
    console.log(`Sequence start: ${signal}, Selected: ${state.selectedSig}`);
    const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(signal)}"]`);
    if (card) card.classList.add("running");
    if (signal === state.selectedSig) {
      const btn = document.getElementById("btn-test");
      if (btn) {
        btn.classList.add("running");
        btn.innerHTML = "<span>⏳ Ejecutando...</span>";
      }
    }
  });

  window.arduino.onSequenceEnd(({ signal, success }) => {
    console.log(`Sequence end: ${signal}, success: ${success}`);
    const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(signal)}"]`);
    if (card) card.classList.remove("running");
    if (signal === state.selectedSig) {
      const btn = document.getElementById("btn-test");
      if (btn) {
        btn.classList.remove("running");
        btn.innerHTML = "<span>▶ Probar</span>";
      }
    }

    // Actualizar estadísticas e historial
    if (success) state.stats.success++;
    else state.stats.failure++;

    state.history.unshift({
      signal,
      success,
      timestamp: Date.now()
    });
    if (state.history.length > 10) state.history.pop();

    // Increment run counter
    const entry = state.signals[signal];
    if (entry) {
      entry.runCount = (entry.runCount || 0) + 1;
      updateCardMeta(signal, entry);
    }
    saveSignals();

    // Refrescar métricas si están visibles
    if (document.getElementById("tab-metrics")?.classList.contains("active")) {
      renderMetrics();
    }
  });

  window.arduino.onError((msg) => {
    state.stats.err++;
    const errEl = document.getElementById("st-err");
    if (errEl) errEl.textContent = String(state.stats.err);
    log(`Error: ${msg}`, "err");
  });

  window.arduino.onNotification(({ title, body }) => showToast(title, body));

  window.arduino.onActionResult(({ cmd, ok, output }) => {
    const result = (output || "").trim();
    if (result) {
      const cmdEl = document.getElementById("cmd-modal-cmd");
      if (cmdEl) cmdEl.textContent = cmd;
      const outEl = document.getElementById("cmd-modal-output");
      if (outEl) {
          outEl.textContent = result;
          outEl.className = ok ? "" : "error";
      }
      document.getElementById("cmd-modal-overlay")?.classList.remove("d-none");
    }
  });

  window.arduino.onKeyCaptured((combo) => {
    if (state.capturingPath === null) return;
    const path = JSON.parse(state.capturingPath as any);
    state.capturingPath = null;
    
    const input = document.querySelector(`.param-input[data-path='${JSON.stringify(path)}'][data-param="combo"]`) as HTMLInputElement | null;
    if (input) {
      input.value = combo;
      input.classList.remove("capturing");
      input.readOnly = false;
    }
    updateParam(path, "combo", combo);
  });

  window.arduino.onRegionSelected(({ x, y, width, height }) => {
    if (state.selectingRegionPath === null) return;
    const path = JSON.parse(state.selectingRegionPath as any);
    state.selectingRegionPath = null;
    
    updateParam(path, "x", x);
    updateParam(path, "y", y);
    updateParam(path, "w", width);
    updateParam(path, "h", height);
    
    renderFlow();
  });

  // Listen for update notifications
  window.arduino.onUpdateMessage(({ text, type }) => {
    showToast(type === "error" ? "Actualizador" : "PokePad Update", text);
  });

  // Listen for theme changes from other windows
  window.arduino.onApplyTheme(async () => {
    await loadConfig();
  });
});

// ── Sidebar section switching ──

function switchSidebarSection(section: string) {
  const isOpen = !state.config.sidebarCollapsed;
  const isSame = state.config.activeSidebarSection === section;
  if (isOpen && isSame) {
    state.config.sidebarCollapsed = true;
  } else {
    state.config.activeSidebarSection = section;
    state.config.sidebarCollapsed = false;
  }
  saveConfig();
}

// ── Lógica de Zoom ──
let zoomTimeout: any = null;

function applyZoom(factor: number) {
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
