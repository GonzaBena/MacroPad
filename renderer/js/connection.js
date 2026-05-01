import { state } from './state.js';
import { log } from './monitor.js';
import { showToast } from './ui.js';

export async function refreshPorts() {
  const sel = document.getElementById("port-sel");
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Seleccioná un puerto —</option>';
  const ports = await window.arduino.listPorts();
  ports.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.path;
    const desc = p.signature ? p.signature : (p.manufacturer || "");
    o.textContent = p.path + (desc ? ` (${desc})` : "");
    if (p.path === prev) o.selected = true;
    sel.appendChild(o);
  });
  if (!ports.length) log("No se encontraron puertos seriales", "sys");
}
window.refreshPorts = refreshPorts;

export function toggleConnect() {
  if (state.connected) {
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
window.toggleConnect = toggleConnect;

export function handleConnectionStatus(c, port, baud) {
  state.connected = c;
  document.getElementById("tb-dot").classList.toggle("on", c);
  document.getElementById("s-dot").classList.toggle("on", c);
  const st = document.getElementById("s-text");
  st.textContent = c ? `${port} @ ${baud}` : "Desconectado";
  st.classList.toggle("on", c);
  const btn = document.getElementById("btn-conn");
  btn.textContent = c ? "Desconectar" : "Conectar";
  btn.className = c ? "btn btn-ghost" : "btn btn-primary";
  log(c ? `Conectado a ${port}` : "Desconectado", "sys");
}
