import { state, SIG_COLORS, saveSignals, pushUndo, uid, STEP_TYPES, MEDIA_OPTIONS } from './state.js';
import { escHtml, escAttr, showToast, showPrompt } from './ui.js';

// ── Event delegation para el flow-container ──
export function initFlowDelegation() {
  const panel = document.querySelector('.panel');
  if (!panel) return;

  panel.addEventListener('click', (e) => {
    const target = e.target;
    const delBtn = target.closest('.btn-del-step');
    if (delBtn) { deleteStep(Number(delBtn.dataset.idx)); return; }
    const keyBtn = target.closest('.btn-key-capture');
    if (keyBtn) { startKeyCapture(Number(keyBtn.dataset.idx)); return; }
    const browseBtn = target.closest('.btn-browse-file');
    if (browseBtn) { browseFile(Number(browseBtn.dataset.idx)); return; }
  });

  panel.addEventListener('change', (e) => {
    const target = e.target;
    if (target.classList.contains('step-type-select')) {
      changeStepType(Number(target.dataset.idx), target.value);
      return;
    }
    if (target.classList.contains('script-lang-select')) {
      const idx = Number(target.dataset.idx);
      updateParam(idx, 'lang', target.value);
      updateScriptEditor(idx);
      return;
    }
    if (target.classList.contains('media-action-select')) {
      updateParam(Number(target.dataset.idx), 'action', target.value);
      return;
    }
  });

  panel.addEventListener('input', (e) => {
    const target = e.target;
    if (target.dataset.param && target.dataset.idx !== undefined) {
      updateParam(Number(target.dataset.idx), target.dataset.param, target.value);
    }
    if (target.classList.contains('script-textarea')) {
      handleScriptInput(Number(target.dataset.idx));
    }
  });

  panel.addEventListener('scroll', (e) => {
    if (e.target.classList.contains('script-textarea')) {
      syncScriptScroll(Number(e.target.dataset.idx));
    }
  }, true);

  panel.addEventListener('keydown', (e) => {
    if (e.target.classList.contains('script-textarea')) {
      handleScriptKeydown(e, Number(e.target.dataset.idx));
    }
  });
}

// ── Context Menu Logic ──
let activeContextMenu = null;

function closeContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

document.addEventListener('click', closeContextMenu);
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.sig-card') && !e.target.closest('.context-menu')) {
    closeContextMenu();
  }
});

function showSignalContextMenu(e, sig) {
  e.preventDefault();
  closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  
  const options = [
    { label: 'Duplicar', ico: '👯', action: () => duplicateSignal(sig) },
    { label: 'Cambiar nombre', ico: '✏️', action: () => renameSignal(sig) },
    { label: 'Copiar JSON', ico: '📋', action: () => copySignalToClipboard(sig) },
    { label: 'Exportar archivo', ico: '📦', action: () => exportSingleWorkflow(sig) },
    { type: 'divider' },
    { label: 'Eliminar', ico: '✕', action: () => {
      state.selectedSig = sig;
      deleteCurrentSignal();
    }}
  ];

  options.forEach(opt => {
    if (opt.type === 'divider') {
      const div = document.createElement('div');
      div.className = 'context-menu-divider';
      menu.appendChild(div);
      return;
    }
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.innerHTML = `<span class="ico">${opt.ico}</span><span>${opt.label}</span>`;
    item.onclick = () => {
      opt.action();
      closeContextMenu();
    };
    menu.appendChild(item);
  });

  menu.onclick = (e) => e.stopPropagation();
  document.body.appendChild(menu);
  
  // Position
  const menuWidth = 160;
  const menuHeight = menu.offsetHeight;
  let x = e.clientX;
  let y = e.clientY;
  
  if (x + menuWidth > window.innerWidth) x -= menuWidth;
  if (y + menuHeight > window.innerHeight) y -= menuHeight;
  
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  activeContextMenu = menu;
}

// ── Signal Logic ──

