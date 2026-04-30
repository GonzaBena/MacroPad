// ── Constantes ─────────────────────────────────────────────────────────────
const STEP_TYPES = {
  keypress: { label: "Simular tecla", icon: "⌨", cls: "t-keypress" },
  wait: { label: "Esperar", icon: "◷", cls: "t-wait" },
  clipboard: { label: "Copiar texto", icon: "⎘", cls: "t-clipboard" },
  media: { label: "Media", icon: "▶", cls: "t-media" },
  open_url: { label: "Abrir URL", icon: "↗", cls: "t-open_url" },
  run_cmd: { label: "Ejecutar cmd", icon: "$", cls: "t-run_cmd" },
  open_file: { label: "Abrir archivo", icon: "⌂", cls: "t-open_file" },
  notify: { label: "Notificación", icon: "◉", cls: "t-notify" },
};

const MEDIA_OPTIONS = [
  { value: "play_pause", label: "Play / Pause" },
  { value: "next", label: "Siguiente" },
  { value: "prev", label: "Anterior" },
  { value: "vol_up", label: "Subir volumen" },
  { value: "vol_down", label: "Bajar volumen" },
  { value: "mute", label: "Mute" },
];

const SIG_COLORS = [
  "#f5a623",
  "#3ddc84",
  "#5b8ef0",
  "#a78bfa",
  "#f472b6",
  "#2dd4bf",
  "#fb923c",
  "#ff4d6a",
];

// ── Estado ──────────────────────────────────────────────────────────────────
let connected = false;
let signals = {}; // { SEÑAL: { label, color, steps:[...] } }
let selectedSig = null;
let logAll = [];
let stats = { sig: 0, act: 0, err: 0 };
let dragSrcIdx = null;

