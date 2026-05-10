import {
  state,
  SIG_COLORS,
  saveSignals,
  pushUndo,
  uid,
  STEP_TYPES,
  MEDIA_OPTIONS,
} from "./state.js";
import { escHtml, escAttr, showToast, showPrompt } from "./ui.js";

// ── Event delegation para el flow-container ──
export function initFlowDelegation() {
  const panel = document.querySelector(".panel");
  if (!panel) return;

  panel.addEventListener("click", (e) => {
    const target = e.target;
    const delBtn = target.closest(".btn-del-step");
    if (delBtn) {
      deleteStep(JSON.parse(delBtn.dataset.path));
      return;
    }
    const keyBtn = target.closest(".btn-key-capture");
    if (keyBtn) {
      startKeyCapture(JSON.parse(keyBtn.dataset.path));
      return;
    }
    const browseBtn = target.closest(".btn-browse-file");
    if (browseBtn) {
      browseFile(JSON.parse(browseBtn.dataset.path));
      return;
    }
    const regionBtn = target.closest(".btn-region-capture");
    if (regionBtn) {
      startRegionSelection(JSON.parse(regionBtn.dataset.path));
      return;
    }
  });

  panel.addEventListener("change", (e) => {
    const target = e.target;
    if (target.classList.contains("step-type-select")) {
      changeStepType(JSON.parse(target.dataset.path), target.value);
      return;
    }
    if (target.classList.contains("condition-type-select")) {
      updateParam(JSON.parse(target.dataset.path), "type", target.value);
      return;
    }
    if (target.classList.contains("script-lang-select")) {
      const path = JSON.parse(target.dataset.path);
      updateParam(path, "lang", target.value);
      updateScriptEditor(path);
      return;
    }
    if (target.classList.contains("media-action-select")) {
      updateParam(JSON.parse(target.dataset.path), "action", target.value);
      return;
    }
  });

  panel.addEventListener("input", (e) => {
    const target = e.target;
    if (target.dataset.param && target.dataset.path) {
      updateParam(
        JSON.parse(target.dataset.path),
        target.dataset.param,
        target.value,
      );
    }
    if (target.classList.contains("script-textarea")) {
      handleScriptInput(JSON.parse(target.dataset.path));
    }
  });

  panel.addEventListener(
    "scroll",
    (e) => {
      if (e.target.classList.contains("script-textarea")) {
        syncScriptScroll(JSON.parse(e.target.dataset.path));
      }
    },
    true,
  );

  panel.addEventListener("keydown", (e) => {
    if (e.target.classList.contains("script-textarea")) {
      handleScriptKeydown(e, JSON.parse(e.target.dataset.path));
    }
  });
}

// ── Context Menu Logic ──
let activeContextMenu = null;
let stepClipboard = null;

function closeContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

document.addEventListener("click", closeContextMenu);
document.addEventListener("contextmenu", (e) => {
  if (
    !e.target.closest(".sig-card") &&
    !e.target.closest(".context-menu") &&
    !e.target.closest(".step-card")
  ) {
    closeContextMenu();
  }
});

function showSignalContextMenu(e, sig) {
  e.preventDefault();
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const options = [
    { label: "Duplicar", ico: "👯", action: () => duplicateSignal(sig) },
    { label: "Cambiar nombre", ico: "✏️", action: () => renameSignal(sig) },
    {
      label: "Copiar JSON",
      ico: "📋",
      action: () => copySignalToClipboard(sig),
    },
    {
      label: "Exportar archivo",
      ico: "📦",
      action: () => exportSingleWorkflow(sig),
    },
    { type: "divider" },
    {
      label: "Eliminar",
      ico: "✕",
      action: () => {
        state.selectedSig = sig;
        deleteCurrentSignal();
      },
    },
  ];

  renderContextMenuOptions(menu, options);

  menu.onclick = (e) => e.stopPropagation();
  document.body.appendChild(menu);

  positionContextMenu(e, menu);
  activeContextMenu = menu;
}

function showStepContextMenu(e, path, onEdit = null) {
  e.preventDefault();
  e.stopPropagation();
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const options = [];

  // If there's selected text, add a copy option
  const selectedText = window.getSelection().toString();
  if (selectedText) {
    options.push({
      label: "Copiar texto seleccionado",
      ico: "✂️",
      action: () => {
        navigator.clipboard.writeText(selectedText);
        showToast("Copiado", "Texto copiado al portapapeles");
      },
    });
    options.push({ type: "divider" });
  }

  if (onEdit) {
    options.push({ label: "Modificar nota", ico: "✏️", action: onEdit });
    options.push({ type: "divider" });
  }

  options.push({
    label: "Duplicar",
    ico: "👯",
    action: () => duplicateStep(path),
  });
  options.push({
    label: "Copiar paso",
    ico: "📋",
    action: () => copyStep(path),
  });

  if (stepClipboard) {
    options.push({
      label: "Pegar antes",
      ico: "📥",
      action: () => pasteStep(path, false),
    });
    options.push({
      label: "Pegar después",
      ico: "📥",
      action: () => pasteStep(path, true),
    });
  }

  options.push({ type: "divider" });
  options.push({ label: "Eliminar", ico: "✕", action: () => deleteStep(path) });

  renderContextMenuOptions(menu, options);

  menu.onclick = (e) => e.stopPropagation();
  document.body.appendChild(menu);

  positionContextMenu(e, menu);
  activeContextMenu = menu;
}

function renderContextMenuOptions(menu, options) {
  options.forEach((opt) => {
    if (opt.type === "divider") {
      const div = document.createElement("div");
      div.className = "context-menu-divider";
      menu.appendChild(div);
      return;
    }
    const item = document.createElement("div");
    item.className = "context-menu-item";
    item.innerHTML = `<span class="ico">${opt.ico}</span><span>${opt.label}</span>`;
    item.onclick = () => {
      opt.action();
      closeContextMenu();
    };
    menu.appendChild(item);
  });
}

function positionContextMenu(e, menu) {
  const menuWidth = 180;
  const menuHeight = menu.offsetHeight || 200; // Estimate if not yet in DOM
  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth) x -= menuWidth;
  if (y + menuHeight > window.innerHeight) y -= menuHeight;

  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
}

// ── Step Clipboard Actions ──

export function copyStep(path) {
  const step = getStepByPath(path);
  if (step) {
    stepClipboard = JSON.parse(JSON.stringify(step));
    showToast(
      "Paso copiado",
      `"${STEP_TYPES[step.type]?.label || step.type}" al portapapeles`,
    );
  }
}