export function renderSignalList() {
  const list = document.getElementById("signal-list");
  if (!list) return;
  list.innerHTML = "";
  Object.entries(state.signals).forEach(([sig, entry]) => {
    const div = document.createElement("div");
    div.className = "sig-card" + (sig === state.selectedSig ? " active" : "");
    div.dataset.sig = sig;
    const badge = entry.assignedToButton
      ? `<span class="sig-assigned-badge" title="Asignado al botón físico">🔌 BOTÓN</span>`
      : '';
    div.innerHTML = `
      <div class="sig-card-top">
        <span class="sig-color-dot"></span>
        <span class="sig-name">${escHtml(sig)}${badge}</span>
        <span class="sig-pulse"></span>
      </div>
      ${entry.label ? `<div class="sig-label">${escHtml(entry.label)}</div>` : ""}
      <div class="sig-steps-count">${entry.steps?.length || 0} paso${(entry.steps?.length || 0) === 1 ? "" : "s"}</div>`;
    
    div.addEventListener('click', () => selectSignal(sig));
    div.addEventListener('contextmenu', (e) => showSignalContextMenu(e, sig));
    
    list.appendChild(div);
    const dot = div.querySelector('.sig-color-dot');
    if (dot) dot.style.background = entry.color;
  });
}

export function addSignal() {
  const input = document.getElementById("new-sig-cfg");
  const sig = input.value.trim().toUpperCase().replace(/\s+/g, "_");
  if (!sig) return;
  if (state.signals[sig]) { showToast("Ya existe", `"${sig}" ya está`); return; }
  pushUndo();
  const color = SIG_COLORS[Object.keys(state.signals).length % SIG_COLORS.length];
  state.signals[sig] = { label: "", color, steps: [], assignedToButton: false };
  input.value = "";
  saveSignals(); renderSignalList(); selectSignal(sig);
}
window.addSignal = addSignal;

export function renameSignal(oldName) {
  const originalData = state.signals[oldName];
  if (!originalData) return;

  showPrompt(`Nuevo nombre para "${oldName}"`, oldName, (rawInput) => {
    if (rawInput === null || rawInput === undefined) return;

    const newName = rawInput.trim().toUpperCase().replace(/\s+/g, "_");
    
    if (!newName) {
      showToast("Error", "El nombre no puede estar vacío");
      return;
    }

    if (newName === oldName) return;

    if (state.signals[newName]) {
      showToast("Ya existe", `El nombre "${newName}" ya está en uso.`);
      return;
    }

    pushUndo();
    
    const newSignals = {};
    Object.keys(state.signals).forEach(key => {
      if (key === oldName) {
        newSignals[newName] = originalData;
      } else {
        newSignals[key] = state.signals[key];
      }
    });

    state.signals = newSignals;
    
    if (state.selectedSig === oldName) {
      state.selectedSig = newName;
    }

    saveSignals();
    renderSignalList();
    if (state.selectedSig === newName) selectSignal(newName);
    
    showToast("Renombrado", `"${oldName}" ahora se llama "${newName}"`);
  });
}
window.renameSignal = renameSignal;

export function duplicateSignal(sig) {
  const original = state.signals[sig];
  if (!original) return;
  
  let newName = sig + "_COPY";
  let i = 1;
  while (state.signals[newName]) {
    newName = `${sig}_COPY_${i}`;
    i++;
  }
  
  pushUndo();
  state.signals[newName] = JSON.parse(JSON.stringify(original));
  state.signals[newName].assignedToButton = false;
  if (state.signals[newName].label) {
    state.signals[newName].label += " (Copia)";
  }
  
  saveSignals();
  renderSignalList();
  showToast("Duplicado", `Workflow "${sig}" duplicado como "${newName}"`);
}
window.duplicateSignal = duplicateSignal;

export async function copySignalToClipboard(sig) {
  const data = state.signals[sig];
  if (!data) return;
  
  const payload = JSON.stringify({ version: "1.0", type: "single-workflow", name: sig, data }, null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    showToast("Copiado", "JSON del workflow copiado al portapapeles");
  } catch (err) {
    showToast("Error", "No se pudo copiar al portapapeles");
  }
}
window.copySignalToClipboard = copySignalToClipboard;

export async function exportSingleWorkflow(sig) {
  const data = state.signals[sig];
  if (!data) return;
  
  const result = await window.arduino.exportSingleWorkflow(sig, data);
  if (result.ok) {
    showToast("Exportado", `Workflow guardado en:\n${result.path}`);
  } else if (result.error !== "Cancelled") {
    showToast("Error", `No se pudo exportar: ${result.error}`);
  }
}
window.exportSingleWorkflow = exportSingleWorkflow;

