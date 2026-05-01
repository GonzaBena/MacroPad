import { state, SIG_COLORS, saveSignals, uid, STEP_TYPES, MEDIA_OPTIONS } from './state.js';
import { escHtml, escAttr, showToast } from './ui.js';

export function renderSignalList() {
  const list = document.getElementById("signal-list");
  if (!list) return;
  list.innerHTML = "";
  Object.entries(state.signals).forEach(([sig, entry]) => {
    const div = document.createElement("div");
    div.className = "sig-card" + (sig === state.selectedSig ? " active" : "");
    div.dataset.sig = sig;
    
    const badge = entry.assignedToButton 
      ? `<span title="Asignado al botón físico" style="font-size: 9px; background: var(--green); color: #000; padding: 2px 5px; border-radius: 4px; margin-left: 6px; font-weight: 700;">🔌 BOTÓN</span>` 
      : '';

    div.innerHTML = `
      <div class="sig-card-top">
        <span style="width:8px;height:8px;border-radius:50%;background:${entry.color};flex-shrink:0;display:inline-block"></span>
        <span class="sig-name">${escHtml(sig)}${badge}</span>
        <span class="sig-pulse"></span>
      </div>
      ${entry.label ? `<div class="sig-label">${escHtml(entry.label)}</div>` : ""}
      <div class="sig-steps-count">${entry.steps?.length || 0} paso${(entry.steps?.length || 0) === 1 ? "" : "s"}</div>`;
    div.onclick = () => selectSignal(sig);
    list.appendChild(div);
  });
}

export function addSignal() {
  const input = document.getElementById("new-sig-cfg");
  const sig = input.value.trim().toUpperCase().replace(/\s+/g, "_");
  if (!sig) return;
  if (state.signals[sig]) {
    showToast("Ya existe", `"${sig}" ya está`);
    return;
  }
  const color = SIG_COLORS[Object.keys(state.signals).length % SIG_COLORS.length];
  state.signals[sig] = { label: "", color, steps: [], assignedToButton: false };
  input.value = "";
  saveSignals();
  renderSignalList();
  selectSignal(sig);
}
window.addSignal = addSignal;

export function deleteCurrentSignal() {
  if (!state.selectedSig) return;
  delete state.signals[state.selectedSig];
  state.selectedSig = null;
  saveSignals();
  renderSignalList();
  document.getElementById("se-empty").style.display = "";
  document.getElementById("se-content").style.display = "none";
}
window.deleteCurrentSignal = deleteCurrentSignal;

export function updateSignalLabel(val) {
  if (!state.selectedSig) return;
  state.signals[state.selectedSig].label = val;
  saveSignals();
  const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(state.selectedSig)}"]`);
  if (card) {
    const lbl = card.querySelector(".sig-label");
    if (lbl) lbl.textContent = val;
  }
}
window.updateSignalLabel = updateSignalLabel;

export function selectSignal(sig) {
  state.selectedSig = sig;
  document.querySelectorAll(".sig-card").forEach((c) => c.classList.toggle("active", c.dataset.sig === sig));
  document.getElementById("se-empty").style.display = "none";
  document.getElementById("se-content").style.display = "";
  document.getElementById("se-signal-tag").textContent = sig;
  document.getElementById("se-label-input").value = state.signals[sig]?.label || "";
  
  updateAssignButtonUI();
  renderFlow();
}
window.selectSignal = selectSignal;

export function toggleAssignButton() {
  if (!state.selectedSig) return;
  const isAssigned = state.signals[state.selectedSig].assignedToButton;
  
  if (!isAssigned) {
    for (const key in state.signals) {
      state.signals[key].assignedToButton = false;
    }
    state.signals[state.selectedSig].assignedToButton = true;
    showToast("Asignado", `"${state.selectedSig}" ejecutará cuando presiones el botón.`);
  } else {
    state.signals[state.selectedSig].assignedToButton = false;
    showToast("Desasignado", `"${state.selectedSig}" ya no está asignado al botón.`);
  }
  
  saveSignals();
  updateAssignButtonUI();
  renderSignalList();
}
window.toggleAssignButton = toggleAssignButton;