export function pasteStep(path, after = true) {
  if (!stepClipboard) {
    showToast("Error", "No hay nada para pegar");
    return;
  }
  pushUndo();

  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const newIndex = after ? index + 1 : index;

  const stepCopy = JSON.parse(JSON.stringify(stepClipboard));
  stepCopy.id = uid();

  const updateIds = (s) => {
    if (s.params?.steps) {
      s.params.steps.forEach((sub) => {
        sub.id = uid();
        updateIds(sub);
      });
    }
  };
  updateIds(stepCopy);

  let targetSteps;
  if (parentPath.length === 0) {
    targetSteps = state.signals[state.selectedSig].steps;
  } else {
    const parent = getStepByPath(parentPath);
    targetSteps = parent.params.steps;
  }

  targetSteps.splice(newIndex, 0, stepCopy);
  saveSignals();
  renderFlow();
  showToast("Pegado", "Paso insertado correctamente");
}

export function duplicateStep(path) {
  const step = getStepByPath(path);
  if (!step) return;

  pushUndo();
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];

  const stepCopy = JSON.parse(JSON.stringify(step));
  stepCopy.id = uid();
  const updateIds = (s) => {
    if (s.params?.steps) {
      s.params.steps.forEach((sub) => {
        sub.id = uid();
        updateIds(sub);
      });
    }
  };
  updateIds(stepCopy);

  let targetSteps;
  if (parentPath.length === 0) {
    targetSteps = state.signals[state.selectedSig].steps;
  } else {
    const parent = getStepByPath(parentPath);
    targetSteps = parent.params.steps;
  }

  targetSteps.splice(index + 1, 0, stepCopy);
  saveSignals();
  renderFlow();
  showToast("Duplicado", "Paso duplicado correctamente");
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
    let badge = "";
    if (entry.assignedToButton?.length) {
      const label = entry.assignedToButton
        .map((s) => (s === "RAPIDA" ? "RÁP" : s === "MEDIA" ? "MED" : "LEN"))
        .join("+");
      badge = `<span class="sig-assigned-badge" title="Asignado a toque ${entry.assignedToButton.join(", ").toLowerCase()}">🔌 ${label}</span>`;
    }
    div.innerHTML = `
      <div class="sig-card-top">
        <span class="sig-color-dot"></span>
        <span class="sig-name">${escHtml(sig)}${badge}</span>
        <span class="sig-pulse"></span>
      </div>
      ${entry.label ? `<div class="sig-label">${escHtml(entry.label)}</div>` : ""}
      <div class="sig-steps-count">${countSteps(entry.steps)} paso${countSteps(entry.steps) === 1 ? "" : "s"}</div>`;

    div.addEventListener("click", () => selectSignal(sig));
    div.addEventListener("contextmenu", (e) => showSignalContextMenu(e, sig));

    list.appendChild(div);
    const dot = div.querySelector(".sig-color-dot");
    if (dot) dot.style.background = entry.color;
  });
}

function countSteps(steps) {
  if (!steps) return 0;
  let count = steps.length;
  steps.forEach((s) => {
    if (s.params?.steps) count += countSteps(s.params.steps);
  });
  return count;
}