export async function importWorkflow(e) {
  // Present a choice menu at the click position
  closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  
  const options = [
    { label: 'Desde archivo (.json)', ico: '📁', action: importFromFile },
    { label: 'Desde portapapeles', ico: '📋', action: importFromClipboard }
  ];

  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'context-menu-item';
    item.innerHTML = `<span class="ico">${opt.ico}</span><span>${opt.label}</span>`;
    item.onclick = () => {
      opt.action();
      closeContextMenu();
    };
    menu.appendChild(item);
  });

  menu.onclick = (e) => e.stopPropagation();
  document.body.appendChild(menu);
  
  // Position near the event (if available) or center
  let x = e ? e.clientX : window.innerWidth / 2;
  let y = e ? e.clientY : window.innerHeight / 2;
  
  if (x + 160 > window.innerWidth) x -= 160;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  activeContextMenu = menu;
}
window.importWorkflow = importWorkflow;

async function importFromFile() {
  const result = await window.arduino.importSingleWorkflow();
  if (result.ok) {
    addImportedWorkflow(result.name, result.data);
  } else if (result.error !== "Cancelled") {
    showToast("Error", `No se pudo importar: ${result.error}`);
  }
}

async function importFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    const raw = JSON.parse(text);
    if (raw.type === "single-workflow" && raw.name && raw.data) {
      addImportedWorkflow(raw.name, raw.data);
      showToast("Importado", "Workflow importado desde el portapapeles");
    } else {
      showToast("Error", "El contenido del portapapeles no es un workflow válido");
    }
  } catch (e) {
    showToast("Error", "No se pudo leer el portapapeles o el formato JSON es inválido");
  }
}

function addImportedWorkflow(name, data) {
  let finalName = name.toUpperCase().replace(/\s+/g, "_");
  if (state.signals[finalName]) {
    let i = 1;
    while (state.signals[`${finalName}_${i}`]) i++;
    finalName = `${finalName}_${i}`;
  }
  
  pushUndo();
  state.signals[finalName] = data;
  state.signals[finalName].assignedToButton = false;
  saveSignals();
  renderSignalList();
  selectSignal(finalName);
  showToast("Importado", `Workflow "${finalName}" agregado correctamente.`);
}

export function deleteCurrentSignal() {
  if (!state.selectedSig) return;
  pushUndo();
  delete state.signals[state.selectedSig];
  const deleted = state.selectedSig;
  state.selectedSig = null;
  saveSignals(); renderSignalList();
  document.getElementById("se-empty").classList.remove("d-none");
  document.getElementById("se-content").classList.add("d-none");
  showToast("Eliminado", `Workflow "${deleted}" eliminado.`);
}
window.deleteCurrentSignal = deleteCurrentSignal;

export function updateSignalLabel(val) {
  if (!state.selectedSig) return;
  state.signals[state.selectedSig].label = val;
  saveSignals();
  const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(state.selectedSig)}"]`);
  if (card) { const lbl = card.querySelector(".sig-label"); if (lbl) lbl.textContent = val; }
}
window.updateSignalLabel = updateSignalLabel;

export function selectSignal(sig) {
  state.selectedSig = sig;
  document.querySelectorAll(".sig-card").forEach((c) => c.classList.toggle("active", c.dataset.sig === sig));
  document.getElementById("se-empty").classList.add("d-none");
  document.getElementById("se-content").classList.remove("d-none");
  document.getElementById("se-signal-tag").textContent = sig;
  document.getElementById("se-label-input").value = state.signals[sig]?.label || "";
  updateAssignButtonUI(); renderFlow();
}
window.selectSignal = selectSignal;

export function toggleAssignButton() {
  if (!state.selectedSig) return;
  pushUndo();
  const isAssigned = state.signals[state.selectedSig].assignedToButton;
  if (!isAssigned) {
    for (const key in state.signals) state.signals[key].assignedToButton = false;
    state.signals[state.selectedSig].assignedToButton = true;
    showToast("Asignado", `"${state.selectedSig}" ejecutará cuando presiones el botón.`);
  } else {
    state.signals[state.selectedSig].assignedToButton = false;
    showToast("Desasignado", `"${state.selectedSig}" ya no está asignado al botón.`);
  }
  saveSignals(); updateAssignButtonUI(); renderSignalList();
}
window.toggleAssignButton = toggleAssignButton;