export function updateAssignButtonUI() {
  if (!state.selectedSig) return;
  const btn = document.getElementById("btn-assign");
  if (!btn) return;
  if (state.signals[state.selectedSig].assignedToButton) {
    btn.classList.add("assigned");
    btn.innerHTML = "✅ Botón Asignado";
  } else {
    btn.classList.remove("assigned");
    btn.innerHTML = "🔌 Asignar a Botón";
  }
}

export function renderFlow() {
  const fc = document.getElementById("flow-container");
  fc.innerHTML = "";
  const steps = state.signals[state.selectedSig]?.steps || [];

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

  // Initialize script editors (syntax highlight + gutter)
  steps.forEach((step, i) => {
    if (step.type === 'run_script') {
      handleScriptInput(i);
    }
  });
}

export function makeStepCard(step, idx, total) {
  const meta = STEP_TYPES[step.type] || STEP_TYPES.notify;
  const card = document.createElement("div");
  card.className = "step-card";
  card.draggable = true;
  card.dataset.idx = idx;

  const header = document.createElement("div");
  header.className = "step-header";
  header.innerHTML = `
    <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
    <span class="step-type-badge ${meta.cls}">
      <span class="step-icon">${meta.icon}</span>
      <select class="step-type-select" onchange="changeStepType(${idx}, this.value)">
        ${Object.entries(STEP_TYPES).map(([k, v]) => `<option value="${k}" ${step.type === k ? "selected" : ""}>${v.label}</option>`).join("")}
      </select>
    </span>
    <span class="step-num">#${idx + 1}</span>
    <button class="btn-del-step" onclick="deleteStep(${idx})" title="Eliminar paso">✕</button>`;
  card.appendChild(header);

  const params = document.createElement("div");
  params.className = "step-params";
  params.innerHTML = renderStepParams(step, idx);
  card.appendChild(params);

  card.addEventListener("dragstart", (e) => {
    state.dragSrcIdx = idx;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    document.querySelectorAll(".step-card").forEach((c) => c.classList.remove("drag-over"));
  });
  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    card.classList.add("drag-over");
  });
  card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    if (state.dragSrcIdx === null || state.dragSrcIdx === idx) return;
    const steps = state.signals[state.selectedSig].steps;
    const [moved] = steps.splice(state.dragSrcIdx, 1);
    steps.splice(idx, 0, moved);
    state.dragSrcIdx = null;
    saveSignals();
    renderFlow();
  });

  return card;
}

export function renderStepParams(step, idx) {
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
    case "run_script":
      return `
      <div class="param-row">
        <div class="param-label">Lenguaje</div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <select class="param-select" id="script-lang-${i}" onchange="updateParam(${i},'lang',this.value); updateScriptEditor(${i})" style="width: auto; min-width: 140px;">
            <option value="python" ${(p.lang || 'python') === 'python' ? 'selected' : ''}>Python</option>
            <option value="javascript" ${p.lang === 'javascript' ? 'selected' : ''}>JavaScript (Beta)</option>
          </select>
          ${(p.lang === 'javascript') ? '<span class="script-beta-badge">BETA</span>' : ''}
        </div>
      </div>
      <div class="param-row">
        <div class="param-label">Código</div>
        <div class="script-editor-wrap" id="script-editor-${i}">
          <div class="script-gutter" id="script-gutter-${i}">1</div>
          <div class="script-code-area">
            <pre class="script-highlight" id="script-highlight-${i}" aria-hidden="true"></pre>
            <textarea class="script-textarea" id="script-code-${i}"
              spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off"
              placeholder="Escribí tu código aquí..."
              oninput="handleScriptInput(${i})"
              onscroll="syncScriptScroll(${i})"
              onkeydown="handleScriptKeydown(event, ${i})">${(p.code || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')}</textarea>
          </div>
        </div>
      </div>`;
    default:
      return "";
  }
}

export function updateParam(idx, key, value) {
  if (!state.selectedSig) return;
  if (!state.signals[state.selectedSig].steps[idx].params)
    state.signals[state.selectedSig].steps[idx].params = {};
  state.signals[state.selectedSig].steps[idx].params[key] = value;
  saveSignals();
}
window.updateParam = updateParam;