export function addSignal() {
  const input = document.getElementById("new-sig-cfg");
  const sig = input.value.trim().toUpperCase().replace(/\s+/g, "_");
  if (!sig) return;
  if (state.signals[sig]) {
    showToast("Ya existe", `"${sig}" ya está`);
    return;
  }
  pushUndo();
  const color =
    SIG_COLORS[Object.keys(state.signals).length % SIG_COLORS.length];
  state.signals[sig] = { label: "", color, steps: [], assignedToButton: [] };
  input.value = "";
  saveSignals();
  renderSignalList();
  selectSignal(sig);
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
    Object.keys(state.signals).forEach((key) => {
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
  state.signals[newName].assignedToButton = [];
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

  const payload = JSON.stringify(
    { version: "1.0", type: "single-workflow", name: sig, data },
    null,
    2,
  );
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

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const options = [
    { label: "Desde archivo (.json)", ico: "📁", action: importFromFile },
    { label: "Desde portapapeles", ico: "📋", action: importFromClipboard },
  ];

  options.forEach((opt) => {
    const item = document.createElement("div");
    item.className = "context-menu-item";
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
      showToast(
        "Error",
        "El contenido del portapapeles no es un workflow válido",
      );
    }
  } catch (e) {
    showToast(
      "Error",
      "No se pudo leer el portapapeles o el formato JSON es inválido",
    );
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
  saveSignals();
  renderSignalList();
  document.getElementById("se-empty").classList.remove("d-none");
  document.getElementById("se-content").classList.add("d-none");
  showToast("Eliminado", `Workflow "${deleted}" eliminado.`);
}
window.deleteCurrentSignal = deleteCurrentSignal;

export function updateSignalLabel(val) {
  if (!state.selectedSig) return;
  state.signals[state.selectedSig].label = val;
  saveSignals();
  const card = document.querySelector(
    `.sig-card[data-sig="${CSS.escape(state.selectedSig)}"]`,
  );
  if (card) {
    const lbl = card.querySelector(".sig-label");
    if (lbl) lbl.textContent = val;
  }
}
window.updateSignalLabel = updateSignalLabel;

export function selectSignal(sig) {
  state.selectedSig = sig;
  document
    .querySelectorAll(".sig-card")
    .forEach((c) => c.classList.toggle("active", c.dataset.sig === sig));
  document.getElementById("se-empty").classList.add("d-none");
  document.getElementById("se-content").classList.remove("d-none");
  document.getElementById("se-signal-tag").textContent = sig;
  document.getElementById("se-label-input").value =
    state.signals[sig]?.label || "";
  updateAssignButtonUI();
  renderFlow();
}
window.selectSignal = selectSignal;

export function toggleAssignMenu(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("assign-dropdown");
  if (!dropdown) return;
  dropdown.classList.toggle("show");

  document.getElementById("step-menu")?.classList.remove("open");
}
window.toggleAssignMenu = toggleAssignMenu;

export function initAssignDropdown() {
  document
    .querySelectorAll("#assign-dropdown .dropdown-item")
    .forEach((item) => {
      item.addEventListener("click", () => assignSpeed(item.dataset.speed));
    });
}

export function assignSpeed(speed) {
  if (!state.selectedSig) return;
  pushUndo();

  let speeds = state.signals[state.selectedSig].assignedToButton;
  if (!Array.isArray(speeds)) speeds = speeds ? [speeds] : [];

  if (speeds.includes(speed)) {
    speeds = speeds.filter((s) => s !== speed);
  } else {
    speeds.push(speed);
  }

  state.signals[state.selectedSig].assignedToButton = speeds;
  saveSignals();
  updateAssignButtonUI();
  renderSignalList();
}

export function updateAssignButtonUI() {
  if (!state.selectedSig) return;
  const btn = document.getElementById("btn-assign");
  if (!btn) return;

  const assigned = state.signals[state.selectedSig].assignedToButton;
  const speeds = Array.isArray(assigned)
    ? assigned
    : assigned
      ? [assigned]
      : [];

  if (speeds.length) {
    btn.classList.add("assigned");
    const label = speeds
      .map((s) =>
        s === "RAPIDA" ? "Rápida" : s === "MEDIA" ? "Media" : "Lenta",
      )
      .join(" + ");
    btn.textContent = `✅ ${label}`;
  } else {
    btn.classList.remove("assigned");
    btn.textContent = "🔌 Asignar";
  }

  document
    .querySelectorAll("#assign-dropdown .dropdown-item")
    .forEach((item) => {
      item.classList.toggle("active", speeds.includes(item.dataset.speed));
    });
}

export function renderFlow(container, steps, path = []) {
  const isRoot = !container;
  const fc = container || document.getElementById("flow-container");
  if (!fc) return;

  if (isRoot) {
    fc.innerHTML = "";
    steps = state.signals[state.selectedSig]?.steps || [];
  }

  // Initial insertion bar
  fc.appendChild(makeInsertionBar(path, 0));

  if (!steps.length) {
    const empty = document.createElement("div");
    empty.className = "flow-empty";
    empty.innerHTML = `<span class="flow-empty-icon">⋯</span><span>Sin pasos — agregá uno arriba</span>`;
    fc.appendChild(empty);
  } else {
    steps.forEach((step, i) => {
      const currentPath = [...path, i];
      fc.appendChild(makeStepCard(step, i, currentPath));

      // Insertion bar after each step
      fc.appendChild(makeInsertionBar(path, i + 1));
    });
  }

  if (isRoot) {
    // Post-render script initialization
    const findScripts = (arr, p) => {
      arr.forEach((s, idx) => {
        const cp = [...p, idx];
        if (s.type === "run_script") handleScriptInput(cp);
        if (s.params?.steps) findScripts(s.params.steps, cp);
      });
    };
    findScripts(steps, []);
  }
}

function makeInsertionBar(parentPath, index) {
  const bar = document.createElement("div");
  bar.className = "step-insertion-bar";

  const line = document.createElement("div");
  line.className = "step-insertion-line";
  bar.appendChild(line);

  const group = document.createElement("div");
  group.className = "step-insertion-group";

  const btnStep = document.createElement("button");
  btnStep.className = "btn-insert btn-insert-step";
  btnStep.innerHTML = `<span>+ Paso</span>`;
  btnStep.title = "Agregar paso aquí";
  btnStep.onclick = (e) => {
    e.stopPropagation();
    state.insertionPoint = { path: parentPath, index };
    toggleStepMenuAt(e.clientX, e.clientY);
  };

  const btnNote = document.createElement("button");
  btnNote.className = "btn-insert btn-insert-note";
  btnNote.innerHTML = `<span>+ Nota</span>`;
  btnNote.title = "Agregar nota aquí";
  btnNote.onclick = (e) => {
    e.stopPropagation();
    addStep("note", parentPath, index);
  };

  group.appendChild(btnStep);
  group.appendChild(btnNote);

  if (stepClipboard) {
    const btnPaste = document.createElement("button");
    btnPaste.className = "btn-insert btn-insert-paste";
    btnPaste.innerHTML = `<span>📋 Pegar</span>`;
    btnPaste.title = "Pegar paso copiado aquí";
    btnPaste.onclick = (e) => {
      e.stopPropagation();
      pasteStep([...parentPath, index], false);
    };
    group.appendChild(btnPaste);
  }

  bar.appendChild(group);

  // Drag & Drop support
  bar.addEventListener("dragover", (e) => {
    if (!state.dragSrcPath) return;
    e.preventDefault();
    e.stopPropagation();
    bar.classList.add("drag-over");
  });

  bar.addEventListener("dragleave", (e) => {
    bar.classList.remove("drag-over");
  });

  bar.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    bar.classList.remove("drag-over");

    if (!state.dragSrcPath) return;
    const srcPath = JSON.parse(state.dragSrcPath);
    const destPath = [...parentPath, index];

    moveStep(srcPath, destPath);
  });

  return bar;
}

function toggleStepMenuAt(x, y) {
  const menu = document.getElementById("step-menu");
  if (!menu) return;
  menu.style.display = "block";
  const menuH = menu.offsetHeight;
  menu.style.display = "";
  menu.style.top = `${Math.min(y, window.innerHeight - menuH - 10)}px`;
  menu.style.left = `${x}px`;
  menu.style.transform = "none";
  menu.classList.add("open");
}

export function makeStepCard(step, idx, path) {
  const meta = STEP_TYPES[step.type] || STEP_TYPES.notify;
  const pathStr = JSON.stringify(path);
  const card = document.createElement("div");
  card.className = "step-card";
  if (meta.isContainer) card.classList.add("step-card-container");
  if (step.type === "note") card.classList.add("step-card-note");
  card.draggable = true;
  card.dataset.path = pathStr;

  // Header
  const header = document.createElement("div");
  header.className = "step-header";

  const dragHandle = document.createElement("span");
  dragHandle.className = "drag-handle";
  dragHandle.title = "Arrastrar para reordenar";
  dragHandle.textContent = "⠿";
  header.appendChild(dragHandle);

  const badge = document.createElement("span");
  badge.className = `step-type-badge ${meta.cls}`;
  const icon = document.createElement("span");
  icon.className = "step-icon";
  icon.textContent = meta.icon;
  badge.appendChild(icon);

  const typeSelect = document.createElement("select");
  typeSelect.className = "step-type-select";
  typeSelect.dataset.path = pathStr;
  Object.entries(STEP_TYPES).forEach(([k, v]) => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = v.label;
    if (k === step.type) opt.selected = true;
    typeSelect.appendChild(opt);
  });
  badge.appendChild(typeSelect);
  header.appendChild(badge);

  const stepNum = document.createElement("span");
  stepNum.className = "step-num";
  stepNum.textContent = `#${idx + 1}`;
  header.appendChild(stepNum);

  const delBtn = document.createElement("button");
  delBtn.className = "btn-del-step";
  delBtn.title = "Eliminar paso";
  delBtn.textContent = "✕";
  delBtn.dataset.path = pathStr;
  header.appendChild(delBtn);

  card.appendChild(header);

  // Params or Content
  if (step.type === "note") {
    const content = document.createElement("div");
    content.className = "step-note-content";

    const render = () => {
      content.innerHTML = window.marked
        ? marked.parse(
            step.params?.text || "_Nota vacía (doble click para editar)_",
          )
        : step.params?.text || "";
    };

    const edit = () => {
      const ta = document.createElement("textarea");
      ta.className = "step-note-editor";
      ta.value = step.params?.text || "";
      ta.placeholder = "Escribí tu nota en Markdown...";
      ta.onblur = () => {
        updateParam(path, "text", ta.value);
        render();
      };
      content.innerHTML = "";
      content.appendChild(ta);
      ta.focus();
    };

    content.ondblclick = (e) => {
      e.stopPropagation();
      edit();
    };
    content.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      showStepContextMenu(e, path, edit);
    };

    render();
    card.appendChild(content);
  } else {
    const params = document.createElement("div");
    params.className = "step-params";
    buildStepParams(params, step, path);
    card.appendChild(params);
  }

  // Context Menu
  card.addEventListener("contextmenu", (e) => {
    if (step.type !== "note") {
      showStepContextMenu(e, path);
    }
  });

  // Nested steps if container
  if (meta.isContainer) {
    const children = document.createElement("div");
    children.className = "step-children";
    children.dataset.path = pathStr;
    const childSteps = step.params?.steps || [];
    renderFlow(children, childSteps, path);
    card.appendChild(children);

    // Drop zone for children (to move INSIDE)
    children.addEventListener("dragover", (e) => {
      if (!state.dragSrcPath) return;
      e.preventDefault();
      e.stopPropagation();
      children.classList.add("drag-over");
    });
    children.addEventListener("dragleave", () =>
      children.classList.remove("drag-over"),
    );
    children.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      children.classList.remove("drag-over");

      if (!state.dragSrcPath) return;
      const srcPath = JSON.parse(state.dragSrcPath);
      const destPath = [...path, childSteps.length]; // Drop at the end of the container

      if (isPathEqual(srcPath, destPath) || isPathParent(srcPath, destPath))
        return;

      moveStep(srcPath, destPath);
    });
  }

  // Drag events
  card.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    state.dragSrcPath = pathStr;
    card.classList.add("dragging");
    document.getElementById("flow-container")?.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
    state.dragSrcPath = null;
    document.getElementById("flow-container")?.classList.remove("is-dragging");
    document
      .querySelectorAll(".step-card, .step-children, .step-insertion-bar")
      .forEach((c) => c.classList.remove("drag-over"));
  });

  return card;
}

