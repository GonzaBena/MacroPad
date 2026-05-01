export const state = {
  connected: false,
  signals: {},
  selectedSig: null,
  logAll: [],
  stats: { sig: 0, act: 0, err: 0 },
  dragSrcIdx: null,
  capturingIdx: null
};

export const STEP_TYPES = {
  keypress: { label: "Simular tecla", icon: "⌨", cls: "t-keypress" },
  wait: { label: "Esperar", icon: "◷", cls: "t-wait" },
  clipboard: { label: "Copiar texto", icon: "⎘", cls: "t-clipboard" },
  media: { label: "Media", icon: "▶", cls: "t-media" },
  open_url: { label: "Abrir URL", icon: "↗", cls: "t-open_url" },
  run_cmd: { label: "Ejecutar cmd", icon: "$", cls: "t-run_cmd" },
  open_file: { label: "Abrir archivo", icon: "⌂", cls: "t-open_file" },
  notify: { label: "Notificación", icon: "◉", cls: "t-notify" },
};

export const MEDIA_OPTIONS = [
  { value: "play_pause", label: "Play / Pause" },
  { value: "next", label: "Siguiente" },
  { value: "prev", label: "Anterior" },
  { value: "vol_up", label: "Subir volumen" },
  { value: "vol_down", label: "Bajar volumen" },
  { value: "mute", label: "Mute" },
];

export const SIG_COLORS = [
  "#f5a623",
  "#3ddc84",
  "#5b8ef0",
  "#a78bfa",
  "#f472b6",
  "#2dd4bf",
  "#fb923c",
  "#ff4d6a",
];

export function pushSignals() {
  window.arduino.updateSignals(state.signals);
}

export function saveSignals() {
  localStorage.setItem("ac-signals", JSON.stringify(state.signals));
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

export function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function loadSignalsData() {
  try {
    const s = localStorage.getItem("ac-signals");
    if (s) {
      const parsed = JSON.parse(s);
      Object.entries(parsed).forEach(([sig, val]) => {
        if (!val.steps) {
          state.signals[sig] = {
            label: val.label || "",
            color:
              val.color ||
              SIG_COLORS[Object.keys(state.signals).length % SIG_COLORS.length],
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
            assignedToButton: val.assignedToButton || false,
          };
        } else {
          state.signals[sig] = val;
        }
      });
    }
  } catch (e) { console.error(e) }
  pushSignals();
}