export function changeStepType(idx, newType) {
  if (!state.selectedSig) return;
  state.signals[state.selectedSig].steps[idx] = {
    id: state.signals[state.selectedSig].steps[idx].id,
    type: newType,
    params: {},
  };
  saveSignals();
  renderFlow();
}
window.changeStepType = changeStepType;

export function deleteStep(idx) {
  if (!state.selectedSig) return;
  state.signals[state.selectedSig].steps.splice(idx, 1);
  saveSignals();
  renderSignalList();
  renderFlow();
}
window.deleteStep = deleteStep;

export function addStep(type) {
  if (!state.selectedSig) return;
  function defaultParams(t) {
    const d = {
      keypress: { combo: "" },
      wait: { ms: 500 },
      clipboard: { text: "" },
      media: { action: "play_pause" },
      open_url: { url: "" },
      run_cmd: { cmd: "" },
      open_file: { path: "" },
      notify: { title: "Arduino", body: "" },
      run_script: { lang: "python", code: "" },
    };
    return d[t] || {};
  }
  const step = { id: uid(), type, params: defaultParams(type) };
  state.signals[state.selectedSig].steps.push(step);
  saveSignals();
  renderSignalList();
  renderFlow();
  setTimeout(() => {
    const fc = document.getElementById("flow-container");
    fc.scrollTop = fc.scrollHeight;
  }, 50);
}
window.addStep = addStep;

export function testCurrentSignal() {
  if (!state.selectedSig) return;

  const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(state.selectedSig)}"]`);
  if (card && card.classList.contains("running")) {
    showToast("En ejecución", "La secuencia ya se está ejecutando");
    return;
  }

  window.arduino.testSequence(state.selectedSig);
  showToast(`▶ Probando "${state.selectedSig}"`, `${state.signals[state.selectedSig]?.steps?.length || 0} pasos`);
}
window.testCurrentSignal = testCurrentSignal;

export function startKeyCapture(idx) {
  if (state.capturingIdx !== null) {
    const prev = document.getElementById(`key-${state.capturingIdx}`);
    if (prev) {
      prev.classList.remove("capturing");
      prev.readOnly = false;
      prev.value = state.signals[state.selectedSig]?.steps[state.capturingIdx]?.params?.combo || "";
    }
    window.arduino.stopKeyCapture();
  }

  state.capturingIdx = idx;
  const input = document.getElementById(`key-${idx}`);
  if (!input) return;
  input.classList.add("capturing");
  input.readOnly = true;
  input.value = "Presioná la combinación...";

  window.arduino.startKeyCapture();

  const escHandler = (e) => {
    if (e.key !== "Escape") return;
    if (state.capturingIdx !== idx) {
      document.removeEventListener("keydown", escHandler);
      return;
    }
    state.capturingIdx = null;
    input.classList.remove("capturing");
    input.readOnly = false;
    input.value = state.signals[state.selectedSig]?.steps[idx]?.params?.combo || "";
    window.arduino.stopKeyCapture();
    document.removeEventListener("keydown", escHandler);
  };
  document.addEventListener("keydown", escHandler);
}
window.startKeyCapture = startKeyCapture;

export async function browseFile(idx) {
  const path = await window.arduino.selectFile();
  if (path) {
    const input = document.getElementById(`path-${idx}`);
    if (input) input.value = path;
    updateParam(idx, "path", path);
  }
}
window.browseFile = browseFile;