function isPathEqual(p1, p2) {
  return JSON.stringify(p1) === JSON.stringify(p2);
}

function isPathParent(parent, child) {
  if (parent.length >= child.length) return false;
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] !== child[i]) return false;
  }
  return true;
}

function moveStep(srcPath, destPath) {
  if (!srcPath || !destPath) return;
  if (isPathEqual(srcPath, destPath) || isPathParent(srcPath, destPath)) return;

  pushUndo();

  // Clonar para operar de forma atómica y evitar que desaparezcan bloques
  const rootSteps = JSON.parse(
    JSON.stringify(state.signals[state.selectedSig].steps),
  );

  // 1. Ajustar destPath si la eliminación del origen afecta los índices
  const adjustedDest = [...destPath];
  let i = 0;
  while (
    i < srcPath.length &&
    i < destPath.length &&
    srcPath[i] === destPath[i]
  ) {
    i++;
  }
  // Si en el primer punto de diferencia, el origen está antes que el destino en el mismo array,
  // el índice del destino debe decrementarse porque el array se va a contraer.
  if (i < srcPath.length && i < destPath.length && srcPath[i] < destPath[i]) {
    adjustedDest[i]--;
  }

  try {
    const getAndRemove = (steps, p) => {
      if (p.length === 1) return steps.splice(p[0], 1)[0];
      const target = steps[p[0]];
      if (!target || !target.params || !target.params.steps)
        throw new Error("Path de origen inválido");
      return getAndRemove(target.params.steps, p.slice(1));
    };

    const insert = (steps, p, item) => {
      if (p.length === 1) {
        steps.splice(p[0], 0, item);
        return;
      }
      const target = steps[p[0]];
      if (!target.params) target.params = {};
      if (!target.params.steps) target.params.steps = [];
      insert(target.params.steps, p.slice(1), item);
    };

    const step = getAndRemove(rootSteps, srcPath);
    if (step) {
      insert(rootSteps, adjustedDest, step);
      state.signals[state.selectedSig].steps = rootSteps;
    }
  } catch (err) {
    console.error("Error crítico al mover paso:", err);
  }

  state.dragSrcPath = null;
  saveSignals();
  renderFlow();
}

function discoverVariables(currentPath = null) {
  const vars = new Set();
  if (!state.selectedSig) return [];

  const scan = (steps, pathPrefix = []) => {
    if (!steps || !Array.isArray(steps)) return;
    steps.forEach((s, i) => {
      if (!s) return;
      const p = [...pathPrefix, i];
      if (s.type === "set_variable" && s.params?.name)
        vars.add(s.params.name.trim());
      if (s.type === "loop" && s.params?.mode === "foreach") {
        const vname = (s.params.var_name || "item").trim();
        // Solo mostrar si el bloque actual está DENTRO de este bucle
        if (currentPath && isPathParent(p, currentPath)) {
          vars.add(vname);
        }
      }
      if (s.params?.steps) scan(s.params.steps, p);
    });
  };

  const rootSteps = state.signals[state.selectedSig]?.steps;
  if (rootSteps) scan(rootSteps, []);

  return Array.from(vars).sort();
}