export function updateAssignButtonUI() {
  if (!state.selectedSig) return;
  const btn = document.getElementById("btn-assign");
  if (!btn) return;
  if (state.signals[state.selectedSig].assignedToButton) {
    btn.classList.add("assigned"); btn.textContent = "✅ Botón Asignado";
  } else {
    btn.classList.remove("assigned"); btn.textContent = "🔌 Asignar a Botón";
  }
}

export function renderFlow() {
  const fc = document.getElementById("flow-container");
  fc.innerHTML = "";
  const steps = state.signals[state.selectedSig]?.steps || [];
  if (!steps.length) {
    const empty = document.createElement("div");
    empty.className = "flow-empty";
    empty.innerHTML = `<span class="flow-empty-icon">⋯</span><span>Sin pasos — agregá uno abajo</span>`;
    fc.appendChild(empty);
    return;
  }
  steps.forEach((step, i) => {
    fc.appendChild(makeStepCard(step, i));
    if (i < steps.length - 1) {
      const conn = document.createElement("div");
      conn.className = "step-connector";
      conn.innerHTML = '<span class="step-connector-arrow">↓</span>';
      fc.appendChild(conn);
    }
  });
  steps.forEach((step, i) => { if (step.type === 'run_script') handleScriptInput(i); });
}

export function makeStepCard(step, idx) {
  const meta = STEP_TYPES[step.type] || STEP_TYPES.notify;
  const card = document.createElement("div");
  card.className = "step-card"; card.draggable = true; card.dataset.idx = idx;

  // Header
  const header = document.createElement("div");
  header.className = "step-header";

  const dragHandle = document.createElement("span");
  dragHandle.className = "drag-handle"; dragHandle.title = "Arrastrar para reordenar"; dragHandle.textContent = "⠿";
  header.appendChild(dragHandle);

  const badge = document.createElement("span");
  badge.className = `step-type-badge ${meta.cls}`;
  const icon = document.createElement("span");
  icon.className = "step-icon"; icon.textContent = meta.icon;
  badge.appendChild(icon);

  const typeSelect = document.createElement("select");
  typeSelect.className = "step-type-select"; typeSelect.dataset.idx = idx;
  Object.entries(STEP_TYPES).forEach(([k, v]) => {
    const opt = document.createElement("option");
    opt.value = k; opt.textContent = v.label;
    if (k === step.type) opt.selected = true;
    typeSelect.appendChild(opt);
  });
  badge.appendChild(typeSelect); header.appendChild(badge);

  const stepNum = document.createElement("span");
  stepNum.className = "step-num"; stepNum.textContent = `#${idx + 1}`;
  header.appendChild(stepNum);

  const delBtn = document.createElement("button");
  delBtn.className = "btn-del-step"; delBtn.title = "Eliminar paso"; delBtn.textContent = "✕";
  delBtn.dataset.idx = idx;
  header.appendChild(delBtn);

  card.appendChild(header);

  // Params
  const params = document.createElement("div");
  params.className = "step-params";
  buildStepParams(params, step, idx);
  card.appendChild(params);

  // Drag events
  card.addEventListener("dragstart", (e) => { state.dragSrcIdx = idx; card.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
  card.addEventListener("dragend", () => { card.classList.remove("dragging"); document.querySelectorAll(".step-card").forEach((c) => c.classList.remove("drag-over")); });
  card.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; card.classList.add("drag-over"); });
  card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
  card.addEventListener("drop", (e) => {
    e.preventDefault();
    if (state.dragSrcIdx === null || state.dragSrcIdx === idx) return;
    pushUndo();
    const steps = state.signals[state.selectedSig].steps;
    const [moved] = steps.splice(state.dragSrcIdx, 1);
    steps.splice(idx, 0, moved);
    state.dragSrcIdx = null; saveSignals(); renderFlow();
  });

  return card;
}

