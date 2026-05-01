import { state, loadSignalsData } from './state.js';
import { loadView, initResizers, showToast } from './ui.js';
import { handleConnectionStatus, refreshPorts } from './connection.js';
import { log } from './monitor.js';
import { buildStepMenu, renderSignalList, updateParam } from './configure.js';

window.addEventListener("DOMContentLoaded", async () => {
  // 1. Cargar las vistas
  await loadView("main-sidebar", "views/sidebar.html");
  await loadView("tab-monitor", "views/monitor.html");
  await loadView("tab-configure", "views/configure.html");
  await loadView("cmd-modal-overlay", "views/cmd-modal.html");
  
  // 2. Setup de elementos estáticos iniciales
  initResizers();
  buildStepMenu();

  // 3. Cargar datos
  loadSignalsData();
  renderSignalList();
  refreshPorts();

  // 4. Agregar listeners para cosas cargadas
  document.getElementById("send-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.sendSerial();
  });
  document.getElementById("new-sig-cfg")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") window.addSignal();
  });
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("step-menu");
    if (menu && menu.classList.contains("open") && !e.target.closest(".add-step-wrap"))
      menu.classList.remove("open");
  });

  // 5. IPC listeners
  window.arduino.onStatus(({ connected: c, port, baud }) => {
    handleConnectionStatus(c, port, baud);
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

    if (state.selectedSig && signal) {
      window.testCurrentSignal();
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
      document.getElementById("cmd-modal-overlay").style.display = "flex";
    }
  });

  window.arduino.onKeyCaptured((combo) => {
    if (state.capturingIdx === null) return;
    const idx = state.capturingIdx;
    state.capturingIdx = null;
    const input = document.getElementById(`key-${idx}`);
    if (input) {
      input.value = combo;
      input.classList.remove("capturing");
      input.readOnly = false;
    }
    updateParam(idx, "combo", combo);
  });

  log("Sistema listo", "sys");
});