// ── Init ────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  loadSignals();
  buildStepMenu();
  refreshPorts();
  initResizers();
  document.getElementById("send-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendSerial();
  });
  document.getElementById("new-sig-cfg").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSignal();
  });
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("step-menu");
    if (menu.classList.contains("open") && !e.target.closest(".add-step-wrap"))
      menu.classList.remove("open");
  });

  // Key capture result desde el proceso principal
  window.arduino.onKeyCaptured((combo) => {
    if (capturingIdx === null) return;
    const idx = capturingIdx;
    capturingIdx = null;
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

// ── IPC listeners ───────────────────────────────────────────────────────────
window.arduino.onStatus(({ connected: c, port, baud }) => {
  connected = c;
  document.getElementById("tb-dot").classList.toggle("on", c);
  document.getElementById("s-dot").classList.toggle("on", c);
  const st = document.getElementById("s-text");
  st.textContent = c ? `${port} @ ${baud}` : "Desconectado";
  st.classList.toggle("on", c);
  const btn = document.getElementById("btn-conn");
  btn.textContent = c ? "Desconectar" : "Conectar";
  btn.className = c ? "btn btn-ghost" : "btn btn-primary";
  log(c ? `Conectado a ${port}` : "Desconectado", "sys");
});

window.arduino.onData(({ signal }) => {
  stats.sig++;
  document.getElementById("st-sig").textContent = stats.sig;
  log(signal, "sig");

  const entry = signals[signal];
  if (entry?.steps?.length) {
    stats.act += entry.steps.length;
    document.getElementById("st-act").textContent = stats.act;
    log(`Ejecutando ${entry.steps.length} paso(s) para "${signal}"`, "act");
  }

  // Verifica si hay una señal seleccionada en la UI y si el botón
  // físico que pulsaste coincide con esa señal.
  if (selectedSig && signal) {
    testCurrentSignal();
  }
});

window.arduino.onSequenceStart((signal) => {
  const card = document.querySelector(
    `.sig-card[data-sig="${CSS.escape(signal)}"]`,
  );
  if (card) card.classList.add("running");
});

window.arduino.onSequenceEnd((signal) => {
  const card = document.querySelector(
    `.sig-card[data-sig="${CSS.escape(signal)}"]`,
  );
  if (card) card.classList.remove("running");
});

window.arduino.onError((msg) => {
  stats.err++;
  document.getElementById("st-err").textContent = stats.err;
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

// ── Conexión ─────────────────────────────────────────────────────────────────
async function refreshPorts() {
  const sel = document.getElementById("port-sel");
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Seleccioná un puerto —</option>';
  const ports = await window.arduino.listPorts();
  ports.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.path;
    o.textContent = p.path + (p.manufacturer ? ` (${p.manufacturer})` : "");
    if (p.path === prev) o.selected = true;
    sel.appendChild(o);
  });
  if (!ports.length) log("No se encontraron puertos seriales", "sys");
}

function toggleConnect() {
  if (connected) {
    window.arduino.disconnect();
  } else {
    const port = document.getElementById("port-sel").value;
    const baud = document.getElementById("baud-sel").value;
    if (!port) {
      showToast("Sin puerto", "Seleccioná un puerto primero");
      return;
    }
    log(`Conectando a ${port} @ ${baud}...`, "sys");
    window.arduino.connect(port, baud);
  }
}

// ── Monitor / Log ────────────────────────────────────────────────────────────
function log(msg, type = "sys") {
  const ts = new Date().toLocaleTimeString("es-AR", { hour12: false });
  logAll.push({ msg, type, ts });
  const q = document.getElementById("log-filter")?.value.toLowerCase();
  if (!q || msg.toLowerCase().includes(q)) appendEntry({ msg, type, ts });
  document.getElementById("log-count").textContent =
    `${logAll.length} entradas`;
}

function appendEntry({ msg, type, ts }) {
  const badges = { sig: "Señal", act: "Acción", err: "Error", sys: "Sistema" };
  document.getElementById("log-empty").style.display = "none";
  const div = document.createElement("div");
  div.className = `entry ${type}`;
  div.innerHTML = `<span class="e-ts">${ts}</span><span class="e-msg">${escHtml(msg)}</span><span class="e-badge">${badges[type] || type}</span>`;
  const c = document.getElementById("log-entries");
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
}

function filterLog() {
  const q = document.getElementById("log-filter").value.toLowerCase();
  document
    .getElementById("log-entries")
    .querySelectorAll(".entry")
    .forEach((el) => el.remove());
  document.getElementById("log-empty").style.display = "";
  const filtered = logAll.filter((e) => !q || e.msg.toLowerCase().includes(q));
  if (!filtered.length) return;
  document.getElementById("log-empty").style.display = "none";
  filtered.forEach(appendEntry);
}

function clearLog() {
  logAll = [];
  stats = { sig: 0, act: 0, err: 0 };
  ["st-sig", "st-act", "st-err"].forEach(
    (id) => (document.getElementById(id).textContent = "0"),
  );
  document
    .getElementById("log-entries")
    .querySelectorAll(".entry")
    .forEach((el) => el.remove());
  document.getElementById("log-empty").style.display = "";
  document.getElementById("log-count").textContent = "0 entradas";
}

function sendSerial() {
  const input = document.getElementById("send-input");
  const val = input.value.trim();
  if (!val) return;
  if (!connected) {
    showToast("No conectado", "Conectá el puerto primero");
    return;
  }
  window.arduino.send(val);
  log(`Enviado: ${val}`, "act");
  input.value = "";
}

// ── Signals ──────────────────────────────────────────────────────────────────
function loadSignals() {
  try {
    const s = localStorage.getItem("ac-signals");
    if (s) {
      const parsed = JSON.parse(s);
      // Migrate old format { SEÑAL: { type, value } } → new format
      Object.entries(parsed).forEach(([sig, val]) => {
        if (!val.steps) {
          signals[sig] = {
            label: val.label || "",
            color:
              val.color ||
              SIG_COLORS[Object.keys(signals).length % SIG_COLORS.length],
            steps:
              val.type && val.type !== "none"
                ? [
                    {
                      id: uid(),
                      type: migrateType(val.type),
                      params: migrateParams(val.type, val.value),
                    },
                  ]
                : [],
          };
        } else {
          signals[sig] = val;
        }
      });
    }
  } catch {}
  renderSignalList();
  pushSignals();
}

function migrateType(t) {
  return (
    {
      open_url: "open_url",
      run_command: "run_cmd",
      open_file: "open_file",
      open_folder: "open_file",
      notification: "notify",
    }[t] || "notify"
  );
}
function migrateParams(t, v) {
  if (t === "open_url") return { url: v };
  if (t === "run_command") return { cmd: v };
  if (t === "open_file") return { path: v };
  if (t === "open_folder") return { path: v };
  if (t === "notification") return { title: "Arduino", body: v };
  return {};
}

function saveSignals() {
  localStorage.setItem("ac-signals", JSON.stringify(signals));
  pushSignals();
}

function pushSignals() {
  window.arduino.updateSignals(signals);
}

function addSignal() {
  const input = document.getElementById("new-sig-cfg");
  const sig = input.value.trim().toUpperCase().replace(/\s+/g, "_");
  if (!sig) return;
  if (signals[sig]) {
    showToast("Ya existe", `"${sig}" ya está`);
    return;
  }
  const color = SIG_COLORS[Object.keys(signals).length % SIG_COLORS.length];
  signals[sig] = { label: "", color, steps: [] };
  input.value = "";
  saveSignals();
  renderSignalList();
  selectSignal(sig);
}

function deleteCurrentSignal() {
  if (!selectedSig) return;
  delete signals[selectedSig];
  selectedSig = null;
  saveSignals();
  renderSignalList();
  document.getElementById("se-empty").style.display = "";
  document.getElementById("se-content").style.display = "none";
}

function updateSignalLabel(val) {
  if (!selectedSig) return;
  signals[selectedSig].label = val;
  saveSignals();
  // Update card label
  const card = document.querySelector(
    `.sig-card[data-sig="${CSS.escape(selectedSig)}"]`,
  );
  if (card) {
    const lbl = card.querySelector(".sig-label");
    if (lbl) lbl.textContent = val;
  }
}

function selectSignal(sig) {
  selectedSig = sig;
  document
    .querySelectorAll(".sig-card")
    .forEach((c) => c.classList.toggle("active", c.dataset.sig === sig));
  document.getElementById("se-empty").style.display = "none";
  document.getElementById("se-content").style.display = "";
  document.getElementById("se-signal-tag").textContent = sig;
  document.getElementById("se-label-input").value = signals[sig]?.label || "";
  renderFlow();
}

function renderSignalList() {
  const list = document.getElementById("signal-list");
  list.innerHTML = "";
  Object.entries(signals).forEach(([sig, entry]) => {
    const div = document.createElement("div");
    div.className = "sig-card" + (sig === selectedSig ? " active" : "");
    div.dataset.sig = sig;
    div.innerHTML = `
      <div class="sig-card-top">
        <span style="width:8px;height:8px;border-radius:50%;background:${entry.color};flex-shrink:0;display:inline-block"></span>
        <span class="sig-name">${escHtml(sig)}</span>
        <span class="sig-pulse"></span>
      </div>
      ${entry.label ? `<div class="sig-label">${escHtml(entry.label)}</div>` : ""}
      <div class="sig-steps-count">${entry.steps?.length || 0} paso${(entry.steps?.length || 0) === 1 ? "" : "s"}</div>`;
    div.onclick = () => selectSignal(sig);
    list.appendChild(div);
  });
}

// ── Flow / Steps ─────────────────────────────────────────────────────────────
function renderFlow() {
  const fc = document.getElementById("flow-container");
  fc.innerHTML = "";
  const steps = signals[selectedSig]?.steps || [];

  if (!steps.length) {
    fc.innerHTML = `<div class="flow-empty"><span style="font-size:28px;opacity:.2">⋯</span><span>Sin pasos — agregá uno abajo</span></div>`;
    return;
  }

  steps.forEach((step, i) => {
    fc.appendChild(makeStepCard(step, i, steps.length));
    if (i < steps.length - 1) {
      const conn = document.createElement("div");
      conn.className = "step-connector";
      conn.innerHTML = '<span class="step-connector-arrow">↓</span>';
      fc.appendChild(conn);
    }
  });
}

function makeStepCard(step, idx, total) {
  const meta = STEP_TYPES[step.type] || STEP_TYPES.notify;
  const card = document.createElement("div");
  card.className = "step-card";
  card.draggable = true;
  card.dataset.idx = idx;

  // Header
  const header = document.createElement("div");
  header.className = "step-header";
  header.innerHTML = `
    <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
    <span class="step-type-badge ${meta.cls}">
      <span class="step-icon">${meta.icon}</span>
      <select class="step-type-select" onchange="changeStepType(${idx}, this.value)">
        ${Object.entries(STEP_TYPES)
          .map(
            ([k, v]) =>
              `<option value="${k}" ${step.type === k ? "selected" : ""}>${v.label}</option>`,
          )
          .join("")}
      </select>
    </span>
    <span class="step-num">#${idx + 1}</span>
    <button class="btn-del-step" onclick="deleteStep(${idx})" title="Eliminar paso">✕</button>`;
  card.appendChild(header);

  // Params
  const params = document.createElement("div");
  params.className = "step-params";
  params.innerHTML = renderStepParams(step, idx);
  card.appendChild(params);

  // Drag & drop
  card.addEventListener("dragstart", (e) => {
    dragSrcIdx = idx;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    document
      .querySelectorAll(".step-card")
      .forEach((c) => c.classList.remove("drag-over"));
  });
  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    card.classList.add("drag-over");
  });
  card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    if (dragSrcIdx === null || dragSrcIdx === idx) return;
    const steps = signals[selectedSig].steps;
    const [moved] = steps.splice(dragSrcIdx, 1);
    steps.splice(idx, 0, moved);
    dragSrcIdx = null;
    saveSignals();
    renderFlow();
  });

  return card;
}