export function buildStepMenu() {
  const menu = document.getElementById("step-menu");
  if (!menu) return;
  const groups = [
    { items: ["keypress", "wait", "clipboard"] },
    { items: ["media"] },
    { items: ["open_url", "run_cmd", "open_file"] },
    { items: ["run_script"] },
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

export function toggleStepMenu() {
  if (!state.selectedSig) {
    showToast("Sin señal", "Seleccioná una señal primero");
    return;
  }
  const menu = document.getElementById("step-menu");
  const btn = document.getElementById("add-step-btn");
  if (menu.classList.contains("open")) {
    menu.classList.remove("open");
    return;
  }

  const rect = btn.getBoundingClientRect();
  menu.style.display = "block"; 
  const menuH = menu.offsetHeight;
  menu.style.display = "";

  const top = rect.top - menuH - 8;
  const left = rect.left + rect.width / 2;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${left}px`;
  menu.style.transform = "translateX(-50%)";
  menu.classList.add("open");
}
window.toggleStepMenu = toggleStepMenu;

// ── Script Editor helpers ──

function highlightCode(code, lang) {
  let html = escHtml(code);
  const tokens = [];

  // Extract strings/comments into placeholders so keyword regex
  // won't match words like 'class' inside generated HTML attributes.
  function hold(match, cls) {
    const id = '\x00T' + tokens.length + '\x00';
    tokens.push('<span class="' + cls + '">' + match + '</span>');
    return id;
  }

  if (lang === 'python') {
    html = html.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|&quot;(?:[^&]|&(?!quot;))*?&quot;|'[^'\n]*?')/g,
      function(m) { return hold(m, 'sh-str'); });
    html = html.replace(/(#.*)/g,
      function(m) { return hold(m, 'sh-cmt'); });
    html = html.replace(/\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|pass|break|continue|and|or|not|in|is|None|True|False|lambda|yield|raise|global|nonlocal|assert|del|print)\b/g, '<span class="sh-kw">$1</span>');
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="sh-num">$1</span>');
    html = html.replace(/\b(len|range|str|int|float|list|dict|tuple|set|type|isinstance|enumerate|zip|map|filter|sorted|open|input|super|__init__|self)\b/g, '<span class="sh-fn">$1</span>');
  } else if (lang === 'javascript') {
    html = html.replace(/(`[\s\S]*?`|&quot;(?:[^&]|&(?!quot;))*?&quot;|'[^'\n]*?')/g,
      function(m) { return hold(m, 'sh-str'); });
    html = html.replace(/(\/\/.*)/g,
      function(m) { return hold(m, 'sh-cmt'); });
    html = html.replace(/\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|default|async|await|typeof|instanceof|null|undefined|true|false|this|of|in)\b/g, '<span class="sh-kw">$1</span>');
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="sh-num">$1</span>');
    html = html.replace(/\b(console|Math|JSON|Array|Object|String|Number|Boolean|Promise|setTimeout|setInterval|require|module|exports|process)\b/g, '<span class="sh-fn">$1</span>');
  }

  // Restore placeholders
  for (var i = 0; i < tokens.length; i++) {
    html = html.replace('\x00T' + i + '\x00', tokens[i]);
  }

  if (!html.endsWith('\n')) html += '\n';
  return html;
}

function updateGutter(idx) {
  const textarea = document.getElementById(`script-code-${idx}`);
  const gutter = document.getElementById(`script-gutter-${idx}`);
  if (!textarea || !gutter) return;
  const lines = textarea.value.split('\n').length;
  gutter.innerHTML = Array.from({ length: lines }, (_, i) => `<div>${i + 1}</div>`).join('');
}

export function handleScriptInput(idx) {
  const textarea = document.getElementById(`script-code-${idx}`);
  if (!textarea) return;
  const lang = document.getElementById(`script-lang-${idx}`)?.value || 'python';
  updateParam(idx, 'code', textarea.value);
  const highlight = document.getElementById(`script-highlight-${idx}`);
  if (highlight) highlight.innerHTML = highlightCode(textarea.value, lang);
  updateGutter(idx);
}
window.handleScriptInput = handleScriptInput;

export function syncScriptScroll(idx) {
  const textarea = document.getElementById(`script-code-${idx}`);
  const highlight = document.getElementById(`script-highlight-${idx}`);
  const gutter = document.getElementById(`script-gutter-${idx}`);
  if (textarea && highlight) {
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }
  if (textarea && gutter) {
    gutter.scrollTop = textarea.scrollTop;
  }
}
window.syncScriptScroll = syncScriptScroll;

export function handleScriptKeydown(e, idx) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const ta = e.target;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + '    ' + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + 4;
    handleScriptInput(idx);
  }
}
window.handleScriptKeydown = handleScriptKeydown;

export function updateScriptEditor(idx) {
  // Re-render the flow to update the badge and re-highlight
  renderFlow();
}
window.updateScriptEditor = updateScriptEditor;
