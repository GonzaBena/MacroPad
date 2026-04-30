// ── Estado ─────────────────────────────────────────────────────────────────
let connected = false;
let mappings = {}; // { SEÑAL: { type, value } }
let logAll = [];
let stats = { sig: 0, act: 0, err: 0 };

const ACTION_TYPES = [
  { value: "none", label: "— Sin acción —" },
  { value: "open_url", label: "Abrir URL" },
  { value: "run_command", label: "Ejecutar comando" },
  { value: "open_file", label: "Abrir archivo" },
  { value: "open_folder", label: "Abrir carpeta" },
  { value: "notification", label: "Notificación" },
];

const VALUE_PH = {
  open_url: "https://ejemplo.com",
  run_command: "notepad.exe  /  ./script.sh",
  open_file: "C:\\ruta\\archivo.pdf",
  open_folder: "C:\\ruta\\carpeta",
  notification: "Mensaje de la notificación",
  none: "",
};

// ── Init ───────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  refreshPorts();
  loadMappings();
  document.getElementById("send-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendSerial();
  });
  document.getElementById("new-sig").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addMapping();
  });
  log("Sistema listo", "sys");
});

// ── Puertos ────────────────────────────────────────────────────────────────
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

// ── Conexión ───────────────────────────────────────────────────────────────
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
  const a = mappings[signal];
  if (a && a.type !== "none") {
    stats.act++;
    document.getElementById("st-act").textContent = stats.act;
    const label = ACTION_TYPES.find((t) => t.value === a.type)?.label || a.type;
    log(`Accion: ${label} → ${a.value}`, "act");
  }
  flashCard(signal);
});

window.arduino.onError((msg) => {
  stats.err++;
  document.getElementById("st-err").textContent = stats.err;
  log(`Error: ${msg}`, "err");
});

window.arduino.onNotification(({ title, body }) => showToast(title, body));

// ── Enviar al Arduino ──────────────────────────────────────────────────────
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

// ── Log ────────────────────────────────────────────────────────────────────
function log(msg, type = "sys") {
  const ts = new Date().toLocaleTimeString("es-AR", { hour12: false });
  logAll.push({ msg, type, ts });
  appendEntry({ msg, type, ts });
  document.getElementById("log-count").textContent =
    `${logAll.length} entradas`;
}

function appendEntry({ msg, type, ts }) {
  const badges = { sig: "Señal", act: "Acción", err: "Error", sys: "Sistema" };
  const container = document.getElementById("log-entries");
  document.getElementById("log-empty").style.display = "none";
  const div = document.createElement("div");
  div.className = `entry ${type}`;
  div.innerHTML = `
    <span class="e-ts">${ts}</span>
    <span class="e-msg">${escHtml(msg)}</span>
    <span class="e-badge">${badges[type] || type}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function filterLog() {
  const q = document.getElementById("log-filter").value.toLowerCase();
  const container = document.getElementById("log-entries");
  container.querySelectorAll(".entry").forEach((el) => el.remove());
  document.getElementById("log-empty").style.display = "none";
  const filtered = logAll.filter((e) => !q || e.msg.toLowerCase().includes(q));
  if (!filtered.length) {
    document.getElementById("log-empty").style.display = "";
    return;
  }
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

// ── Mappings ───────────────────────────────────────────────────────────────
function loadMappings() {
  try {
    const s = localStorage.getItem("ac-mappings");
    if (s) mappings = JSON.parse(s);
  } catch {}
  renderMappings();
  pushMappings();
}

function saveMappings() {
  localStorage.setItem("ac-mappings", JSON.stringify(mappings));
  pushMappings();
}

function pushMappings() {
  window.arduino.updateActions(mappings);
}

function addMapping() {
  const input = document.getElementById("new-sig");
  const sig = input.value.trim().toUpperCase().replace(/\s+/g, "_");
  if (!sig) return;
  if (mappings[sig]) {
    showToast("Ya existe", `"${sig}" ya está en la lista`);
    return;
  }
  mappings[sig] = { type: "none", value: "" };
  input.value = "";
  saveMappings();
  renderMappings();
}

function removeMapping(sig) {
  delete mappings[sig];
  saveMappings();
  renderMappings();
}

function updateMappingType(sig, type) {
  mappings[sig].type = type;
  mappings[sig].value = "";
  saveMappings();
  renderMappings();
}

function updateMappingValue(sig, val) {
  mappings[sig].value = val;
  saveMappings();
}

function renderMappings() {
  const list = document.getElementById("mapping-list");
  list.innerHTML = "";
  Object.entries(mappings).forEach(([sig, action]) => {
    const card = document.createElement("div");
    card.className = "m-card";
    card.id = `card-${CSS.escape(sig)}`;
    const needsVal = action.type !== "none";
    card.innerHTML = `
      <div class="m-signal">${escHtml(sig)}</div>
      <div class="m-row">
        <select onchange="updateMappingType('${escAttr(sig)}', this.value)">
          ${ACTION_TYPES.map((t) => `<option value="${t.value}" ${action.type === t.value ? "selected" : ""}>${t.label}</option>`).join("")}
        </select>
        <button class="btn-del" onclick="removeMapping('${escAttr(sig)}')" title="Eliminar">✕</button>
      </div>
      ${needsVal ? `<div class="m-value"><input type="text" value="${escAttr(action.value)}" placeholder="${escAttr(VALUE_PH[action.type] || "")}" oninput="updateMappingValue('${escAttr(sig)}',this.value)" /></div>` : ""}`;
    list.appendChild(card);
  });
}

function flashCard(sig) {
  const card = document.getElementById(`card-${CSS.escape(sig)}`);
  if (!card) return;
  card.style.borderColor = "var(--amber)";
  card.style.boxShadow = "0 0 12px rgba(245,166,35,.3)";
  setTimeout(() => {
    card.style.borderColor = "";
    card.style.boxShadow = "";
  }, 700);
}

// ── Tabs ───────────────────────────────────────────────────────────────────
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

// ── Toast ──────────────────────────────────────────────────────────────────
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

// ── Utils ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escAttr(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