function buildStepParams(container, step, path) {
  const p = step.params || {};
  const pathStr = JSON.stringify(path);

  function makeRow(labelText) {
    const row = document.createElement("div");
    row.className = "param-row";
    const lbl = document.createElement("div");
    lbl.className = "param-label";
    lbl.textContent = labelText;
    row.appendChild(lbl);
    return row;
  }
  function makeInput(type, value, placeholder, param) {
    const inp = document.createElement("input");
    inp.type = type;
    inp.className = "param-input";
    inp.value = value;
    inp.placeholder = placeholder || "";
    inp.dataset.path = pathStr;
    inp.dataset.param = param;
    return inp;
  }
  function makeSelect(options, current, param, cls = "") {
    const sel = document.createElement("select");
    sel.className = "param-select " + cls;
    sel.dataset.path = pathStr;
    sel.dataset.param = param;
    options.forEach((o) => {
      const opt = document.createElement("option");
      opt.value = o.v !== undefined ? o.v : o;
      opt.textContent = o.l !== undefined ? o.l : o;
      if (current === (o.v !== undefined ? o.v : o)) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", (e) =>
      updateParam(path, param, e.target.value),
    );
    return sel;
  }
  function makeHint(text) {
    const hint = document.createElement("div");
    hint.className = "param-hint";
    hint.textContent = text;
    return hint;
  }
  function makeVarLink(param) {
    const btn = document.createElement("button");
    btn.className = "btn-var-link";
    btn.title = "Vincular a variable";
    btn.textContent = "v";
    btn.onclick = (e) => {
      e.stopPropagation();
      closeContextMenu();
      const vars = discoverVariables(path);
      if (!vars.length) {
        showToast("Sin variables", "Definí una variable primero");
        return;
      }

      const menu = document.createElement("div");
      menu.className = "context-menu";
      vars.forEach((v) => {
        const item = document.createElement("div");
        item.className = "context-menu-item";
        item.textContent = `$${v}`;
        item.onclick = () => {
          updateParam(path, param, `$${v}`);
          renderFlow();
          closeContextMenu();
        };
        menu.appendChild(item);
      });
      document.body.appendChild(menu);
      const rect = btn.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 5}px`;
      activeContextMenu = menu;
    };
    return btn;
  }

  const availableVars = discoverVariables(path);

  switch (step.type) {
    case "screenshot": {
      const row = makeRow("Nombre del archivo");
      const wrap = document.createElement("div"); wrap.className = "param-input-row";
      const inp = makeInput("text", p.filename || "", "ej: captura.png o $mi_var", "filename");
      inp.className = "param-input flex-1";
      wrap.appendChild(inp);
      wrap.appendChild(makeVarLink("filename"));
      row.appendChild(wrap);
      container.appendChild(row);
      container.appendChild(makeHint("Se guardará en la carpeta Imágenes/MacroPad. Dejar vacío para nombre automático."));
      break;
    }
    case "screenshot_region": {
      const r1 = makeRow("Nombre del archivo");
      const w1 = document.createElement("div"); w1.className = "param-input-row";
      const i1 = makeInput("text", p.filename || "", "ej: region.png", "filename");
      i1.className = "param-input flex-1";
      w1.appendChild(i1); w1.appendChild(makeVarLink("filename"));
      r1.appendChild(w1); container.appendChild(r1);
      
      container.appendChild(makeHint("Al ejecutarse, se pedirá seleccionar el área en pantalla."));
      break;
    }
    case "keypress": {
      const row = makeRow("Combinación de teclas");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = makeInput(
        "text",
        p.combo || "",
        "ej: cmd+space, $mi_tecla",
        "combo",
      );
      inp.className = "param-input key-input flex-1";
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost btn-key-capture";
      btn.title = "Capturar teclas";
      btn.textContent = "⌨️";
      btn.dataset.path = pathStr;
      wrap.appendChild(inp);
      wrap.appendChild(makeVarLink("combo"));
      wrap.appendChild(btn);
      row.appendChild(wrap);
      row.appendChild(
        makeHint(
          "Escribí la combinación manualmente o usá el botón para capturarla.",
        ),
      );
      container.appendChild(row);
      break;
    }
    case "wait": {
      const row = makeRow("Duración (ms)");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = makeInput("text", p.ms || 500, "", "ms");
      inp.className = "param-input flex-1";
      wrap.appendChild(inp);
      wrap.appendChild(makeVarLink("ms"));
      row.appendChild(wrap);
      container.appendChild(row);
      break;
    }
    case "clipboard": {
      const row = makeRow("Texto a copiar");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = makeInput("text", p.text || "", "Texto o $variable", "text");
      inp.className = "param-input flex-1";
      wrap.appendChild(inp);
      wrap.appendChild(makeVarLink("text"));
      row.appendChild(wrap);
      container.appendChild(row);
      break;
    }
    case "media": {
      const row = makeRow("Acción");
      row.appendChild(
        makeSelect(
          MEDIA_OPTIONS.map((o) => ({ v: o.value, l: o.label })),
          p.action,
          "action",
          "media-action-select",
        ),
      );
      container.appendChild(row);
      break;
    }
    case "open_url": {
      const row = makeRow("URL");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = makeInput(
        "text",
        p.url || "",
        "https://ejemplo.com o $variable",
        "url",
      );
      inp.className = "param-input flex-1";
      wrap.appendChild(inp);
      wrap.appendChild(makeVarLink("url"));
      row.appendChild(wrap);
      container.appendChild(row);
      break;
    }
    case "run_cmd": {
      const row = makeRow("Comando");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = makeInput("text", p.cmd || "", "Comando o $variable", "cmd");
      inp.className = "param-input flex-1";
      wrap.appendChild(inp);
      wrap.appendChild(makeVarLink("cmd"));
      row.appendChild(wrap);
      container.appendChild(row);
      break;
    }
    case "open_file":
    case "open_app": {
      const isApp = step.type === "open_app";
      const row = makeRow(isApp ? "Aplicación (Ruta)" : "Ruta");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = makeInput(
        "text",
        p.path || "",
        isApp ? "C:\\Ruta\\a\\App.exe" : "/Users/vos/archivo.pdf",
        "path",
      );
      inp.id = `path-${pathStr}`;
      inp.className = "param-input flex-1";
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost btn-browse-file";
      btn.title = isApp ? "Seleccionar aplicación" : "Seleccionar archivo";
      btn.textContent = "📂";
      btn.dataset.path = pathStr;
      wrap.appendChild(inp);
      wrap.appendChild(makeVarLink("path"));
      wrap.appendChild(btn);
      row.appendChild(wrap);
      container.appendChild(row);
      break;
    }
    case "set_variable": {
      const r1 = makeRow("Nombre");
      r1.appendChild(makeInput("text", p.name || "", "mi_variable", "name"));
      container.appendChild(r1);
      const r2 = makeRow("Tipo");
      r2.appendChild(
        makeSelect(
          [
            { v: "string", l: "Texto" },
            { v: "int", l: "Número" },
            { v: "list", l: "Lista (JSON)" },
          ],
          p.type || "string",
          "type",
        ),
      );
      container.appendChild(r2);
      const r3 = makeRow("Valor inicial");
      r3.appendChild(makeInput("text", p.value || "", "valor...", "value"));
      container.appendChild(r3);
      break;
    }
    case "modify_variable": {
      const r1 = makeRow("Variable");
      r1.appendChild(makeSelect(availableVars, p.name, "name"));
      container.appendChild(r1);
      const r2 = makeRow("Operación");
      r2.appendChild(
        makeSelect(
          [
            { v: "set", l: "Asignar (=)" },
            { v: "add", l: "Sumar (+)" },
            { v: "sub", l: "Restar (-)" },
            { v: "concat", l: "Concatenar texto" },
          ],
          p.op || "set",
          "op",
        ),
      );
      container.appendChild(r2);
      const r3 = makeRow("Valor");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = makeInput(
        "text",
        p.value || "",
        "valor o $variable",
        "value",
      );
      inp.className = "param-input flex-1";
      wrap.appendChild(inp);
      wrap.appendChild(makeVarLink("value"));
      r3.appendChild(wrap);
      container.appendChild(r3);
      break;
    }
    case "list_operation": {
      const r1 = makeRow("Lista");
      r1.appendChild(makeSelect(availableVars, p.name, "name"));
      container.appendChild(r1);
      const r2 = makeRow("Operación");
      r2.appendChild(
        makeSelect(
          [
            { v: "append", l: "Agregar al final" },
            { v: "pop", l: "Eliminar último" },
            { v: "remove_at", l: "Eliminar en índice" },
            { v: "clear", l: "Vaciar lista" },
          ],
          p.op || "append",
          "op",
        ),
      );
      container.appendChild(r2);
      if (p.op === "append" || p.op === "remove_at") {
        const r3 = makeRow(p.op === "append" ? "Elemento" : "Índice");
        const wrap = document.createElement("div");
        wrap.className = "param-input-row";
        const inp = makeInput(
          "text",
          p.value || "",
          "valor o $variable",
          "value",
        );
        inp.className = "param-input flex-1";
        wrap.appendChild(inp);
        wrap.appendChild(makeVarLink("value"));
        r3.appendChild(wrap);
        container.appendChild(r3);
      }
      break;
    }
    case "notify": {
      const r1 = makeRow("Título");
      const w1 = document.createElement("div");
      w1.className = "param-input-row";
      const i1 = makeInput(
        "text",
        p.title || "",
        "Título o $variable",
        "title",
      );
      i1.className = "param-input flex-1";
      w1.appendChild(i1);
      w1.appendChild(makeVarLink("title"));
      r1.appendChild(w1);
      container.appendChild(r1);

      const r2 = makeRow("Mensaje");
      const w2 = document.createElement("div");
      w2.className = "param-input-row";
      const i2 = makeInput("text", p.body || "", "Cuerpo o $variable", "body");
      i2.className = "param-input flex-1";
      w2.appendChild(i2);
      w2.appendChild(makeVarLink("body"));
      r2.appendChild(w2);
      container.appendChild(r2);
      break;
    }
    case "loop": {
      const r1 = makeRow("Modo");
      r1.appendChild(
        makeSelect(
          [
            { v: "count", l: "Cantidad fija / variable" },
            { v: "foreach", l: "Para cada elemento (Lista)" },
          ],
          p.mode || "count",
          "mode",
          "loop-mode-select",
        ),
      );
      container.appendChild(r1);

      if (p.mode === "foreach") {
        const r2 = makeRow("Lista");
        r2.appendChild(makeSelect(availableVars, p.list_name, "list_name"));
        container.appendChild(r2);
        const r3 = makeRow("Var. Temporal");
        r3.appendChild(
          makeInput(
            "text",
            p.var_name || "item",
            "nombre de variable",
            "var_name",
          ),
        );
        container.appendChild(r3);
      } else {
        const r2 = makeRow("Iteraciones");
        const wrap = document.createElement("div");
        wrap.className = "param-input-row";
        const inp = makeInput(
          "text",
          p.iterations || 5,
          "ej: 5 o $variable",
          "iterations",
        );
        inp.className = "param-input flex-1";
        wrap.appendChild(inp);
        wrap.appendChild(makeVarLink("iterations"));
        r2.appendChild(wrap);
        container.appendChild(r2);
      }
      break;
    }
    case "condition": {
      const r1 = makeRow("Si...");
      const opts = [
        { v: "prev_step_success", l: "El paso anterior fue exitoso" },
        { v: "clipboard_match", l: "El portapapeles contiene..." },
        { v: "app_running", l: "La aplicación está abierta..." },
        { v: "var_cmp", l: "Comparar variables" },
      ];
      r1.appendChild(
        makeSelect(
          opts,
          p.type || "prev_step_success",
          "type",
          "condition-type-select",
        ),
      );
      container.appendChild(r1);

      if (p.type === "clipboard_match" || p.type === "app_running") {
        const r2 = makeRow("Valor esperado");
        const wrap = document.createElement("div");
        wrap.className = "param-input-row";
        const inp = makeInput(
          "text",
          p.value || "",
          p.type === "app_running" ? "spotify.exe" : "texto o $variable",
          "value",
        );
        inp.className = "param-input flex-1";
        wrap.appendChild(inp);
        wrap.appendChild(makeVarLink("value"));
        r2.appendChild(wrap);
        container.appendChild(r2);
      } else if (p.type === "var_cmp") {
        const r2 = makeRow("Variables");
        const wrap = document.createElement("div");
        wrap.className = "param-input-row gap-4";
        const v1 = makeInput("text", p.var1 || "", "$var1", "var1");
        v1.className = "param-input flex-1";
        const v2 = makeInput("text", p.var2 || "", "$var2", "var2");
        v2.className = "param-input flex-1";
        wrap.appendChild(v1);
        wrap.appendChild(makeVarLink("var1"));
        wrap.appendChild(document.createTextNode("vs"));
        wrap.appendChild(v2);
        wrap.appendChild(makeVarLink("var2"));
        r2.appendChild(wrap);
        container.appendChild(r2);

        const r3 = makeRow("Operador");
        r3.appendChild(
          makeSelect(
            [
              { v: "==", l: "Igual (==)" },
              { v: "!=", l: "Distinto (!=)" },
              { v: ">", l: "Mayor (>)" },
              { v: "<", l: "Menor (<)" },
              { v: "contains", l: "Contiene" },
            ],
            p.op || "==",
            "op",
          ),
        );
        container.appendChild(r3);
      }
      break;
    }
    case "run_script": {
      const r1 = makeRow("Lenguaje");
      const selWrap = document.createElement("div");
      selWrap.className = "param-select-row";
      selWrap.appendChild(
        makeSelect(
          [
            { v: "python", l: "Python" },
            { v: "javascript", l: "JavaScript (Beta)" },
          ],
          p.lang || "python",
          "lang",
          "script-lang-select",
        ),
      );
      if (p.lang === "javascript") {
        const badge = document.createElement("span");
        badge.className = "script-beta-badge";
        badge.textContent = "BETA";
        selWrap.appendChild(badge);
      }
      r1.appendChild(selWrap);
      container.appendChild(r1);

      const r2 = makeRow("Código");
      const wrap = document.createElement("div");
      wrap.className = "script-editor-wrap";
      wrap.id = `script-editor-${pathStr}`;
      const gutter = document.createElement("div");
      gutter.className = "script-gutter";
      gutter.id = `script-gutter-${pathStr}`;
      gutter.textContent = "1";
      const codeArea = document.createElement("div");
      codeArea.className = "script-code-area";
      const pre = document.createElement("pre");
      pre.className = "script-highlight";
      pre.id = `script-highlight-${pathStr}`;
      pre.setAttribute("aria-hidden", "true");
      const ta = document.createElement("textarea");
      ta.className = "script-textarea";
      ta.id = `script-code-${pathStr}`;
      ta.dataset.path = pathStr;
      ta.spellcheck = false;
      ta.autocomplete = "off";
      ta.placeholder = "Escribí tu código aquí...";
      ta.value = p.code || "";
      codeArea.appendChild(pre);
      codeArea.appendChild(ta);
      wrap.appendChild(gutter);
      wrap.appendChild(codeArea);
      r2.appendChild(wrap);
      container.appendChild(r2);
      break;
    }
  }
}

function getStepByPath(path) {
  if (!state.selectedSig || !path || !path.length) return null;
  let steps = state.signals[state.selectedSig].steps;
  let target = null;
  for (let i = 0; i < path.length; i++) {
    target = steps[path[i]];
    if (i < path.length - 1) {
      if (!target.params) target.params = {};
      if (!target.params.steps) target.params.steps = [];
      steps = target.params.steps;
    }
  }
  return target;
}

export function updateParam(path, key, value) {
  const step = getStepByPath(path);
  if (!step) return;
  if (!step.params) step.params = {};
  step.params[key] = value;
  saveSignals();

  // Re-render only if structural change or specific logic depends on it
  if (["type", "mode", "op"].includes(key)) renderFlow();
}
window.updateParam = updateParam;

export function changeStepType(path, newType) {
  const step = getStepByPath(path);
  if (!step) return;
  pushUndo();
  step.type = newType;
  step.params = {};
  saveSignals();
  renderFlow();
}
window.changeStepType = changeStepType;

export function deleteStep(path) {
  pushUndo();
  const rootSteps = state.signals[state.selectedSig].steps;
  const remove = (steps, p) => {
    if (p.length === 1) {
      steps.splice(p[0], 1);
      return;
    }
    remove(steps[p[0]].params.steps, p.slice(1));
  };
  remove(rootSteps, path);
  saveSignals();
  renderSignalList();
  renderFlow();
}
window.deleteStep = deleteStep;

export function addStep(type, containerPath = null, index = -1) {
  if (!state.selectedSig) return;
  pushUndo();

  const contextPath = containerPath
    ? [...containerPath, index === -1 ? 999 : index]
    : null;
  const availableVars = discoverVariables(contextPath);
  const firstVar = availableVars[0] || "";

  const defaults = {
    keypress: { combo: "" },
    wait: { ms: 500 },
    clipboard: { text: "" },
    media: { action: "play_pause" },
    open_url: { url: "" },
    run_cmd: { cmd: "" },
    open_file: { path: "" },
    open_app: { path: "" },
    notify: { title: "Arduino", body: "" },
    run_script: { lang: "python", code: "" },
    loop: { mode: "count", iterations: 5, steps: [] },
    condition: { type: "prev_step_success", value: "", steps: [] },
    set_variable: {
      name: "variable_" + uid().substring(0, 4),
      type: "int",
      value: "0",
    },
    modify_variable: { name: firstVar, op: "add", value: "1" },
    list_operation: { name: firstVar, op: "append", value: "" },
    note: { text: "" },
    screenshot: { filename: "" },
    screenshot_region: { filename: "" },
  };
  const step = {
    id: uid(),
    type,
    params: JSON.parse(JSON.stringify(defaults[type] || {})),
  };

  let targetSteps;
  if (containerPath && containerPath.length > 0) {
    const container = getStepByPath(containerPath);
    if (container) {
      if (!container.params.steps) container.params.steps = [];
      targetSteps = container.params.steps;
    }
  } else {
    targetSteps = state.signals[state.selectedSig].steps;
  }

  if (targetSteps) {
    if (index === -1) {
      targetSteps.push(step);
    } else {
      targetSteps.splice(index, 0, step);
    }
  }

  saveSignals();
  renderSignalList();
  renderFlow();
  if (index === -1) {
    setTimeout(() => {
      const fc = document.getElementById("flow-container");
      fc.scrollTop = fc.scrollHeight;
    }, 50);
  }
}
window.addStep = addStep;

export function testCurrentSignal() {
  if (!state.selectedSig) return;
  const card = document.querySelector(
    `.sig-card[data-sig="${CSS.escape(state.selectedSig)}"]`,
  );
  if (card && card.classList.contains("running")) {
    showToast("En ejecución", "La secuencia ya se está ejecutando");
    return;
  }
  window.arduino.testSequence(state.selectedSig);
  showToast(
    `▶ Probando "${state.selectedSig}"`,
    `${state.signals[state.selectedSig]?.steps?.length || 0} pasos`,
  );
}
window.testCurrentSignal = testCurrentSignal;

export function startKeyCapture(path) {
  const pathStr = JSON.stringify(path);
  if (state.capturingPath !== null) {
    const prev = document.querySelector(
      `.param-input[data-path="${state.capturingPath}"][data-param="combo"]`,
    );
    if (prev) {
      prev.classList.remove("capturing");
      prev.readOnly = false;
      const prevStep = getStepByPath(JSON.parse(state.capturingPath));
      prev.value = prevStep?.params?.combo || "";
    }
    window.arduino.stopKeyCapture();
  }
  state.capturingPath = pathStr;
  const input = document.querySelector(
    `.param-input[data-path="${pathStr}"][data-param="combo"]`,
  );
  if (!input) return;
  input.classList.add("capturing");
  input.readOnly = true;
  input.value = "Presioná la combinación...";
  window.arduino.startKeyCapture();
  const escHandler = (e) => {
    if (e.key !== "Escape") return;
    if (state.capturingPath !== pathStr) {
      document.removeEventListener("keydown", escHandler);
      return;
    }
    state.capturingPath = null;
    input.classList.remove("capturing");
    input.readOnly = false;
    const step = getStepByPath(path);
    input.value = step?.params?.combo || "";
    window.arduino.stopKeyCapture();
    document.removeEventListener("keydown", escHandler);
  };
  document.addEventListener("keydown", escHandler);
}
window.startKeyCapture = startKeyCapture;

export async function browseFile(path) {
  const filePath = await window.arduino.selectFile();
  if (filePath) {
    const input = document.getElementById(`path-${JSON.stringify(path)}`);
    if (input) input.value = filePath;
    updateParam(path, "path", filePath);
  }
}
window.browseFile = browseFile;

export function startRegionSelection(path) {
  state.selectingRegionPath = JSON.stringify(path);
  window.arduino.startRegionSelection();
}
window.startRegionSelection = startRegionSelection;

export function buildStepMenu() {
  const menu = document.getElementById("step-menu");
  if (!menu) return;
  menu.innerHTML = "";

  const sections = [
    {
      title: "Básicos",
      items: ["keypress", "wait", "clipboard", "notify", "note"],
    },
    {
      title: "Sistema / Archivos",
      items: ["open_url", "run_cmd", "open_file", "open_app"],
    },
    {
      title: "Lógica / Variables",
      items: [
        "set_variable",
        "modify_variable",
        "list_operation",
        "loop",
        "condition",
      ],
    },
    {
      title: "Avanzado",
      items: ["media", "run_script", "screenshot", "screenshot_region"],
    },
  ];

  sections.forEach((section) => {
    const col = document.createElement("div");
    col.className = "step-menu-col";

    const title = document.createElement("div");
    title.className = "step-menu-title";
    title.textContent = section.title;
    col.appendChild(title);

    section.items.forEach((type) => {
      const meta = STEP_TYPES[type];
      if (!meta) return;

      const item = document.createElement("div");
      item.className = "menu-item";

      const iconEl = document.createElement("div");
      iconEl.className = `menu-icon ${meta.cls}`;
      iconEl.textContent = meta.icon;

      const textEl = document.createElement("div");
      textEl.className = "menu-text";

      const labelEl = document.createElement("span");
      labelEl.className = "menu-label";
      labelEl.textContent = meta.label;

      textEl.appendChild(labelEl);
      item.appendChild(iconEl);
      item.appendChild(textEl);

      item.addEventListener("click", () => {
        if (state.insertionPoint) {
          addStep(type, state.insertionPoint.path, state.insertionPoint.index);
          state.insertionPoint = null;
        } else {
          addStep(type);
        }
        menu.classList.remove("open");
      });
      col.appendChild(item);
    });
    menu.appendChild(col);
  });
}

export function toggleStepMenu() {
  if (!state.selectedSig) {
    showToast("Sin señal", "Seleccioná una señal primero");
    return;
  }
  state.insertionPoint = null;
  const menu = document.getElementById("step-menu");
  menu.classList.toggle("open");
}
window.toggleStepMenu = toggleStepMenu;

// ── Script Editor helpers ──
function highlightCode(code, lang) {
  const escHtmlLocal = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  let html = escHtmlLocal(code);
  const tokens = [];
  function hold(match, cls) {
    const id = "\x00T" + tokens.length + "\x00";
    tokens.push('<span class="' + cls + '">' + match + "</span>");
    return id;
  }
  if (lang === "python") {
    html = html.replace(
      /("""[\s\S]*?"""|'''[\s\S]*?'''|&quot;(?:[^&]|&(?!quot;))*?&quot;|'[^'\n]*?')/g,
      (m) => hold(m, "sh-str"),
    );
    html = html.replace(/(#.*)/g, (m) => hold(m, "sh-cmt"));
    html = html.replace(
      /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|pass|break|continue|and|or|not|in|is|None|True|False|lambda|yield|raise|global|nonlocal|assert|del|print)\b/g,
      '<span class="sh-kw">$1</span>',
    );
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="sh-num">$1</span>');
    html = html.replace(
      /\b(len|range|str|int|float|list|dict|tuple|set|type|isinstance|enumerate|zip|map|filter|sorted|open|input|super|__init__|self)\b/g,
      '<span class="sh-fn">$1</span>',
    );
  } else {
    html = html.replace(
      /(`[\s\S]*?`|&quot;(?:[^&]|&(?!quot;))*?&quot;|'[^'\n]*?')/g,
      (m) => hold(m, "sh-str"),
    );
    html = html.replace(/(\/\/.*)/g, (m) => hold(m, "sh-cmt"));
    html = html.replace(
      /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|from|default|async|await|typeof|instanceof|null|undefined|true|false|this|of|in)\b/g,
      '<span class="sh-kw">$1</span>',
    );
    html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="sh-num">$1</span>');
    html = html.replace(
      /\b(console|Math|JSON|Array|Object|String|Number|Boolean|Promise|setTimeout|setInterval|require|module|exports|process)\b/g,
      '<span class="sh-fn">$1</span>',
    );
  }
  for (let i = 0; i < tokens.length; i++)
    html = html.replace("\x00T" + i + "\x00", tokens[i]);
  if (!html.endsWith("\n")) html += "\n";
  return html;
}

function updateGutter(path) {
  const pathStr = JSON.stringify(path);
  const textarea = document.getElementById(`script-code-${pathStr}`);
  const gutter = document.getElementById(`script-gutter-${pathStr}`);
  if (!textarea || !gutter) return;
  const lines = textarea.value.split("\n").length;
  gutter.innerHTML = Array.from(
    { length: lines },
    (_, i) => `<div>${i + 1}</div>`,
  ).join("");
}

export function handleScriptInput(path) {
  const pathStr = JSON.stringify(path);
  const textarea = document.getElementById(`script-code-${pathStr}`);
  if (!textarea) return;
  const lang =
    document.getElementById(`script-lang-${pathStr}`)?.value || "python";
  updateParam(path, "code", textarea.value);
  const highlight = document.getElementById(`script-highlight-${pathStr}`);
  if (highlight) highlight.innerHTML = highlightCode(textarea.value, lang);
  updateGutter(path);
}
window.handleScriptInput = handleScriptInput;

export function syncScriptScroll(path) {
  const pathStr = JSON.stringify(path);
  const textarea = document.getElementById(`script-code-${pathStr}`);
  const highlight = document.getElementById(`script-highlight-${pathStr}`);
  const gutter = document.getElementById(`script-gutter-${pathStr}`);
  if (textarea && highlight) {
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }
  if (textarea && gutter) gutter.scrollTop = textarea.scrollTop;
}
window.syncScriptScroll = syncScriptScroll;

export function handleScriptKeydown(e, path) {
  if (e.key === "Tab") {
    e.preventDefault();
    const ta = e.target;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + "    " + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + 4;
    handleScriptInput(path);
  }
}
window.handleScriptKeydown = handleScriptKeydown;

export function updateScriptEditor(path) {
  renderFlow();
}
window.updateScriptEditor = updateScriptEditor;
