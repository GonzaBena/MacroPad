import { state } from "./state.js";
import { log } from "./monitor.js";
import { showToast } from "./ui.js";

export async function refreshPorts() {
  const sel = document.getElementById("port-sel");
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Seleccioná un puerto —</option>';
  const ports = await window.arduino.listPorts();
  ports.forEach((p) => {
    const o = document.createElement("option");
    o.value = p.path;
    //const desc = p.signature || p.friendlyName || p.manufacturer || p.pnpId || "";
    const desc = "MACROBALL_V1";
    //o.textContent = p.path + (desc ? ` (${desc})` : "");
    o.textContent = desc ? desc : "puerto";
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

export function cancelReconnect() {
  window.arduino.send("cancel-reconnect-placeholder");
  // Use the IPC channel
  // We need a dedicated way - let's just disconnect
  window.arduino.disconnect();
  showToast("Reconexión cancelada", "Se detuvo la reconexión automática");
}
window.cancelReconnect = cancelReconnect;

export function handleConnectionStatus(
  c,
  port,
  baud,
  reconnecting,
  attempt,
  maxAttempts,
) {
  state.connected = c;
  document.getElementById("tb-dot").classList.toggle("on", c);
  document.getElementById("s-dot").classList.toggle("on", c);
  const st = document.getElementById("s-text");
  st.textContent = c ? `${port} @ ${baud}` : "Desconectado";
  st.classList.toggle("on", c);
  const btn = document.getElementById("btn-conn");
  btn.textContent = c ? "Desconectar" : "Conectar";
  btn.className = c ? "btn btn-ghost" : "btn btn-primary";

  // Handle reconnect indicator
  const indicator = document.getElementById("reconnect-indicator");
  if (indicator) {
    if (reconnecting && !c) {
      indicator.classList.remove("d-none");
      const text = document.getElementById("reconnect-text");
      if (text)
        text.textContent = `Reconectando... (${attempt}/${maxAttempts})`;
    } else {
      indicator.classList.add("d-none");
    }
  }

  if (c) {
    log(`Conectado a ${port}`, "sys");
    if (reconnecting === false) {
      // Was reconnecting, now connected
      showToast("Reconectado", `Conexión restaurada en ${port}`);
    }
  } else if (!reconnecting) {
    log("Desconectado", "sys");
  }
}
