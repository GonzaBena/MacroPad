import { state } from './state.js';
import { escHtml, showToast } from './ui.js';

export function log(msg, type = "sys") {
  const ts = new Date().toLocaleTimeString("es-AR", { hour12: false });
  state.logAll.push({ msg, type, ts });
  const q = document.getElementById("log-filter")?.value.toLowerCase();
  if (!q || msg.toLowerCase().includes(q)) appendEntry({ msg, type, ts });
  document.getElementById("log-count").textContent = `${state.logAll.length} entradas`;
}

export function appendEntry({ msg, type, ts }) {
  const badges = { sig: "Señal", act: "Acción", err: "Error", sys: "Sistema" };
  document.getElementById("log-empty").style.display = "none";
  const div = document.createElement("div");
  div.className = `entry ${type}`;
  div.innerHTML = `<span class="e-ts">${ts}</span><span class="e-msg">${escHtml(msg)}</span><span class="e-badge">${badges[type] || type}</span>`;
  const c = document.getElementById("log-entries");
  if (c) {
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
  }
}

export function filterLog() {
  const q = document.getElementById("log-filter").value.toLowerCase();
  document.getElementById("log-entries").querySelectorAll(".entry").forEach((el) => el.remove());
  document.getElementById("log-empty").style.display = "";
  const filtered = state.logAll.filter((e) => !q || e.msg.toLowerCase().includes(q));
  if (!filtered.length) return;
  document.getElementById("log-empty").style.display = "none";
  filtered.forEach(appendEntry);
}
window.filterLog = filterLog;

export function clearLog() {
  state.logAll = [];
  state.stats = { sig: 0, act: 0, err: 0 };
  ["st-sig", "st-act", "st-err"].forEach((id) => (document.getElementById(id).textContent = "0"));
  document.getElementById("log-entries").querySelectorAll(".entry").forEach((el) => el.remove());
  document.getElementById("log-empty").style.display = "";
  document.getElementById("log-count").textContent = "0 entradas";
}
window.clearLog = clearLog;

export function sendSerial() {
  const input = document.getElementById("send-input");
  const val = input.value.trim();
  if (!val) return;
  if (!state.connected) {
    showToast("No conectado", "Conectá el puerto primero");
    return;
  }
  window.arduino.send(val);
  log(`Enviado: ${val}`, "act");
  input.value = "";
}
window.sendSerial = sendSerial;
