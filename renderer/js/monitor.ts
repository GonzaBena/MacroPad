import { state } from './state.js';
import { escHtml, showToast } from './ui.js';

export function log(msg: string, type = "sys") {
  const ts = new Date().toLocaleTimeString("es-AR", { hour12: false });
  state.logAll.push({ msg, type, ts });
  const q = (document.getElementById("log-filter") as HTMLInputElement | null)?.value.toLowerCase();
  if (!q || msg.toLowerCase().includes(q)) appendEntry({ msg, type, ts });
  const countEl = document.getElementById("log-count");
  if (countEl) countEl.textContent = `${state.logAll.length} entradas`;
}

export function appendEntry({ msg, type, ts }: { msg: string, type: string, ts: string }) {
  const badges: Record<string, string> = { sig: "Señal", act: "Acción", err: "Error", sys: "Sistema" };
  const emptyEl = document.getElementById("log-empty");
  if (emptyEl) emptyEl.style.display = "none";
  
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
  const q = (document.getElementById("log-filter") as HTMLInputElement).value.toLowerCase();
  const entriesEl = document.getElementById("log-entries");
  if (entriesEl) {
    entriesEl.querySelectorAll(".entry").forEach((el) => el.remove());
  }
  const emptyEl = document.getElementById("log-empty");
  if (emptyEl) emptyEl.style.display = "";
  
  const filtered = state.logAll.filter((e) => !q || e.msg.toLowerCase().includes(q));
  if (!filtered.length) return;
  
  if (emptyEl) emptyEl.style.display = "none";
  filtered.forEach(appendEntry);
}
(window as any).filterLog = filterLog;

export function clearLog() {
  state.logAll = [];
  state.stats = { sig: 0, act: 0, err: 0, success: 0, failure: 0 };
  ["st-sig", "st-act", "st-err"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = "0";
  });
  const entriesEl = document.getElementById("log-entries");
  if (entriesEl) {
    entriesEl.querySelectorAll(".entry").forEach((el) => el.remove());
  }
  const emptyEl = document.getElementById("log-empty");
  if (emptyEl) emptyEl.style.display = "";
  
  const countEl = document.getElementById("log-count");
  if (countEl) countEl.textContent = "0 entradas";
}
window.clearLog = clearLog;

export function sendSerial() {
  const input = document.getElementById("send-input") as HTMLInputElement | null;
  if (!input) return;
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