function renderStepParams(step, idx) {
  const p = step.params || {};
  const i = idx;

  switch (step.type) {
    case "keypress":
      return `
      <div class="param-row">
        <div class="param-label">Combinación de teclas</div>
        <div style="display: flex; gap: 8px;">
          <input class="param-input key-input" id="key-${i}" value="${escAttr(p.combo || "")}" placeholder="ej: cmd+space, ctrl+c"
            oninput="updateParam(${i}, 'combo', this.value)" style="flex: 1;" />
          <button class="btn btn-ghost" onclick="startKeyCapture(${i})" title="Capturar teclas" style="padding: 0 10px; border: 1px solid rgba(255,255,255,0.2);">⌨️</button>
        </div>
        <div class="param-hint">Escribí la combinación manualmente o usá el botón para capturarla.</div>
      </div>`;

    case "wait":
      return `
      <div class="param-row">
        <div class="param-label">Duración (ms)</div>
        <input class="param-input" type="number" min="10" max="60000" value="${escAttr(String(p.ms || 500))}"
          oninput="updateParam(${i},'ms',this.value)" style="width:140px" />
      </div>`;

    case "clipboard":
      return `
      <div class="param-row">
        <div class="param-label">Texto a copiar</div>
        <input class="param-input" type="text" value="${escAttr(p.text || "")}" placeholder="Texto que irá al portapapeles"
          oninput="updateParam(${i},'text',this.value)" />
      </div>`;

    case "media":
      return `
      <div class="param-row">
        <div class="param-label">Acción</div>
        <select class="param-select" onchange="updateParam(${i},'action',this.value)">
          ${MEDIA_OPTIONS.map((o) => `<option value="${o.value}" ${p.action === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
        </select>
      </div>`;

    case "open_url":
      return `
      <div class="param-row">
        <div class="param-label">URL</div>
        <input class="param-input" type="text" value="${escAttr(p.url || "")}" placeholder="https://ejemplo.com"
          oninput="updateParam(${i},'url',this.value)" />
      </div>`;

    case "run_cmd":
      return `
      <div class="param-row">
        <div class="param-label">Comando</div>
        <input class="param-input" type="text" value="${escAttr(p.cmd || "")}" placeholder="open /Applications/Spotify.app"
          oninput="updateParam(${i},'cmd',this.value)" />
      </div>`;

    case "open_file":
      return `
      <div class="param-row">
        <div class="param-label">Ruta</div>
        <div style="display: flex; gap: 8px;">
          <input class="param-input" type="text" id="path-${i}" value="${escAttr(p.path || "")}" placeholder="/Users/vos/archivo.pdf"
            oninput="updateParam(${i},'path',this.value)" style="flex: 1;" />
          <button class="btn btn-ghost" onclick="browseFile(${i})" title="Seleccionar archivo" style="padding: 0 10px; border: 1px solid rgba(255,255,255,0.2); max-width: 32px;">📂</button>
        </div>
      </div>`;

    case "notify":
      return `
      <div class="param-row">
        <div class="param-label">Título</div>
        <input class="param-input" type="text" value="${escAttr(p.title || "")}" placeholder="Título de la notificación"
          oninput="updateParam(${i},'title',this.value)" />
      </div>
      <div class="param-row">
        <div class="param-label">Mensaje</div>
        <input class="param-input" type="text" value="${escAttr(p.body || "")}" placeholder="Cuerpo del mensaje"
          oninput="updateParam(${i},'body',this.value)" />
      </div>`;

    default:
      return "";
  }
}

function updateParam(idx, key, value) {
  if (!selectedSig) return;
  if (!signals[selectedSig].steps[idx].params)
    signals[selectedSig].steps[idx].params = {};
  signals[selectedSig].steps[idx].params[key] = value;
  saveSignals();
}

function changeStepType(idx, newType) {
  if (!selectedSig) return;
  signals[selectedSig].steps[idx] = {
    id: signals[selectedSig].steps[idx].id,
    type: newType,
    params: {},
  };
  saveSignals();
  renderFlow();
}

function deleteStep(idx) {
  if (!selectedSig) return;
  signals[selectedSig].steps.splice(idx, 1);
  saveSignals();
  renderSignalList(); // update step count
  renderFlow();
}

function addStep(type) {
  if (!selectedSig) return;
  const step = { id: uid(), type, params: defaultParams(type) };
  signals[selectedSig].steps.push(step);
  saveSignals();
  renderSignalList();
  renderFlow();
  // Scroll to bottom
  setTimeout(() => {
    const fc = document.getElementById("flow-container");
    fc.scrollTop = fc.scrollHeight;
  }, 50);
}

function defaultParams(type) {
  const d = {
    keypress: { combo: "" },
    wait: { ms: 500 },
    clipboard: { text: "" },
    media: { action: "play_pause" },
    open_url: { url: "" },
    run_cmd: { cmd: "" },
    open_file: { path: "" },
    notify: { title: "Arduino", body: "" },
  };
  return d[type] || {};
}

function testCurrentSignal() {
  if (!selectedSig) return;

  const card = document.querySelector(
    `.sig-card[data-sig="${CSS.escape(selectedSig)}"]`,
  );
  if (card && card.classList.contains("running")) {
    showToast("En ejecución", "La secuencia ya se está ejecutando");
    return;
  }

  window.arduino.testSequence(selectedSig);
  showToast(
    `▶ Probando "${selectedSig}"`,
    `${signals[selectedSig]?.steps?.length || 0} pasos`,
  );
}

// ── Key capture (vía main process para capturar Cmd, Ctrl, etc.) ─────────────
let capturingIdx = null;

function startKeyCapture(idx) {
  // Cancelar captura anterior si la había
  if (capturingIdx !== null) {
    const prev = document.getElementById(`key-${capturingIdx}`);
    if (prev) {
      prev.classList.remove("capturing");
      prev.readOnly = false;
      prev.value =
        signals[selectedSig]?.steps[capturingIdx]?.params?.combo || "";
    }
    window.arduino.stopKeyCapture();
  }

  capturingIdx = idx;
  const input = document.getElementById(`key-${idx}`);
  if (!input) return;
  input.classList.add("capturing");
  input.readOnly = true;
  input.value = "Presioná la combinación...";

  window.arduino.startKeyCapture();

  // Escape cancela (el DOM sí puede capturar Escape solo)
  const escHandler = (e) => {
    if (e.key !== "Escape") return;
    if (capturingIdx !== idx) {
      document.removeEventListener("keydown", escHandler);
      return;
    }
    capturingIdx = null;
    input.classList.remove("capturing");
    input.readOnly = false;
    input.value = signals[selectedSig]?.steps[idx]?.params?.combo || "";
    window.arduino.stopKeyCapture();
    document.removeEventListener("keydown", escHandler);
  };
  document.addEventListener("keydown", escHandler);
}

// ── Step menu ─────────────────────────────────────────────────────────────────
function buildStepMenu() {
  const menu = document.getElementById("step-menu");
  const groups = [
    { items: ["keypress", "wait", "clipboard"] },
    { items: ["media"] },
    { items: ["open_url", "run_cmd", "open_file"] },
    { items: ["notify"] },
  ];
  groups.forEach((group, gi) => {
    if (gi > 0) {
      const div = document.createElement("div");
      div.className = "menu-divider";
      menu.appendChild(div);
    }
    group.items.forEach((type) => {
      const meta = STEP_TYPES[type];
      const item = document.createElement("div");
      item.className = "menu-item";
      item.innerHTML = `
        <div class="menu-icon ${meta.cls}">${meta.icon}</div>
        <div class="menu-text">
          <span class="menu-label">${meta.label}</span>
        </div>`;
      item.onclick = () => {
        addStep(type);
        document.getElementById("step-menu").classList.remove("open");
      };
      menu.appendChild(item);
    });
  });
}

function toggleStepMenu() {
  if (!selectedSig) {
    showToast("Sin señal", "Seleccioná una señal primero");
    return;
  }
  const menu = document.getElementById("step-menu");
  const btn = document.getElementById("add-step-btn");
  if (menu.classList.contains("open")) {
    menu.classList.remove("open");
    return;
  }

  // Posicionar encima del botón con position:fixed
  const rect = btn.getBoundingClientRect();
  menu.style.display = "block"; // temporal para medir
  const menuH = menu.offsetHeight;
  menu.style.display = "";

  const top = rect.top - menuH - 8;
  const left = rect.left + rect.width / 2;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${left}px`;
  menu.style.transform = "translateX(-50%)";
  menu.classList.add("open");
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function switchTab(name, el) {
  document
    .querySelectorAll(".tab")
    .forEach((t) => t.classList.remove("active"));
  document
    .querySelectorAll(".tab-pane")
    .forEach((p) => p.classList.remove("active"));
  el.classList.add("active");
  document.getElementById(`tab-${name}`).classList.add("active");
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(title, body) {
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

// ── Utils ─────────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escAttr(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;");
}

function closeCmdModal() {
  document.getElementById("cmd-modal-overlay").style.display = "none";
}

async function browseFile(idx) {
  const path = await window.arduino.selectFile();
  if (path) {
    const input = document.getElementById(`path-${idx}`);
    if (input) input.value = path;
    updateParam(idx, "path", path);
  }
}

// ── Resizer Logic ─────────────────────────────────────────────────────────────
function initResizers() {
  setupResizer("main-resizer", "main-content", "--main-sidebar-w", 200, 600);
  setupResizer(
    "siglist-resizer",
    "config-content",
    "--sig-sidebar-w",
    160,
    400,
  );
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