function buildStepParams(container, step, idx) {
  const p = step.params || {};

  function makeRow(labelText) {
    const row = document.createElement("div"); row.className = "param-row";
    const lbl = document.createElement("div"); lbl.className = "param-label"; lbl.textContent = labelText;
    row.appendChild(lbl); return row;
  }
  function makeInput(type, value, placeholder, param) {
    const inp = document.createElement("input");
    inp.type = type; inp.className = "param-input"; inp.value = value; inp.placeholder = placeholder || "";
    inp.dataset.idx = idx; inp.dataset.param = param;
    return inp;
  }
  function makeHint(text) {
    const hint = document.createElement("div"); hint.className = "param-hint"; hint.textContent = text; return hint;
  }

  switch (step.type) {
    case "keypress": {
      const row = makeRow("Combinación de teclas");
      const wrap = document.createElement("div"); wrap.className = "param-input-row";
      const inp = makeInput("text", p.combo || "", "ej: cmd+space, ctrl+c", "combo");
      inp.className = "param-input key-input flex-1";
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost btn-key-capture"; btn.title = "Capturar teclas";
      btn.textContent = "⌨️"; btn.dataset.idx = idx;
      wrap.appendChild(inp); wrap.appendChild(btn); row.appendChild(wrap);
      row.appendChild(makeHint("Escribí la combinación manualmente o usá el botón para capturarla."));
      container.appendChild(row); break;
    }
    case "wait": {
      const row = makeRow("Duración (ms)");
      const inp = makeInput("number", p.ms || 500, "", "ms");
      inp.min = "10"; inp.max = "60000";
      row.appendChild(inp); container.appendChild(row); break;
    }
    case "clipboard": {
      const row = makeRow("Texto a copiar");
      row.appendChild(makeInput("text", p.text || "", "Texto que irá al portapapeles", "text"));
      container.appendChild(row); break;
    }
    case "media": {
      const row = makeRow("Acción");
      const sel = document.createElement("select");
      sel.className = "param-select media-action-select"; sel.dataset.idx = idx;
      MEDIA_OPTIONS.forEach((o) => {
        const opt = document.createElement("option"); opt.value = o.value; opt.textContent = o.label;
        if (p.action === o.value) opt.selected = true;
        sel.appendChild(opt);
      });
      row.appendChild(sel); container.appendChild(row); break;
    }
    case "open_url": {
      const row = makeRow("URL");
      row.appendChild(makeInput("text", p.url || "", "https://ejemplo.com", "url"));
      container.appendChild(row); break;
    }
    case "run_cmd": {
      const row = makeRow("Comando");
      row.appendChild(makeInput("text", p.cmd || "", "open /Applications/Spotify.app", "cmd"));
      container.appendChild(row); break;
    }
    case "open_file": {
      const row = makeRow("Ruta");
      const wrap = document.createElement("div"); wrap.className = "param-input-row";
      const inp = makeInput("text", p.path || "", "/Users/vos/archivo.pdf", "path");
      inp.id = `path-${idx}`; inp.className = "param-input flex-1";
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost btn-browse-file"; btn.title = "Seleccionar archivo";
      btn.textContent = "📂"; btn.dataset.idx = idx;
      wrap.appendChild(inp); wrap.appendChild(btn); row.appendChild(wrap);
      container.appendChild(row); break;
    }
    case "notify": {
      const r1 = makeRow("Título"); r1.appendChild(makeInput("text", p.title || "", "Título de la notificación", "title")); container.appendChild(r1);
      const r2 = makeRow("Mensaje"); r2.appendChild(makeInput("text", p.body || "", "Cuerpo del mensaje", "body")); container.appendChild(r2);
      break;
    }
    case "run_script": {
      const r1 = makeRow("Lenguaje");
      const selWrap = document.createElement("div"); selWrap.className = "param-select-row";
      const langSel = document.createElement("select");
      langSel.className = "param-select script-lang-select"; langSel.id = `script-lang-${idx}`; langSel.dataset.idx = idx;
      [["python", "Python"], ["javascript", "JavaScript (Beta)"]].forEach(([v, l]) => {
        const opt = document.createElement("option"); opt.value = v; opt.textContent = l;
        if ((p.lang || "python") === v) opt.selected = true;
        langSel.appendChild(opt);
      });
      selWrap.appendChild(langSel);
      if (p.lang === "javascript") {
        const badge = document.createElement("span"); badge.className = "script-beta-badge"; badge.textContent = "BETA";
        selWrap.appendChild(badge);
      }
      r1.appendChild(selWrap); container.appendChild(r1);

      const r2 = makeRow("Código");
      const wrap = document.createElement("div"); wrap.className = "script-editor-wrap"; wrap.id = `script-editor-${idx}`;
      const gutter = document.createElement("div"); gutter.className = "script-gutter"; gutter.id = `script-gutter-${idx}`; gutter.textContent = "1";
      const codeArea = document.createElement("div"); codeArea.className = "script-code-area";
      const pre = document.createElement("pre"); pre.className = "script-highlight"; pre.id = `script-highlight-${idx}`; pre.setAttribute("aria-hidden", "true");
      const ta = document.createElement("textarea");
      ta.className = "script-textarea"; ta.id = `script-code-${idx}`; ta.dataset.idx = idx;
      ta.spellcheck = false; ta.autocomplete = "off"; ta.placeholder = "Escribí tu código aquí...";
      ta.value = p.code || "";
      codeArea.appendChild(pre); codeArea.appendChild(ta);
      wrap.appendChild(gutter); wrap.appendChild(codeArea);
      r2.appendChild(wrap); container.appendChild(r2);
      break;
    }
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
  pushUndo();
  state.signals[state.selectedSig].steps[idx] = { id: state.signals[state.selectedSig].steps[idx].id, type: newType, params: {} };
  saveSignals(); renderFlow();
}
window.changeStepType = changeStepType;

export function deleteStep(idx) {
  if (!state.selectedSig) return;
  pushUndo();
  state.signals[state.selectedSig].steps.splice(idx, 1);
  saveSignals(); renderSignalList(); renderFlow();
}
window.deleteStep = deleteStep;

export function addStep(type) {
  if (!state.selectedSig) return;
  pushUndo();
  const defaults = { keypress:{combo:""}, wait:{ms:500}, clipboard:{text:""}, media:{action:"play_pause"}, open_url:{url:""}, run_cmd:{cmd:""}, open_file:{path:""}, notify:{title:"Arduino",body:""}, run_script:{lang:"python",code:""} };
  const step = { id: uid(), type, params: defaults[type] || {} };
  state.signals[state.selectedSig].steps.push(step);
  saveSignals(); renderSignalList(); renderFlow();
  setTimeout(() => { const fc = document.getElementById("flow-container"); fc.scrollTop = fc.scrollHeight; }, 50);
}
window.addStep = addStep;

export function testCurrentSignal() {
  if (!state.selectedSig) return;
  const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(state.selectedSig)}"]`);
  if (card && card.classList.contains("running")) { showToast("En ejecución", "La secuencia ya se está ejecutando"); return; }
  window.arduino.testSequence(state.selectedSig);
  showToast(`▶ Probando "${state.selectedSig}"`, `${state.signals[state.selectedSig]?.steps?.length || 0} pasos`);
}
window.testCurrentSignal = testCurrentSignal;

export function startKeyCapture(idx) {
  if (state.capturingIdx !== null) {
    const prev = document.getElementById(`key-${state.capturingIdx}`);
    if (prev) { prev.classList.remove("capturing"); prev.readOnly = false; prev.value = state.signals[state.selectedSig]?.steps[state.capturingIdx]?.params?.combo || ""; }
    window.arduino.stopKeyCapture();
  }
  state.capturingIdx = idx;
  const input = document.querySelector(`.param-input[data-idx="${idx}"][data-param="combo"]`);
  if (!input) return;
  input.classList.add("capturing"); input.readOnly = true; input.value = "Presioná la combinación...";
  window.arduino.startKeyCapture();
  const escHandler = (e) => {
    if (e.key !== "Escape") return;
    if (state.capturingIdx !== idx) { document.removeEventListener("keydown", escHandler); return; }
    state.capturingIdx = null; input.classList.remove("capturing"); input.readOnly = false;
    input.value = state.signals[state.selectedSig]?.steps[idx]?.params?.combo || "";
    window.arduino.stopKeyCapture(); document.removeEventListener("keydown", escHandler);
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
  const groups = [{ items: ["keypress","wait","clipboard"] }, { items: ["media"] }, { items: ["open_url","run_cmd","open_file"] }, { items: ["run_script"] }, { items: ["notify"] }];
  groups.forEach((group, gi) => {
    if (gi > 0) { const div = document.createElement("div"); div.className = "menu-divider"; menu.appendChild(div); }
    group.items.forEach((type) => {
      const meta = STEP_TYPES[type]; const item = document.createElement("div"); item.className = "menu-item";
      const iconEl = document.createElement("div"); iconEl.className = `menu-icon ${meta.cls}`; iconEl.textContent = meta.icon;
      const textEl = document.createElement("div"); textEl.className = "menu-text";
      const labelEl = document.createElement("span"); labelEl.className = "menu-label"; labelEl.textContent = meta.label;
      textEl.appendChild(labelEl); item.appendChild(iconEl); item.appendChild(textEl);
      item.addEventListener("click", () => { addStep(type); menu.classList.remove("open"); });
      menu.appendChild(item);
    });
  });
}

export function toggleStepMenu() {
  if (!state.selectedSig) { showToast("Sin señal", "Seleccioná una señal primero"); return; }
  const menu = document.getElementById("step-menu");
  const btn = document.getElementById("add-step-btn");
  if (menu.classList.contains("open")) { menu.classList.remove("open"); return; }
  const rect = btn.getBoundingClientRect();
  menu.style.display = "block"; const menuH = menu.offsetHeight; menu.style.display = "";
  menu.style.top = `${Math.max(8, rect.top - menuH - 8)}px`;
  menu.style.left = `${rect.left + rect.width / 2}px`;
  menu.style.transform = "translateX(-50%)";
  menu.classList.add("open");
}
window.toggleStepMenu = toggleStepMenu;

// ── Script Editor helpers ──
function highlightCode(code, lang) {
  const escHtmlLocal = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  let html = escHtmlLocal(code); const tokens = [];
  function hold(match, cls) { const id = '\x00T' + tokens.length + '\x00'; tokens.push('<span class="' + cls + '">' + match + '</span>'); return id; }
  if (lang === 'python') {
    html = html.replace(/("""[\s\S]*?"""|'''[\s\S]*?'''|&quot;(?:[^&]|&(?!quot;))*?&quot;|'[^'\n]*?')/g, (m) => hold(m, 'sh-str'));
    html = html.replace(/(#.*)/g, (m) => hold(m, 'sh-cmt'));
    html = html.replace(/\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|pass|break|continue|and|or|not|in|is|None|True|False|lambda|yield|raise|global|nonlocal|assert|del|print)\b/g, '<span class="sh-kw">$1</span>');
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="sh-num">$1</span>');
    html = html.replace(/\b(len|range|str|int|float|list|dict|tuple|set|type|isinstance|enumerate|zip|map|filter|sorted|open|input|super|__init__|self)\b/g, '<span class="sh-fn">$1</span>');
  } else {
    html = html.replace(/(`[\s\S]*?`|&quot;(?:[^&]|&(?!quot;))*?&quot;|'[^'\n]*?')/g, (m) => hold(m, 'sh-str'));
    html = html.replace(/(\/\/.*)/g, (m) => hold(m, 'sh-cmt'));
    html = html.replace(/\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|default|async|await|typeof|instanceof|null|undefined|true|false|this|of|in)\b/g, '<span class="sh-kw">$1</span>');
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="sh-num">$1</span>');
    html = html.replace(/\b(console|Math|JSON|Array|Object|String|Number|Boolean|Promise|setTimeout|setInterval|require|module|exports|process)\b/g, '<span class="sh-fn">$1</span>');
  }
  for (let i = 0; i < tokens.length; i++) html = html.replace('\x00T' + i + '\x00', tokens[i]);
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
  if (textarea && highlight) { highlight.scrollTop = textarea.scrollTop; highlight.scrollLeft = textarea.scrollLeft; }
  if (textarea && gutter) gutter.scrollTop = textarea.scrollTop;
}
window.syncScriptScroll = syncScriptScroll;

export function handleScriptKeydown(e, idx) {
  if (e.key === 'Tab') {
    e.preventDefault(); const ta = e.target;
    const start = ta.selectionStart; const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + '    ' + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + 4; handleScriptInput(idx);
  }
}
window.handleScriptKeydown = handleScriptKeydown;

export function updateScriptEditor(idx) { renderFlow(); }
window.updateScriptEditor = updateScriptEditor;
