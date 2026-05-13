import {
  state,
  SIG_COLORS,
  saveSignals,
  pushUndo,
  uid,
  STEP_TYPES,
  MEDIA_OPTIONS,
} from "./state.js";
import { escHtml, escAttr, showToast, showPrompt, showConfirm } from "./ui.js";
import { Step, StepType, SignalEntry } from "../../src/types/pokepad";

declare global {
  interface HTMLElement {
    _saveTimer?: any;
    _searchInput?: HTMLInputElement;
  }
}

// ── Event delegation para el flow-container ──
export function initFlowDelegation() {
  const panel = document.querySelector(".panel") as HTMLElement | null;
  if (!panel) return;

  panel.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const delBtn = target.closest(".btn-del-step") as HTMLElement | null;
    if (delBtn) {
      deleteStep(JSON.parse(delBtn.dataset.path!));
      return;
    }
    const keyBtn = target.closest(".btn-key-capture") as HTMLElement | null;
    if (keyBtn) {
      startKeyCapture(JSON.parse(keyBtn.dataset.path!));
      return;
    }
    const browseBtn = target.closest(".btn-browse-file") as HTMLElement | null;
    if (browseBtn) {
      browseFile(JSON.parse(browseBtn.dataset.path!));
      return;
    }
    const regionBtn = target.closest(".btn-region-capture") as HTMLElement | null;
    if (regionBtn) {
      startRegionSelection(JSON.parse(regionBtn.dataset.path!));
      return;
    }
    const quickAppBtn = target.closest(".btn-quick-app") as HTMLElement | null;
    if (quickAppBtn) {
      openStepAppSelector(JSON.parse(quickAppBtn.dataset.path!));
      return;
    }
  });

  panel.addEventListener("change", (e) => {
    const target = e.target as any;
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
    const target = e.target as any;
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
      const target = e.target as any;
      if (target.classList.contains("script-textarea")) {
        syncScriptScroll(JSON.parse(target.dataset.path));
      }
    },
    true,
  );

  panel.addEventListener("keydown", (e) => {
    const target = e.target as any;
    if (target.classList.contains("script-textarea")) {
      handleScriptKeydown(e, JSON.parse(target.dataset.path));
    }
  });
}

// ── Save indicator ──
function showSaveIndicator() {
  const el = document.getElementById("save-indicator");
  if (!el) return;
  el.classList.add("visible");
  clearTimeout(el._saveTimer);
  el._saveTimer = setTimeout(() => el.classList.remove("visible"), 1800);
}
document.addEventListener("data-saved", showSaveIndicator);

// ── Keyboard shortcuts (workflow-level) ──
document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  const inInput = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

  if (e.key === "Escape" && target.id === "sig-search") {
    const input = document.getElementById("sig-search") as HTMLInputElement | null;
    if (input?.value) { input.value = ""; renderSignalList(); }
    e.preventDefault();
    return;
  }

  if (inInput) return;

  if (e.key === "Delete" && state.selectedSig) {
    e.preventDefault();
    deleteCurrentSignal();
    return;
  }
  if (e.key === "F2" && state.selectedSig) {
    e.preventDefault();
    renameSignal(state.selectedSig);
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "d" && state.selectedSig) {
    e.preventDefault();
    duplicateSignal(state.selectedSig);
    return;
  }
});

// ── Context Menu Logic ──
let activeContextMenu: HTMLElement | null = null;
let stepClipboard: Step | null = null;

function closeContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}

document.addEventListener("click", (e) => {
  closeContextMenu();
  const target = e.target as HTMLElement;
  if (target.id === "btn-clear-search") {
    const input = document.getElementById("sig-search") as HTMLInputElement | null;
    if (input) { input.value = ""; renderSignalList(); }
  }
});
document.addEventListener("input", (e) => {
  const target = e.target as HTMLElement;
  if (target.id === "sig-search") renderSignalList();
});
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement;
  if (
    !target.closest(".sig-card") &&
    !target.closest(".context-menu") &&
    !target.closest(".step-card") &&
    !target.closest(".sig-folder-header")
  ) {
    closeContextMenu();
  }
});

function showSignalContextMenu(e: MouseEvent, sig: string) {
  e.preventDefault();
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const options = [
    { label: "Duplicar", ico: "👯", action: () => duplicateSignal(sig) },
    { label: "Cambiar nombre", ico: "✏️", action: () => renameSignal(sig) },
    { type: "colorPicker", current: state.signals[sig]?.color, action: (color: string | null) => setSignalColor(sig, color) },
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

  menu.onclick = (ev) => ev.stopPropagation();
  document.body.appendChild(menu);

  positionContextMenu(e, menu);
  activeContextMenu = menu;
}

function showStepContextMenu(e: MouseEvent, path: number[], onEdit: (() => void) | null = null) {
  e.preventDefault();
  e.stopPropagation();
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const options: any[] = [];

  // If there's selected text, add a copy option
  const selectedText = window.getSelection()?.toString();
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

  menu.onclick = (ev) => ev.stopPropagation();
  document.body.appendChild(menu);

  positionContextMenu(e, menu);
  activeContextMenu = menu;
}

function renderContextMenuOptions(menu: HTMLElement, options: any[]) {
  options.forEach((opt) => {
    if (opt.type === "divider") {
      const div = document.createElement("div");
      div.className = "context-menu-divider";
      menu.appendChild(div);
      return;
    }
    if (opt.type === "colorPicker") {
      const row = document.createElement("div");
      row.className = "context-menu-color-row";
      SIG_COLORS.forEach(color => {
        const swatch = document.createElement("button");
        swatch.className = "color-swatch" + (opt.current === color ? " active" : "");
        swatch.style.background = color;
        swatch.title = color;
        swatch.onclick = () => { opt.action(color); closeContextMenu(); };
        row.appendChild(swatch);
      });
      const clearBtn = document.createElement("button");
      clearBtn.className = "color-swatch color-swatch-clear";
      clearBtn.title = "Sin color";
      clearBtn.textContent = "×";
      clearBtn.onclick = () => { opt.action(null); closeContextMenu(); };
      row.appendChild(clearBtn);
      menu.appendChild(row);
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

function positionContextMenu(e: MouseEvent, menu: HTMLElement) {
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

export function copyStep(path: number[]) {
  const step = getStepByPath(path);
  if (step) {
    stepClipboard = JSON.parse(JSON.stringify(step));
    showToast(
      "Paso copiado",
      `"${STEP_TYPES[step.type]?.label || step.type}" al portapapeles`,
    );
  }
}

export function pasteStep(path: number[], after = true) {
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

  const updateIds = (s: any) => {
    if (s.params?.steps) {
      s.params.steps.forEach((sub: any) => {
        sub.id = uid();
        updateIds(sub);
      });
    }
  };
  updateIds(stepCopy);

  let targetSteps: Step[];
  if (parentPath.length === 0) {
    targetSteps = state.signals[state.selectedSig!].steps;
  } else {
    const parent = getStepByPath(parentPath);
    targetSteps = parent!.params.steps;
  }

  targetSteps.splice(newIndex, 0, stepCopy);
  saveSignals();
  renderFlow();
  showToast("Pegado", "Paso insertado correctamente");
}

export function duplicateStep(path: number[]) {
  const step = getStepByPath(path);
  if (!step) return;

  pushUndo();
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];

  const stepCopy = JSON.parse(JSON.stringify(step));
  stepCopy.id = uid();
  const updateIds = (s: any) => {
    if (s.params?.steps) {
      s.params.steps.forEach((sub: any) => {
        sub.id = uid();
        updateIds(sub);
      });
    }
  };
  updateIds(stepCopy);

  let targetSteps: Step[];
  if (parentPath.length === 0) {
    targetSteps = state.signals[state.selectedSig!].steps;
  } else {
    const parent = getStepByPath(parentPath);
    targetSteps = parent!.params.steps;
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

  // 1. Get sorted signal keys
  const criteria = state.config.workflowSort || "original";
  let sigKeys = Object.keys(state.signals);

  if (criteria === "name") {
    sigKeys.sort((a, b) => a.localeCompare(b));
  } else if (criteria === "active") {
    sigKeys.sort((a, b) => {
      const aAssigned = state.signals[a].assignedToButton;
      const bAssigned = state.signals[b].assignedToButton;
      const aAct = (Array.isArray(aAssigned) ? aAssigned.length : aAssigned ? 1 : 0) > 0;
      const bAct = (Array.isArray(bAssigned) ? bAssigned.length : bAssigned ? 1 : 0) > 0;
      if (aAct === bAct) return a.localeCompare(b);
      return aAct ? -1 : 1;
    });
  } else if (criteria === "created") {
    sigKeys.sort((a, b) => (state.signals[b].createdAt || 0) - (state.signals[a].createdAt || 0));
  } else if (criteria === "steps") {
    sigKeys.sort((a, b) => countSteps(state.signals[b].steps) - countSteps(state.signals[a].steps));
  }

  // 2. Apply search filter
  const searchInput = document.getElementById("sig-search") as HTMLInputElement | null;
  const searchTerm = (searchInput?.value || "").trim().toLowerCase();
  const isSearching = searchTerm.length > 0;
  if (isSearching) {
    sigKeys = sigKeys.filter(k =>
      k.toLowerCase().includes(searchTerm) ||
      (state.signals[k].label || "").toLowerCase().includes(searchTerm)
    );
  }

  // 3. Map signals to folders and root
  const rootKeys = sigKeys.filter(k => {
    const fId = state.signals[k].folderId;
    return !fId || !state.folders.find(f => f.id === fId);
  });

  // 4. Render items with bars
  list.appendChild(makeWorkflowInsertionBar(null, state.folders[0]?.id || rootKeys[0]));

  let renderedCount = rootKeys.length;

  state.folders.forEach((folder, i) => {
    const folderKeys = sigKeys.filter(k => state.signals[k].folderId === folder.id);

    // When searching, skip folders with no matching children
    if (isSearching && folderKeys.length === 0) return;

    renderedCount += folderKeys.length;
    const isExpanded = isSearching ? true : folder.expanded;

    const fDiv = document.createElement("div");
    fDiv.className = "sig-folder" + (isExpanded ? " expanded" : "");
    fDiv.dataset.id = folder.id;

    const fHeader = document.createElement("div");
    fHeader.className = "sig-folder-header";
    if (folder.color) {
      fHeader.style.background = folder.color + "22";
      fHeader.style.borderLeft = `3px solid ${folder.color}`;
      fHeader.style.paddingLeft = "5px";
      fHeader.style.borderRadius = "6px";
    }

    const dragHandle = document.createElement("span");
    dragHandle.className = "sig-folder-drag-handle";
    dragHandle.title = "Arrastrar para reordenar carpeta";
    dragHandle.textContent = "⠿";
    dragHandle.draggable = true;

    fHeader.innerHTML = `
      <span class="sig-folder-chevron">▶</span>
      <span class="sig-folder-name">${escHtml(folder.name)}</span>
      <span class="sig-folder-count">${folderKeys.length}</span>
    `;
    fHeader.insertBefore(dragHandle, fHeader.firstChild);

    fHeader.onclick = (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".sig-folder-drag-handle")) toggleFolder(folder.id);
    };
    fHeader.oncontextmenu = (e) => showFolderContextMenu(e, folder.id);

    // Drag handle events for folder reordering
    dragHandle.addEventListener("dragstart", (e) => {
      state.dragSrcFolder = folder.id;
      fDiv.classList.add("dragging");
      document.getElementById("signal-list")?.classList.add("is-dragging");
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      e.stopPropagation();
    });
    dragHandle.addEventListener("dragend", () => {
      fDiv.classList.remove("dragging");
      state.dragSrcFolder = null;
      document.getElementById("signal-list")?.classList.remove("is-dragging");
      document.querySelectorAll(".sig-insertion-bar, .sig-folder").forEach(el => el.classList.remove("drag-over"));
    });

    // Folder Drag & Drop target (whole folder header) — accepts workflow drops only
    fHeader.addEventListener("dragover", (e) => {
      if (state.dragSrcWorkflow) {
        e.preventDefault();
        fDiv.classList.add("drag-over");
      }
    });
    fHeader.addEventListener("dragleave", () => {
      if (!state.dragSrcFolder) fDiv.classList.remove("drag-over");
    });
    fHeader.addEventListener("drop", (e) => {
      e.preventDefault();
      fDiv.classList.remove("drag-over");
      if (state.dragSrcWorkflow) {
        moveWorkflow(state.dragSrcWorkflow, folder.id);
        state.dragSrcWorkflow = null;
      }
    });

    const fContent = document.createElement("div");
    fContent.className = "sig-folder-content";

    fContent.appendChild(makeWorkflowInsertionBar(folder.id, folderKeys[0]));
    folderKeys.forEach((sig, j) => {
      fContent.appendChild(makeSignalCard(sig, state.signals[sig]));
      fContent.appendChild(makeWorkflowInsertionBar(folder.id, folderKeys[j + 1]));
    });

    fDiv.appendChild(fHeader);
    fDiv.appendChild(fContent);
    list.appendChild(fDiv);

    // Bar after folder — also accepts folder drops (insert after this folder = index i+1)
    const nextItem = state.folders[i + 1]?.id || rootKeys[0];
    list.appendChild(makeWorkflowInsertionBar(null, nextItem, i + 1));
  });

  rootKeys.forEach((sig, i) => {
    list.appendChild(makeSignalCard(sig, state.signals[sig]));
    list.appendChild(makeWorkflowInsertionBar(null, rootKeys[i + 1]));
  });

  // Empty search state
  if (isSearching && renderedCount === 0) {
    const empty = document.createElement("div");
    empty.className = "sig-search-empty";
    empty.innerHTML = `Sin resultados para "<strong>${escHtml(searchTerm)}</strong>"`;
    list.appendChild(empty);
    return;
  }

  // Empty list state (no workflows at all)
  if (!isSearching && Object.keys(state.signals).length === 0 && state.folders.length === 0) {
    const empty = document.createElement("div");
    empty.className = "sig-list-empty";
    empty.innerHTML = `
      <div class="sig-list-empty-icon">⚡</div>
      <div>Sin workflows todavía</div>
      <button class="btn-list-create" onclick="document.getElementById('new-sig-cfg').focus()">Crear el primero →</button>
    `;
    list.appendChild(empty);
  }
}

function makeWorkflowInsertionBar(folderId: string | null, targetSig: string | null = null, targetFolderIdx: number | null = null) {
  const bar = document.createElement("div");
  bar.className = "sig-insertion-bar";
  bar.innerHTML = '<div class="sig-insertion-line"></div>';

  bar.addEventListener("dragover", (e) => {
    if (state.dragSrcWorkflow || (state.dragSrcFolder && targetFolderIdx !== null)) {
      e.preventDefault();
      bar.classList.add("drag-over");
    }
  });
  bar.addEventListener("dragleave", () => bar.classList.remove("drag-over"));
  bar.addEventListener("drop", (e) => {
    e.preventDefault();
    bar.classList.remove("drag-over");
    if (state.dragSrcFolder && targetFolderIdx !== null) {
      moveFolderItem(state.dragSrcFolder, targetFolderIdx);
      state.dragSrcFolder = null;
    } else if (state.dragSrcWorkflow) {
      moveWorkflow(state.dragSrcWorkflow, folderId, targetSig);
      state.dragSrcWorkflow = null;
    }
  });
  return bar;
}

function moveWorkflow(sigName: string, folderId: string | null, targetSig: string | null = null) {
  if (sigName === targetSig) return;
  const sig = state.signals[sigName];
  if (!sig) return;

  pushUndo();
  sig.folderId = folderId;

  // Manual reordering logic (only if "original")
  if (state.config.workflowSort === "original") {
    const keys = Object.keys(state.signals).filter(k => k !== sigName);
    if (targetSig) {
      const idx = keys.indexOf(targetSig);
      if (idx !== -1) {
        keys.splice(idx, 0, sigName);
      } else {
        keys.push(sigName);
      }
    } else {
      keys.push(sigName);
    }
    
    const newSignals: any = {};
    keys.forEach(k => newSignals[k] = state.signals[k]);
    state.signals = newSignals;
  }

  saveSignals();
  renderSignalList();
}

function moveFolderItem(srcFolderId: string, targetIdx: number) {
  const srcIdx = state.folders.findIndex(f => f.id === srcFolderId);
  if (srcIdx === -1 || srcIdx === targetIdx) return;

  const folders = [...state.folders];
  const [folder] = folders.splice(srcIdx, 1);
  // Adjust targetIdx if we removed from before it
  const insertAt = targetIdx > srcIdx ? targetIdx - 1 : targetIdx;
  folders.splice(insertAt, 0, folder);
  state.folders = folders;

  // Switch to manual order so drag result is preserved
  if (state.config.workflowSort !== "original") {
    state.config.workflowSort = "original";
    const sortSel = document.getElementById("sort-workflows") as HTMLSelectElement | null;
    if (sortSel) sortSel.value = "original";
  }

  saveSignals();
  renderSignalList();
}

function makeSignalCard(sig: string, entry: SignalEntry) {
  const div = document.createElement("div");
  div.className = "sig-card" + (sig === state.selectedSig ? " active" : "");
  div.dataset.sig = sig;
  div.draggable = true;

  if (entry.color) {
    div.style.borderLeftColor = entry.color;
    div.style.borderLeftWidth = "3px";
  }

  let badge = "";
  const assigned = entry.assignedToButton;
  if (assigned && (Array.isArray(assigned) ? assigned.length : true)) {
    const speeds = Array.isArray(assigned) ? assigned : [assigned as string];
    const label = speeds
      .map((s) => (s === "RAPIDA" ? "RÁP" : s === "MEDIA" ? "MED" : "LEN"))
      .join("+");
    badge = `<span class="sig-assigned-badge" title="Asignado a toque ${speeds.join(", ").toLowerCase()}">🔌 ${label}</span>`;
  }

  const steps = countSteps(entry.steps);
  const appName = entry.assignedApp ? entry.assignedApp.replace(/\.exe$/i, "") : null;
  const runCount = entry.runCount || 0;

  div.innerHTML = `
    <div class="sig-card-top">
      <span class="sig-name">${escHtml(sig)}${badge}</span>
      ${appName ? `<span class="sig-app-badge" title="Solo activo con: ${escAttr(entry.assignedApp || "")}">📌 ${escHtml(appName)}</span>` : ""}
      <span class="sig-pulse"></span>
    </div>
    ${entry.label ? `<div class="sig-label">${escHtml(entry.label)}</div>` : ""}
    <div class="sig-card-meta">
      <span class="sig-steps-count">${steps} paso${steps === 1 ? "" : "s"}</span>
      ${runCount > 0 ? `<span class="sig-run-count" title="Veces ejecutado">▶ ${runCount}</span>` : ""}
    </div>`;

  div.addEventListener("click", () => selectSignal(sig));
  div.addEventListener("contextmenu", (e) => showSignalContextMenu(e, sig));

  // Drag & Drop for workflows
  div.addEventListener("dragstart", (e) => {
    state.dragSrcWorkflow = sig;
    div.classList.add("dragging");
    document.getElementById("signal-list")?.classList.add("is-dragging");
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  });
  div.addEventListener("dragend", () => {
    div.classList.remove("dragging");
    state.dragSrcWorkflow = null;
    document.getElementById("signal-list")?.classList.remove("is-dragging");
    // Clear any leftover drag-over classes
    document.querySelectorAll(".sig-insertion-bar, .sig-folder").forEach(el => el.classList.remove("drag-over"));
  });

  return div;
}

function countSteps(steps: Step[] | undefined): number {
  if (!steps) return 0;
  let count = steps.length;
  steps.forEach((s) => {
    if (s.params?.steps) count += countSteps(s.params.steps);
  });
  return count;
}

// Update only the meta row of a card without re-rendering the whole list
export function updateCardMeta(sig: string, entry: SignalEntry) {
  const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(sig)}"]`) as HTMLElement | null;
  if (!card) return;

  const steps = countSteps(entry.steps);
  const appName = entry.assignedApp ? entry.assignedApp.replace(/\.exe$/i, "") : null;
  const runCount = entry.runCount || 0;

  const meta = card.querySelector(".sig-card-meta");
  if (meta) {
    meta.innerHTML = `
      <span class="sig-steps-count">${steps} paso${steps === 1 ? "" : "s"}</span>
      ${runCount > 0 ? `<span class="sig-run-count" title="Veces ejecutado">▶ ${runCount}</span>` : ""}`;
  }

  // Update app badge in the top row
  const top = card.querySelector(".sig-card-top") as HTMLElement | null;
  if (top) {
    let appBadge = top.querySelector(".sig-app-badge") as HTMLElement | null;
    if (appName) {
      if (!appBadge) {
        appBadge = document.createElement("span");
        appBadge.className = "sig-app-badge";
        top.insertBefore(appBadge, top.querySelector(".sig-pulse"));
      }
      appBadge.title = `Solo activo con: ${entry.assignedApp}`;
      appBadge.textContent = `📌 ${appName}`;
    } else if (appBadge) {
      appBadge.remove();
    }
  }
}

// ── Global Variables — Type System ──

const GV_TYPES: Record<string, { label: string, cls: string }> = {
  string: { label: "str",   cls: "gvt-string" },
  int:    { label: "int",   cls: "gvt-int"    },
  float:  { label: "float", cls: "gvt-float"  },
  bool:   { label: "bool",  cls: "gvt-bool"   },
  list:   { label: "list",  cls: "gvt-list"   },
  json:   { label: "json",  cls: "gvt-json"   },
};

function inferType(val: any): string {
  if (typeof val === "boolean") return "bool";
  if (Array.isArray(val)) return "list";
  if (val !== null && typeof val === "object") return "json";
  if (typeof val === "number") return Number.isInteger(val) ? "int" : "float";
  if (typeof val !== "string") return "string";
  const s = val.trim();
  if (s === "true" || s === "false") return "bool";
  if (/^-?\d+$/.test(s)) return "int";
  if (/^-?\d+\.\d*$/.test(s) || /^-?\d*\.\d+$/.test(s)) return "float";
  if (s.startsWith("[")) { try { if (Array.isArray(JSON.parse(s))) return "list"; } catch {} }
  if (s.startsWith("{")) { try { if (typeof JSON.parse(s) === "object") return "json"; } catch {} }
  return "string";
}

function coerceToType(raw: any, type: string): any {
  const s = String(raw).trim();
  switch (type) {
    case "int":   { const n = parseInt(s, 10);   return isNaN(n) ? 0 : n; }
    case "float": { const n = parseFloat(s);     return isNaN(n) ? 0.0 : n; }
    case "bool":  return s === "true" || s === "1" || s === "yes";
    case "list": {
      try { const p = JSON.parse(s); if (Array.isArray(p)) return p; } catch {}
      return s ? s.split(",").map(x => x.trim()).filter(Boolean) : [];
    }
    case "json": {
      try { return JSON.parse(s); } catch {}
      return {};
    }
    default: return s;
  }
}

function valueForEdit(val: any): string {
  if (Array.isArray(val) || (val !== null && typeof val === "object")) return JSON.stringify(val);
  return String(val ?? "");
}

// ── Global Variables Panel ──

export function openGlobalVarsModal() {
  const modal = document.getElementById("global-vars-modal");
  if (!modal) return;
  modal.classList.remove("d-none");

  const nameInp = document.getElementById("gv-new-name") as HTMLInputElement;
  const valInp  = document.getElementById("gv-new-value") as HTMLInputElement;
  const typeSel = document.getElementById("gv-new-type") as HTMLSelectElement | null;
  nameInp.value = "";
  valInp.value  = "";
  if (typeSel) typeSel.value = "string";
  setTimeout(() => nameInp.focus(), 50);

  if (typeSel) {
    valInp.oninput = () => { typeSel.value = inferType(valInp.value); };
  }

  const closeBtn = document.getElementById("btn-gv-close");
  if (closeBtn) closeBtn.onclick = () => modal.classList.add("d-none");
  const addBtn = document.getElementById("btn-gv-add");
  if (addBtn) addBtn.onclick = () => addGlobalVar();

  nameInp.onkeydown = valInp.onkeydown = (e) => {
    if (e.key === "Enter") addGlobalVar();
    if (e.key === "Escape") modal.classList.add("d-none");
  };
}

function addGlobalVar() {
  const nameInp = document.getElementById("gv-new-name") as HTMLInputElement;
  const valInp  = document.getElementById("gv-new-value") as HTMLInputElement;
  const typeSel = document.getElementById("gv-new-type") as HTMLSelectElement | null;
  const name = nameInp.value.trim().replace(/\s+/g, "_");
  if (!name) { nameInp.focus(); return; }

  state.globalVariables[name] = coerceToType(valInp.value, typeSel?.value || inferType(valInp.value));
  saveSignals();
  nameInp.value = "";
  valInp.value  = "";
  if (typeSel) typeSel.value = "string";
  nameInp.focus();
  renderGlobalVarsSection();
  renderFlow();
}

export function renderGlobalVarsSection() {
  const list = document.getElementById("sb-gv-list");
  if (!list) return;
  list.innerHTML = "";

  const entries = Object.entries(state.globalVariables);
  if (entries.length === 0) {
    list.innerHTML = '<div class="gv-empty">Sin variables definidas.</div>';
    return;
  }

  entries.forEach(([name, value]) => {
    const type = inferType(value);
    const meta = GV_TYPES[type] || GV_TYPES.string;
    const displayVal = Array.isArray(value)
      ? `[${value.length} items]`
      : (value !== null && typeof value === "object")
        ? JSON.stringify(value)
        : String(value ?? "");

    const row = document.createElement("div");
    row.className = "sb-gv-row";
    row.dataset.name = name;

    row.innerHTML = `
      <div class="sb-gv-info">
        <div class="sb-gv-name-row">
          <span class="sb-gv-name">$${escHtml(name)}</span>
          <span class="gv-type-badge ${meta.cls}">${meta.label}</span>
        </div>
        <span class="sb-gv-value">${escHtml(displayVal)}</span>
      </div>
      <div class="sb-gv-actions">
        <button class="btn-icon sb-gv-edit" title="Editar">✎</button>
        <button class="btn-icon gv-del sb-gv-del" title="Eliminar">✕</button>
      </div>`;

    row.querySelector(".sb-gv-edit")?.addEventListener("click", () => openGvEditModal(name, value));

    row.querySelector(".sb-gv-del")?.addEventListener("click", () => {
      delete state.globalVariables[name];
      saveSignals();
      renderGlobalVarsSection();
      renderFlow();
    });

    list.appendChild(row);
  });
}

function openGvEditModal(oldName: string, oldValue: any) {
  const modal = document.getElementById("gv-edit-modal");
  if (!modal) return;

  const nameInp = document.getElementById("gv-edit-name") as HTMLInputElement;
  const valInp  = document.getElementById("gv-edit-value") as HTMLInputElement;
  const typeSel = document.getElementById("gv-edit-type") as HTMLSelectElement;

  nameInp.value = oldName;
  valInp.value  = valueForEdit(oldValue);
  typeSel.value = inferType(oldValue);
  modal.classList.remove("d-none");
  setTimeout(() => nameInp.focus(), 50);

  valInp.oninput = () => { typeSel.value = inferType(valInp.value); };

  const close = () => modal.classList.add("d-none");

  const save = () => {
    const newName = nameInp.value.trim().replace(/\s+/g, "_");
    if (!newName) { nameInp.focus(); return; }
    if (newName !== oldName) {
      delete state.globalVariables[oldName];
      Object.values(state.signals).forEach(sig => {
        if (sig.steps) renameVarInSteps(sig.steps, oldName, newName);
      });
    }
    state.globalVariables[newName] = coerceToType(valInp.value, typeSel.value);
    saveSignals();
    renderGlobalVarsSection();
    renderFlow();
    close();
  };

  const saveBtn = document.getElementById("btn-gv-edit-save");
  if (saveBtn) saveBtn.onclick = save;
  const cancelBtn = document.getElementById("btn-gv-edit-cancel");
  if (cancelBtn) cancelBtn.onclick = close;
  nameInp.onkeydown = valInp.onkeydown = (e) => {
    if (e.key === "Enter") save();
    if (e.key === "Escape") close();
  };
}

(window as any).openGlobalVarsModal = openGlobalVarsModal;

export function addFolder() {
  showPrompt("Nombre de la nueva carpeta", "", (name) => {
    if (!name) return;
    const folder = {
      id: uid(),
      name: name.trim(),
      expanded: true,
      color: null
    };
    state.folders.push(folder);
    saveSignals();
    renderSignalList();
  });
}
(window as any).addFolder = addFolder;

function toggleFolder(id: string) {
  const folder = state.folders.find(f => f.id === id);
  if (folder) {
    folder.expanded = !folder.expanded;
    saveSignals();
    renderSignalList();
  }
}

function showFolderContextMenu(e: MouseEvent, id: string) {
  e.preventDefault();
  e.stopPropagation();
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  const folder = state.folders.find(f => f.id === id);
  const options = [
    { label: "Clonar carpeta", ico: "👯", action: () => cloneFolder(id) },
    { label: "Copiar JSON", ico: "📋", action: () => copyFolderToClipboard(id) },
    { label: "Exportar archivo", ico: "📦", action: () => exportFolder(id) },
    { type: "divider" },
    { label: "Color", ico: "🎨", type: "colorPicker", current: folder?.color, action: (color: string | null) => setFolderColor(id, color) },
    { type: "divider" },
    { label: "Renombrar", ico: "✏️", action: () => renameFolder(id) },
    { type: "divider" },
    { label: "Eliminar carpeta", ico: "🗂️", action: () => deleteFolder(id) },
    { label: "Eliminar carpeta y workflows", ico: "✕", action: () => deleteFolderWithContents(id) },
  ];

  renderContextMenuOptions(menu, options);
  menu.onclick = (ev) => ev.stopPropagation();
  document.body.appendChild(menu);
  positionContextMenu(e, menu);
  activeContextMenu = menu;
}

function renameFolder(id: string) {
  const folder = state.folders.find(f => f.id === id);
  if (!folder) return;

  showPrompt("Renombrar carpeta", folder.name, (newName) => {
    if (!newName) return;
    folder.name = newName.trim();
    saveSignals();
    renderSignalList();
  });
}

function deleteFolder(id: string) {
  const folder = state.folders.find(f => f.id === id);
  if (!folder) return;

  Object.values(state.signals).forEach(sig => {
    if (sig.folderId === id) sig.folderId = null;
  });

  state.folders = state.folders.filter(f => f.id !== id);
  saveSignals();
  renderSignalList();
  showToast("Carpeta eliminada", "Los workflows se movieron a la raíz");
}

function deleteFolderWithContents(id: string) {
  const folder = state.folders.find(f => f.id === id);
  if (!folder) return;

  const folderKeys = Object.keys(state.signals).filter(k => state.signals[k].folderId === id);
  if (folderKeys.length === 0) {
    deleteFolder(id);
    return;
  }

  const confirmed = window.confirm(`¿Eliminar la carpeta "${folder.name}" y sus ${folderKeys.length} workflow(s)? Esta acción no se puede deshacer.`);
  if (!confirmed) return;

  pushUndo();
  folderKeys.forEach(k => delete state.signals[k]);
  state.folders = state.folders.filter(f => f.id !== id);

  if (state.selectedSig && folderKeys.includes(state.selectedSig)) {
    state.selectedSig = null;
    document.getElementById("se-empty")?.classList.remove("d-none");
    document.getElementById("se-content")?.classList.add("d-none");
  }

  saveSignals();
  renderSignalList();
  showToast("Carpeta eliminada", `Se eliminaron ${folderKeys.length} workflow(s)`);
}

function cloneFolder(id: string) {
  const folder = state.folders.find(f => f.id === id);
  if (!folder) return;

  pushUndo();

  const newFolderId = uid();
  let newName = folder.name + " (Copia)";
  let i = 1;
  while (state.folders.find(f => f.name === newName)) {
    newName = `${folder.name} (Copia ${i})`;
    i++;
  }

  const newFolder = { id: newFolderId, name: newName, expanded: true, color: folder.color };
  const folderIdx = state.folders.findIndex(f => f.id === id);
  state.folders.splice(folderIdx + 1, 0, newFolder);

  const folderKeys = Object.keys(state.signals).filter(k => state.signals[k].folderId === id);
  const insertAfterKey = folderKeys[folderKeys.length - 1] || null;

  const baseCount = Object.keys(state.signals).length;
  const clonedKeys = folderKeys.map((k, mapIdx) => {
    const original = state.signals[k];
    let newKey = k + "_COPY";
    let j = 1;
    while (state.signals[newKey]) {
      newKey = `${k}_COPY_${j}`;
      j++;
    }

    const cloned = JSON.parse(JSON.stringify(original));
    cloned.folderId = newFolderId;
    cloned.assignedToButton = [];
    cloned.assignedApp = null;
    cloned.createdAt = Date.now();
    cloned.color = SIG_COLORS[(baseCount + mapIdx) % SIG_COLORS.length];
    if (cloned.label) cloned.label += " (Copia)";
    return { newKey, cloned };
  });

  if (insertAfterKey) {
    const allKeys = Object.keys(state.signals);
    const insertIdx = allKeys.indexOf(insertAfterKey) + 1;
    const newSignals: any = {};
    allKeys.forEach((k, idx) => {
      newSignals[k] = state.signals[k];
      if (idx === insertIdx - 1) {
        clonedKeys.forEach(({ newKey, cloned }) => { newSignals[newKey] = cloned; });
      }
    });
    state.signals = newSignals;
  } else {
    clonedKeys.forEach(({ newKey, cloned }) => { state.signals[newKey] = cloned; });
  }

  saveSignals();
  renderSignalList();
  showToast("Carpeta clonada", `"${newName}" creada con ${clonedKeys.length} workflow(s)`);
}

async function copyFolderToClipboard(id: string) {
  const folder = state.folders.find(f => f.id === id);
  if (!folder) return;

  const workflows: any = {};
  Object.entries(state.signals).forEach(([k, v]) => {
    if (v.folderId === id) workflows[k] = v;
  });

  const payload = JSON.stringify(
    { version: "1.0", type: "folder", name: folder.name, workflows },
    null,
    2,
  );
  try {
    await navigator.clipboard.writeText(payload);
    showToast("Copiado", `JSON de la carpeta "${folder.name}" copiado al portapapeles`);
  } catch {
    showToast("Error", "No se pudo copiar al portapapeles");
  }
}

async function exportFolder(id: string) {
  const folder = state.folders.find(f => f.id === id);
  if (!folder) return;

  const workflows: any = {};
  Object.entries(state.signals).forEach(([k, v]) => {
    if (v.folderId === id) workflows[k] = v;
  });

  const result = await window.arduino.exportFolder(folder.name, workflows);
  if (result.ok) {
    showToast("Exportado", `Carpeta guardada en:\n${result.path}`);
  } else if (result.error !== "Cancelled") {
    showToast("Error", `No se pudo exportar: ${result.error}`);
  }
}

function setSignalColor(sig: string, color: string | null) {
  const signal = state.signals[sig];
  if (!signal) return;
  if (color) {
    signal.color = color;
  } else {
    const idx = Object.keys(state.signals).indexOf(sig);
    signal.color = SIG_COLORS[Math.max(0, idx) % SIG_COLORS.length];
  }
  saveSignals();
  renderSignalList();
}

function setFolderColor(id: string, color: string | null) {
  const folder = state.folders.find(f => f.id === id);
  if (!folder) return;
  folder.color = color;
  saveSignals();
  renderSignalList();
}

export function changeSort(criteria: string) {
  state.config.workflowSort = criteria as any;
  saveSignals(); // Also saves config
  renderSignalList();
}
(window as any).changeSort = changeSort;

export function addSignal() {
  showPrompt("Nuevo Workflow", "", (raw) => {
    if (!raw) return;
    const sig = raw.trim().toUpperCase().replace(/\s+/g, "_");
    if (!sig) return;
    if (state.signals[sig]) {
      showToast("Ya existe", `"${sig}" ya está`);
      return;
    }
    pushUndo();
    const color = SIG_COLORS[Object.keys(state.signals).length % SIG_COLORS.length];
    state.signals[sig] = {
      label: "",
      color,
      steps: [],
      assignedToButton: [],
      folderId: null,
      createdAt: Date.now(),
      runCount: 0,
      assignedApp: null,
    };
    saveSignals();
    renderSignalList();
    selectSignal(sig);
    setTimeout(() => {
      const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(sig)}"]`);
      if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  });
}
(window as any).addSignal = addSignal;

export function renameSignal(oldName: string) {
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

    const newSignals: any = {};
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
(window as any).renameSignal = renameSignal;

export function duplicateSignal(sig: string) {
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
  state.signals[newName].color = SIG_COLORS[Object.keys(state.signals).length % SIG_COLORS.length];
  if (state.signals[newName].label) {
    state.signals[newName].label += " (Copia)";
  }

  saveSignals();
  renderSignalList();
  showToast("Duplicado", `Workflow "${sig}" duplicado como "${newName}"`);
}
(window as any).duplicateSignal = duplicateSignal;

export async function copySignalToClipboard(sig: string) {
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
(window as any).copySignalToClipboard = copySignalToClipboard;

export async function exportSingleWorkflow(sig: string) {
  const data = state.signals[sig];
  if (!data) return;

  const result = await window.arduino.exportSingleWorkflow(sig, data);
  if (result.ok) {
    showToast("Exportado", `Workflow guardado en:\n${result.path}`);
  } else if (result.error !== "Cancelled") {
    showToast("Error", `No se pudo exportar: ${result.error}`);
  }
}
(window as any).exportSingleWorkflow = exportSingleWorkflow;

export async function importWorkflow(e: MouseEvent) {
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

  menu.onclick = (ev) => ev.stopPropagation();
  document.body.appendChild(menu);

  // Position near the event (if available) or center
  let x = e ? e.clientX : window.innerWidth / 2;
  let y = e ? e.clientY : window.innerHeight / 2;

  if (x + 160 > window.innerWidth) x -= 160;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  activeContextMenu = menu;
}
(window as any).importWorkflow = importWorkflow;

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

function addImportedWorkflow(name: string, data: any) {
  let finalName = name.toUpperCase().replace(/\s+/g, "_");
  if (state.signals[finalName]) {
    let i = 1;
    while (state.signals[`${finalName}_${i}`]) i++;
    finalName = `${finalName}_${i}`;
  }

  pushUndo();
  state.signals[finalName] = data;
  state.signals[finalName].assignedToButton = [];
  saveSignals();
  renderSignalList();
  selectSignal(finalName);
  showToast("Importado", `Workflow "${finalName}" agregado correctamente.`);
}

export function deleteCurrentSignal() {
  if (!state.selectedSig) return;
  const sigName = state.selectedSig;
  showConfirm(
    "Eliminar workflow",
    `¿Eliminás "${sigName}"? Podés deshacer con Ctrl+Z.`,
    () => {
      pushUndo();
      delete state.signals[sigName];
      state.selectedSig = null;
      saveSignals();
      renderSignalList();
      const empty = document.getElementById("se-empty");
      const content = document.getElementById("se-content");
      if (empty) empty.classList.remove("d-none");
      if (content) content.classList.add("d-none");
      showToast("Eliminado", `Workflow "${sigName}" eliminado.`);
    },
    "Eliminar"
  );
}
(window as any).deleteCurrentSignal = deleteCurrentSignal;

export function updateSignalLabel(val: string) {
  if (!state.selectedSig) return;
  state.signals[state.selectedSig].label = val;
  saveSignals();
  const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(state.selectedSig)}"]`);
  if (card) {
    const lbl = card.querySelector(".sig-label");
    if (lbl) lbl.textContent = val;
  }
}
(window as any).updateSignalLabel = updateSignalLabel;

let isRefreshingApps = false;
export async function refreshRunningApps(): Promise<string[]> {
  if (isRefreshingApps) return state.runningApps;
  isRefreshingApps = true;
  try {
    const apps = await window.arduino.listRunningApps();
    state.runningApps = apps;
    return apps;
  } catch (err) {
    console.error("Error refreshing apps:", err);
    return [];
  } finally {
    isRefreshingApps = false;
  }
}
(window as any).refreshRunningApps = refreshRunningApps;

export function selectSignal(sig: string) {
  state.selectedSig = sig;
  document
    .querySelectorAll(".sig-card")
    .forEach((c) => {
      const card = c as HTMLElement;
      card.classList.toggle("active", card.dataset.sig === sig);
    });
  const empty = document.getElementById("se-empty");
  const content = document.getElementById("se-content");
  if (empty) empty.classList.add("d-none");
  if (content) content.classList.remove("d-none");
  const tag = document.getElementById("se-signal-tag");
  if (tag) tag.textContent = sig;
  const labelInput = document.getElementById("se-label-input") as HTMLInputElement | null;
  if (labelInput) labelInput.value = state.signals[sig]?.label || "";
  updateAssignButtonUI();
  renderFlow();

  // Background refresh of apps list when selecting a workflow
  refreshRunningApps();
}
(window as any).selectSignal = selectSignal;

export function toggleAssignMenu(e: MouseEvent) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById("assign-dropdown");
  if (!dropdown) return;
  dropdown.classList.toggle("show");

  document.getElementById("step-menu")?.classList.remove("open");
}
(window as any).toggleAssignMenu = toggleAssignMenu;

export function initAssignDropdown() {
  document
    .querySelectorAll("#assign-dropdown .dropdown-item")
    .forEach((itemEl) => {
      const item = itemEl as HTMLElement;
      if (item.id === "item-assign-app") {
        item.onclick = (e) => {
          e.stopPropagation();
          assignApp();
        };
      } else {
        item.onclick = (e) => {
          e.stopPropagation();
          if (item.dataset.speed) assignSpeed(item.dataset.speed);
        };
      }
    });
}

export async function assignApp() {
  if (!state.selectedSig) return;
  const sigName = state.selectedSig;
  const sig = state.signals[sigName];
  const modal = document.getElementById("app-assign-modal");
  const list = document.getElementById("assign-apps-list");
  const searchInp = document.getElementById("assign-app-search") as HTMLInputElement | null;
  const tabRunning = document.getElementById("tab-assign-running");
  const tabInstalled = document.getElementById("tab-assign-installed");
  const titleLbl = document.getElementById("assign-app-list-title");
  if (!modal || !list || !searchInp) return;

  let currentTab = "running";
  let installedApps: any[] = [];
  let filterText = "";

  const save = (appName: string | null) => {
    pushUndo();
    sig.assignedApp = appName || null;
    saveSignals();
    updateAssignButtonUI();
    renderSignalList();
    modal.classList.add("d-none");
    if (appName) showToast("App vinculada", appName);
  };

  const renderList = () => {
    const source = currentTab === "running" ? (state.runningApps || []) : installedApps;
    const q = filterText.toLowerCase();
    const filtered = source.filter(a => {
      const name = typeof a === "string" ? a : a.name;
      return !q || name.toLowerCase().includes(q);
    });

    if (titleLbl) titleLbl.textContent = currentTab === "running" ? "Apps abiertas actualmente" : "Aplicaciones instaladas";
    list.innerHTML = "";

    if (filtered.length === 0) {
      list.innerHTML = '<div class="loading-apps">No se encontraron aplicaciones.</div>';
      return;
    }

    filtered.forEach(a => {
      const appName = typeof a === "string" ? a : a.name;
      const item = document.createElement("div");
      item.className = "app-item" + (appName === sig.assignedApp ? " selected" : "");
      item.innerHTML = `<span>${currentTab === "running" ? "▶" : "🚀"}</span> ${escHtml(appName)}`;
      item.onclick = () => save(appName);
      list.appendChild(item);
    });
  };

  const refresh = async () => {
    list.innerHTML = `<div class="loading-apps">Buscando ${currentTab === "running" ? "procesos activos" : "apps instaladas"}...</div>`;
    if (currentTab === "running") {
      await refreshRunningApps();
    } else {
      installedApps = await window.arduino.listInstalledApps();
    }
    renderList();
  };

  // Reset UI
  searchInp.value = "";
  filterText = "";
  currentTab = "running";
  tabRunning?.classList.add("active");
  tabInstalled?.classList.remove("active");
  modal.classList.remove("d-none");
  setTimeout(() => searchInp.focus(), 50);

  // Wire events
  searchInp.oninput = (e: any) => { filterText = e.target.value; renderList(); };

  if (tabRunning) {
    tabRunning.onclick = () => {
      currentTab = "running";
      tabRunning.classList.add("active");
      tabInstalled?.classList.remove("active");
      renderList();
    };
  }

  if (tabInstalled) {
    tabInstalled.onclick = async () => {
      currentTab = "installed";
      tabInstalled.classList.add("active");
      tabRunning?.classList.remove("active");
      if (installedApps.length === 0) await refresh();
      else renderList();
    };
  }

  const refreshBtn = document.getElementById("btn-refresh-assign-apps");
  if (refreshBtn) refreshBtn.onclick = refresh;

  const clearBtn = document.getElementById("btn-clear-app-assign");
  if (clearBtn) clearBtn.onclick = () => save(null);

  const cancelBtn = document.getElementById("btn-cancel-app-assign");
  if (cancelBtn) cancelBtn.onclick = () => modal.classList.add("d-none");

  const browseBtn = document.getElementById("btn-browse-app-exe");
  if (browseBtn) {
    browseBtn.onclick = async () => {
      const filePath = await window.arduino.selectFile();
      if (filePath) {
        const fileName = filePath.split(/[\\/]/).pop();
        if (fileName) save(fileName);
      }
    };
  }

  // Initial load
  if (!state.runningApps || state.runningApps.length === 0) {
    await refresh();
  } else {
    renderList();
  }
}
(window as any).assignApp = assignApp;

export async function openStepAppSelector(stepPath: number[]) {
  const modal = document.getElementById("step-app-selector-modal");
  const runningList = document.getElementById("step-running-apps-list");
  const closeBtn = document.getElementById("btn-close-step-app-selector");
  const refreshBtn = document.getElementById("btn-refresh-step-apps");
  const searchInp = document.getElementById("step-app-search") as HTMLInputElement | null;
  const tabRunning = document.getElementById("tab-step-running");
  const tabInstalled = document.getElementById("tab-step-installed");
  const titleLbl = document.getElementById("step-app-list-title");

  if (!modal || !runningList || !searchInp) return;

  let currentTab = "running"; // "running" | "installed"
  let installedApps: any[] = [];
  let filterText = "";

  modal.classList.remove("d-none");
  searchInp.value = "";
  searchInp.focus();

  const updateUI = () => {
    const apps = currentTab === "running" ? (state.runningApps || []) : installedApps;
    const filtered = apps.filter((a: any) => a.name.toLowerCase().includes(filterText.toLowerCase()));
    
    if (titleLbl) titleLbl.textContent = currentTab === "running" 
      ? "Apps abiertas actualmente" 
      : "Aplicaciones instaladas";
    
    renderStepAppList(filtered, stepPath);
  };

  const refresh = async () => {
    runningList.innerHTML = `<div class="loading-apps">Buscando ${currentTab === "running" ? "procesos activos" : "apps instaladas"}...</div>`;
    if (currentTab === "running") {
      await refreshRunningApps();
    } else {
      installedApps = await window.arduino.listInstalledApps();
    }
    updateUI();
  };

  if (tabRunning) {
    tabRunning.onclick = () => {
      currentTab = "running";
      tabRunning.classList.add("active");
      tabInstalled?.classList.remove("active");
      updateUI();
    };
  }

  if (tabInstalled) {
    tabInstalled.onclick = async () => {
      currentTab = "installed";
      tabInstalled.classList.add("active");
      tabRunning?.classList.remove("active");
      if (installedApps.length === 0) {
        await refresh();
      } else {
        updateUI();
      }
    };
  }

  searchInp.oninput = (e: any) => {
    filterText = e.target.value;
    updateUI();
  };

  if (closeBtn) closeBtn.onclick = () => modal.classList.add("d-none");
  if (refreshBtn) refreshBtn.onclick = refresh;

  // Initial load
  if (currentTab === "running" && (!state.runningApps || state.runningApps.length === 0)) {
    refresh();
  } else {
    updateUI();
  }
}

function renderStepAppList(apps: any[], stepPath: number[]) {
  const runningList = document.getElementById("step-running-apps-list");
  const modal = document.getElementById("step-app-selector-modal");
  if (!runningList) return;

  runningList.innerHTML = "";
  if (!apps || apps.length === 0) {
    runningList.innerHTML = '<div class="loading-apps">No se encontraron procesos.</div>';
    return;
  }

  apps.forEach(app => {
    const item = document.createElement("div");
    item.className = "app-item";
    item.innerHTML = `
      <div class="d-flex flex-column">
        <div style="font-weight: 600;">🚀 ${escHtml(app.name)}</div>
      </div>
    `;
    item.onclick = () => {
      const step = getStepByPath(stepPath);
      if (step) {
        if (!step.params) step.params = {};
        step.params.path = app.path;
        step.params.appDisplayName = app.name;
        saveSignals();
        renderFlow();
      }
      if (modal) modal.classList.add("d-none");
      showToast("App seleccionada", `Se vinculó ${app.name}`);
    };
    runningList.appendChild(item);
  });
}

export function assignSpeed(speed: string) {
  if (!speed || !state.selectedSig) return;

  const currentSig = state.signals[state.selectedSig];
  let speeds: string[] = Array.isArray(currentSig.assignedToButton)
    ? [...(currentSig.assignedToButton as string[])]
    : currentSig.assignedToButton ? [currentSig.assignedToButton as string] : [];

  if (speeds.includes(speed)) {
    // Removing — no conflict possible
    pushUndo();
    currentSig.assignedToButton = speeds.filter((s) => s !== speed);
    saveSignals();
    updateAssignButtonUI();
    renderSignalList();
    return;
  }

  // Check for conflicts: another workflow with same speed and same assignedApp
  const currentApp = currentSig.assignedApp ?? null;
  const conflicts = Object.entries(state.signals).filter(([key, sig]) => {
    if (key === state.selectedSig) return false;
    const assigned = sig.assignedToButton;
    const sigSpeeds = Array.isArray(assigned)
      ? assigned
      : assigned ? [assigned as string] : [];
    if (!sigSpeeds.includes(speed)) return false;
    return (sig.assignedApp ?? null) === currentApp;
  });

  const doAssign = () => {
    pushUndo();
    // Remove this speed from all conflicting workflows
    conflicts.forEach(([key, sig]) => {
      sig.assignedToButton = (Array.isArray(sig.assignedToButton) ? sig.assignedToButton : [sig.assignedToButton as string])
        .filter((s) => s !== speed);
    });
    speeds.push(speed);
    currentSig.assignedToButton = speeds;
    saveSignals();
    updateAssignButtonUI();
    renderSignalList();
  };

  if (conflicts.length === 0) {
    doAssign();
    return;
  }

  const conflictNames = conflicts.map(([key]) => `"${key}"`).join(", ");
  const appLabel = currentApp ? `app "${currentApp}"` : "sin app asignada";
  showConfirm(
    "Conflicto de asignación",
    `La pulsación <strong>${speed}</strong> ya está asignada a ${conflictNames} con ${appLabel}. Al asignar, se les quitará esa pulsación.`,
    doAssign,
    "Asignar"
  );
}

export function updateAssignButtonUI() {
  if (!state.selectedSig) return;
  const btn = document.getElementById("btn-assign");
  if (!btn) return;

  const sig = state.signals[state.selectedSig];
  const assigned = sig.assignedToButton;
  const speeds = Array.isArray(assigned)
    ? assigned
    : assigned
      ? [assigned as string]
      : [];

  const app = sig.assignedApp;

  if (speeds.length || app) {
    btn.classList.add("assigned");
    let label = "";
    if (speeds.length) {
      label = speeds
        .map((s) =>
          s === "RAPIDA" ? "Rápida" : s === "MEDIA" ? "Media" : "Lenta",
        )
        .join("+");
    }
    if (app) {
      label = (label ? label + " | " : "") + app;
    }
    btn.textContent = `✅ ${label}`;
    btn.title = `Asignado a: ${label}`;
  } else {
    btn.classList.remove("assigned");
    btn.textContent = "🔌 Asignar";
    btn.title = "Asignar al botón físico del Arduino o a una aplicación";
  }

  document
    .querySelectorAll("#assign-dropdown .dropdown-item")
    .forEach((itemEl) => {
      const item = itemEl as HTMLElement;
      if (item.dataset.speed) {
        item.classList.toggle("active", speeds.includes(item.dataset.speed));
      } else if (item.id === "item-assign-app") {
        item.classList.toggle("active", !!app);
      }
    });
}

export function renderFlow(container?: HTMLElement | null, steps?: Step[], path: number[] = []) {
  const isRoot = !container;
  const fc = container || document.getElementById("flow-container");
  if (!fc) return;

  if (isRoot) {
    fc.innerHTML = "";
    steps = state.signals[state.selectedSig!]?.steps || [];
  }

  // Initial insertion bar
  fc.appendChild(makeInsertionBar(path, 0));

  if (!steps!.length) {
    const empty = document.createElement("div");
    empty.className = "flow-empty";
    empty.innerHTML = `<span class="flow-empty-icon">⋯</span><span>Sin pasos — agregá uno arriba</span>`;
    fc.appendChild(empty);
  } else {
    steps!.forEach((step, i) => {
      const currentPath = [...path, i];
      fc.appendChild(makeStepCard(step, i, currentPath));

      // Insertion bar after each step
      fc.appendChild(makeInsertionBar(path, i + 1));
    });
  }

  if (isRoot) {
    // Post-render script initialization
    const findScripts = (arr: Step[], p: number[]) => {
      arr.forEach((s, idx) => {
        const cp = [...p, idx];
        if (s.type === "run_script") handleScriptInput(cp);
        if (s.params?.steps) findScripts(s.params.steps, cp);
      });
    };
    findScripts(steps!, []);
  }
}

function makeInsertionBar(parentPath: number[], index: number) {
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

  bar.addEventListener("dragleave", () => {
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

function toggleStepMenuAt(x: number, y: number) {
  const menu = document.getElementById("step-menu");
  if (!menu) return;
  menu.style.display = "block";
  const menuH = menu.offsetHeight;
  menu.style.display = "";
  menu.style.top = `${Math.min(y, window.innerHeight - menuH - 10)}px`;
  menu.style.left = `${x}px`;
  menu.style.transform = "none";
  menu.classList.add("open");
  if (menu._searchInput) {
    menu._searchInput.value = "";
    menu._searchInput.dispatchEvent(new Event("input"));
    const input = menu._searchInput;
    setTimeout(() => input.focus(), 50);
  }
}

function getStepSummary(step: Step) {
  const p = step.params || {};
  switch (step.type) {
    case "keypress": return p.combo || "–";
    case "wait": return `${p.ms ?? 500} ms`;
    case "clipboard": return p.text ? `"${String(p.text).slice(0, 28)}"` : "–";
    case "open_url": return p.url || "–";
    case "run_cmd": return p.cmd || "–";
    case "open_file": return p.path ? p.path.split(/[\\/]/).pop() : "–";
    case "open_app": return p.appDisplayName || (p.path ? p.path.split(/[\\/]/).pop() : "–");
    case "notify": return [p.title, p.body].filter(Boolean).join(" · ").slice(0, 36) || "–";
    case "run_script": {
      const lines = (p.code || "").split("\n").filter((l: string) => l.trim()).length;
      return `${p.lang || "python"} · ${lines} línea${lines !== 1 ? "s" : ""}`;
    }
    case "loop":
      return p.mode === "foreach"
        ? `foreach $${p.list_name || "?"}  as $${p.var_name || "item"}`
        : `× ${p.iterations ?? 5}`;
    case "condition": return (p.type || "").replace(/_/g, " ");
    case "set_variable": return `$${p.name || "?"} = ${p.value ?? ""}`;
    case "modify_variable": return `$${p.name || "?"} ${p.op || "="} ${p.value ?? ""}`;
    case "list_operation": return `${p.op || "append"} → $${p.name || "?"}`;
    case "media": return (p.action || "").replace(/_/g, " ");
    case "screenshot": return p.filename || "auto";
    case "screenshot_region": return p.filename || "selección";
    case "note": return (p.text || "").replace(/\n/g, " ").slice(0, 40) || "–";
    default: return "";
  }
}

export function makeStepCard(step: Step, idx: number, path: number[]) {
  const meta = STEP_TYPES[step.type] || STEP_TYPES.notify;
  const pathStr = JSON.stringify(path);
  const card = document.createElement("div");
  card.className = "step-card";
  if (step.collapsed) card.classList.add("collapsed");
  if (meta.isContainer) card.classList.add("step-card-container");
  if (step.type === "note") card.classList.add("step-card-note");
  card.draggable = true;
  card.dataset.path = pathStr;

  // Header
  const header = document.createElement("div");
  header.className = "step-header";
  header.style.cursor = "pointer";
  header.onclick = (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, select, .drag-handle")) return;
    toggleStepCollapse(path);
  };

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

  const preview = document.createElement("span");
  preview.className = "step-collapsed-preview";
  preview.textContent = getStepSummary(step);
  header.appendChild(preview);

  const collapseBtn = document.createElement("button");
  collapseBtn.className = "btn-collapse-step";
  collapseBtn.title = step.collapsed ? "Expandir paso" : "Colapsar paso";
  collapseBtn.textContent = step.collapsed ? "▶" : "▼";
  collapseBtn.onclick = (e) => {
    e.stopPropagation();
    toggleStepCollapse(path);
  };
  header.appendChild(collapseBtn);

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
        ? window.marked.parse(
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
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
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

function isPathEqual(p1: number[], p2: number[]) {
  return JSON.stringify(p1) === JSON.stringify(p2);
}

function isPathParent(parent: number[], child: number[]) {
  if (parent.length >= child.length) return false;
  for (let i = 0; i < parent.length; i++) {
    if (parent[i] !== child[i]) return false;
  }
  return true;
}

function moveStep(srcPath: number[], destPath: number[]) {
  if (!srcPath || !destPath) return;
  if (isPathEqual(srcPath, destPath) || isPathParent(srcPath, destPath)) return;

  pushUndo();

  // Clonar para operar de forma atómica y evitar que desaparezcan bloques
  const rootSteps = JSON.parse(
    JSON.stringify(state.signals[state.selectedSig!].steps),
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
    const getAndRemove = (steps: Step[], p: number[]): Step => {
      if (p.length === 1) return steps.splice(p[0], 1)[0];
      const target = steps[p[0]];
      if (!target || !target.params || !target.params.steps)
        throw new Error("Path de origen inválido");
      return getAndRemove(target.params.steps, p.slice(1));
    };

    const insert = (steps: Step[], p: number[], item: Step) => {
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
      state.signals[state.selectedSig!].steps = rootSteps;
    }
  } catch (err) {
    console.error("Error crítico al mover paso:", err);
  }

  state.dragSrcPath = null;
  saveSignals();
  renderFlow();
}

function discoverVariables(currentPath: number[] | null = null) {
  const vars = new Set<string>();

  // Add global variables
  Object.keys(state.globalVariables || {}).forEach(v => vars.add(v.trim()));

  if (!state.selectedSig) return Array.from(vars).sort();

  const scan = (steps: Step[], pathPrefix: number[] = []) => {
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

function buildStepParams(container: HTMLElement, step: Step, path: number[]) {
  const p = step.params || {};
  const pathStr = JSON.stringify(path);

  function makeRow(labelText: string) {
    const row = document.createElement("div");
    row.className = "param-row";
    const lbl = document.createElement("div");
    lbl.className = "param-label";
    lbl.textContent = labelText;
    row.appendChild(lbl);
    return row;
  }
  function resolveForPreview(val: any) {
    if (typeof val !== "string" || !val.includes("$")) return null;
    const vars: any = state.globalVariables || {};
    if (/^\$[a-zA-Z0-9_]+$/.test(val)) {
      const name = val.substring(1);
      return name in vars ? String(vars[name] ?? "") : null;
    }
    const result = val.replace(/\$([a-zA-Z0-9_]+)/g, (m, name) =>
      name in vars ? String(vars[name] ?? "") : m
    );
    return result !== val ? result : null;
  }

  function attachVarHint(inp: HTMLInputElement) {
    const anchor = inp.closest(".param-input-row") || inp.parentElement;
    anchor?.parentElement?.querySelector(".param-var-hint")?.remove();
    const resolved = resolveForPreview(inp.value);
    if (resolved === null) return;
    const hint = document.createElement("div");
    hint.className = "param-var-hint";
    hint.textContent = `= ${resolved}`;
    hint.title = resolved;
    anchor?.insertAdjacentElement("afterend", hint);
  }

  function makeInput(type: string, value: any, placeholder: string, param: string) {
    const inp = document.createElement("input");
    inp.type = type;
    inp.className = "param-input";
    inp.value = value;
    inp.placeholder = placeholder || "";
    inp.dataset.path = pathStr;
    inp.dataset.param = param;
    setTimeout(() => attachVarHint(inp), 0);
    inp.addEventListener("input", () => attachVarHint(inp));
    return inp;
  }
  function makeSelect(options: any[], current: any, param: string, cls = "") {
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
    sel.addEventListener("change", (e: any) =>
      updateParam(path, param, e.target.value),
    );
    return sel;
  }
  function makeHint(text: string) {
    const hint = document.createElement("div");
    hint.className = "param-hint";
    hint.textContent = text;
    return hint;
  }
  function makeVarLink(param: string) {
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
      inp.title = p.text || "";
      inp.addEventListener("input", (e: any) => { e.target.title = e.target.value; });
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
      inp.title = p.url || "";
      inp.addEventListener("input", (e: any) => { e.target.title = e.target.value; });
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
      inp.title = p.cmd || "";
      inp.addEventListener("input", (e: any) => { e.target.title = e.target.value; });
      wrap.appendChild(inp);
      wrap.appendChild(makeVarLink("cmd"));
      row.appendChild(wrap);
      container.appendChild(row);
      break;
    }
    case "open_file":
    case "open_app": {
      const isApp = step.type === "open_app";
      const row = makeRow(isApp ? "Aplicación" : "Ruta");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      
      const displayValue = isApp
        ? (p.appDisplayName || (p.path ? p.path.split(/[\\/]/).pop() : ""))
        : (p.path || "");

      const inp = makeInput(
        "text",
        displayValue,
        isApp ? "Seleccioná aplicación..." : "/Users/vos/archivo.pdf",
        isApp ? "path-display" : "path",
      );
      inp.id = `path-${pathStr}`;
      inp.className = "param-input flex-1";
      
      const warn = document.createElement("span");
      warn.className = "path-warning d-none";
      warn.title = "La ruta no parece existir";
      warn.textContent = "⚠️";
      warn.style.marginLeft = "4px";
      warn.style.cursor = "help";

      const checkPath = async (val: string) => {
        const cleanVal = (val || "").trim();
        if (!cleanVal || cleanVal.startsWith("$")) {
          warn.classList.add("d-none");
          return;
        }
        const exists = await window.arduino.fileExists(cleanVal);
        warn.classList.toggle("d-none", !!exists);
      };

      if (isApp) {
        inp.readOnly = true;
        inp.title = p.path || "";
        inp.style.cursor = "pointer";
        inp.onclick = () => {
           if (isApp) openStepAppSelector(path);
        };
        checkPath(p.path);
      } else {
        inp.addEventListener("input", (e: any) => checkPath(e.target.value));
        checkPath(p.path);
      }

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost btn-browse-file";
      btn.title = isApp ? "Seleccionar aplicación" : "Seleccionar archivo";
      btn.textContent = "📂";
      btn.dataset.path = pathStr;
      
      const btnQuick = document.createElement("button");
      if (isApp) {
        btnQuick.className = "btn btn-ghost btn-quick-app";
        btnQuick.title = "Seleccionar de apps abiertas o instaladas";
        btnQuick.textContent = "🚀";
        btnQuick.dataset.path = pathStr;
      }

      wrap.appendChild(inp);
      wrap.appendChild(warn);
      wrap.appendChild(makeVarLink("path"));
      if (isApp) wrap.appendChild(btnQuick);
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

function getStepByPath(path: number[]): Step | null {
  if (!state.selectedSig || !path || !path.length) return null;
  let steps = state.signals[state.selectedSig].steps;
  let target: Step | null = null;
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

function renameVarInSteps(steps: Step[], oldName: string, newName: string) {
  if (!steps) return;
  const pattern = new RegExp(`\\$${oldName}(?![a-zA-Z0-9_])`, "g");
  const replacement = `$${newName}`;
  for (const step of steps) {
    if (!step?.params) continue;
    for (const key of Object.keys(step.params)) {
      if (typeof step.params[key] === "string") {
        step.params[key] = step.params[key].replace(pattern, replacement);
      }
    }
    if (step.params.steps) renameVarInSteps(step.params.steps, oldName, newName);
  }
}

export function updateParam(path: number[], key: string, value: any) {
  const step = getStepByPath(path);
  if (!step) return;
  if (!step.params) step.params = {};
  step.params[key] = value;
  saveSignals();

  // Re-render only if structural change or specific logic depends on it
  if (["type", "mode", "op", "path"].includes(key)) renderFlow();
}
(window as any).updateParam = updateParam;

export function changeStepType(path: number[], newType: string) {
  const step = getStepByPath(path);
  if (!step) return;
  pushUndo();
  step.type = newType as StepType;
  step.params = {};
  saveSignals();
  renderFlow();
}
(window as any).changeStepType = changeStepType;

export function deleteStep(path: number[]) {
  pushUndo();
  const rootSteps = state.signals[state.selectedSig!].steps;
  const remove = (steps: Step[], p: number[]) => {
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
(window as any).deleteStep = deleteStep;

export function toggleStepCollapse(path: number[]) {
  const step = getStepByPath(path);
  if (!step) return;
  step.collapsed = !step.collapsed;
  saveSignals();
  renderFlow();
}
(window as any).toggleStepCollapse = toggleStepCollapse;

export function addStep(type: string, containerPath: number[] | null = null, index = -1) {
  if (!state.selectedSig) return;
  pushUndo();

  const contextPath = containerPath
    ? [...containerPath, index === -1 ? 999 : index]
    : null;
  const availableVars = discoverVariables(contextPath);
  const firstVar = availableVars[0] || "";

  const defaults: Record<string, any> = {
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
  const step: Step = {
    id: uid(),
    type: type as StepType,
    params: JSON.parse(JSON.stringify(defaults[type] || {})),
  };

  let targetSteps: Step[] | undefined;
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
      if (fc) fc.scrollTop = fc.scrollHeight;
    }, 50);
  }
}
(window as any).addStep = addStep;

export function testCurrentSignal() {
  if (!state.selectedSig) return;
  const card = document.querySelector(`.sig-card[data-sig="${CSS.escape(state.selectedSig)}"]`);
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
(window as any).testCurrentSignal = testCurrentSignal;

export function startKeyCapture(path: number[]) {
  const pathStr = JSON.stringify(path);
  if (state.capturingPath !== null) {
    const prev = document.querySelector(
      `.param-input[data-path="${state.capturingPath}"][data-param="combo"]`,
    ) as HTMLInputElement | null;
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
  ) as HTMLInputElement | null;
  if (!input) return;
  input.classList.add("capturing");
  input.readOnly = true;
  input.value = "Presioná la combinación...";
  window.arduino.startKeyCapture();
  const escHandler = (e: KeyboardEvent) => {
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
(window as any).startKeyCapture = startKeyCapture;

export async function browseFile(path: number[]) {
  const filePath = await window.arduino.selectFile();
  if (!filePath) return;
  const step = getStepByPath(path);
  if (!step) return;
  const isApp = step.type === "open_app";
  if (!step.params) step.params = {};
  step.params.path = filePath;
  if (isApp) {
    step.params.appDisplayName = filePath.split(/[\\/]/).pop();
  }
  saveSignals();
  renderFlow();
}
(window as any).browseFile = browseFile;

export function startRegionSelection(path: number[]) {
  state.selectingRegionPath = JSON.stringify(path);
  window.arduino.startRegionSelection();
}
(window as any).startRegionSelection = startRegionSelection;

export function buildStepMenu() {
  const menu = document.getElementById("step-menu");
  if (!menu) return;
  menu.innerHTML = "";

  const sections = [
    { title: "Básicos", items: ["keypress", "wait", "clipboard", "notify", "note"] },
    { title: "Sistema / Archivos", items: ["open_url", "run_cmd", "open_file", "open_app"] },
    { title: "Lógica / Variables", items: ["set_variable", "modify_variable", "list_operation", "loop", "condition"] },
    { title: "Avanzado", items: ["media", "run_script", "screenshot", "screenshot_region"] },
  ];

  // ── Search bar ──
  const searchWrap = document.createElement("div");
  searchWrap.className = "step-menu-search-wrap";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "step-menu-search";
  searchInput.placeholder = "Buscar bloque...";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchWrap.appendChild(searchInput);
  menu.appendChild(searchWrap);

  // ── Columns grid ──
  const grid = document.createElement("div");
  grid.className = "step-menu-grid";

  const allItems: any[] = [];

  sections.forEach((section) => {
    const col = document.createElement("div");
    col.className = "step-menu-col";
    col.dataset.section = section.title;

    const title = document.createElement("div");
    title.className = "step-menu-title";
    title.textContent = section.title;
    col.appendChild(title);

    section.items.forEach((type) => {
      const meta = STEP_TYPES[type as StepType];
      if (!meta) return;

      const item = document.createElement("div");
      item.className = "menu-item";
      item.dataset.type = type;
      item.dataset.label = meta.label.toLowerCase();

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
      allItems.push({ item, col, type, label: meta.label.toLowerCase() });
    });

    grid.appendChild(col);
  });

  // Empty search state
  const emptyMsg = document.createElement("div");
  emptyMsg.className = "step-menu-empty";
  emptyMsg.textContent = "Sin resultados";
  emptyMsg.style.display = "none";
  grid.appendChild(emptyMsg);

  menu.appendChild(grid);

  // ── Search logic ──
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    let visibleCount = 0;

    allItems.forEach(({ item, label, type }) => {
      const matches = !q || label.includes(q) || type.includes(q);
      item.style.display = matches ? "" : "none";
      if (matches) visibleCount++;
    });

    // Show/hide section titles based on visible children
    grid.querySelectorAll(".step-menu-col").forEach(colEl => {
      const col = colEl as HTMLElement;
      const hasVisible = [...col.querySelectorAll(".menu-item")].some(i => (i as HTMLElement).style.display !== "none");
      col.style.display = hasVisible ? "" : "none";
    });

    emptyMsg.style.display = visibleCount === 0 ? "" : "none";
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      menu.classList.remove("open");
      e.stopPropagation();
      return;
    }
    if (e.key === "Enter") {
      const first = allItems.find(({ item }) => item.style.display !== "none");
      if (first) first.item.click();
    }
  });

  menu._searchInput = searchInput;
}

export function toggleStepMenu() {
  if (!state.selectedSig) {
    showToast("Sin señal", "Seleccioná una señal primero");
    return;
  }
  state.insertionPoint = null;
  const menu = document.getElementById("step-menu");
  if (!menu) return;
  const isOpening = !menu.classList.contains("open");
  menu.classList.toggle("open");
  if (isOpening && menu._searchInput) {
    menu._searchInput.value = "";
    menu._searchInput.dispatchEvent(new Event("input"));
    const input = menu._searchInput;
    setTimeout(() => input.focus(), 50);
  }
}
(window as any).toggleStepMenu = toggleStepMenu;

// ── Ctrl+F to focus step menu search ──
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    const menu = document.getElementById("step-menu");
    if (menu?.classList.contains("open") && menu._searchInput) {
      e.preventDefault();
      menu._searchInput.focus();
      menu._searchInput.select();
    }
  }
});

// ── Script Editor helpers ──
function highlightCode(code: string, lang: string) {
  const escHtmlLocal = (s: string) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  let html = escHtmlLocal(code);
  const tokens: string[] = [];
  function hold(match: string, cls: string) {
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
  for (let j = 0; j < tokens.length; j++)
    html = html.replace("\x00T" + j + "\x00", tokens[j]);
  if (!html.endsWith("\n")) html += "\n";
  return html;
}

function updateGutter(path: number[]) {
  const pathStr = JSON.stringify(path);
  const textarea = document.getElementById(`script-code-${pathStr}`) as HTMLTextAreaElement | null;
  const gutter = document.getElementById(`script-gutter-${pathStr}`);
  if (!textarea || !gutter) return;
  const lines = textarea.value.split("\n").length;
  gutter.innerHTML = Array.from(
    { length: lines },
    (_, i) => `<div>${i + 1}</div>`,
  ).join("");
}

export function handleScriptInput(path: number[]) {
  const pathStr = JSON.stringify(path);
  const textarea = document.getElementById(`script-code-${pathStr}`) as HTMLTextAreaElement | null;
  if (!textarea) return;
  const lang =
    (document.getElementById(`script-lang-${pathStr}`) as HTMLSelectElement | null)?.value || "python";
  updateParam(path, "code", textarea.value);
  const highlight = document.getElementById(`script-highlight-${pathStr}`);
  if (highlight) highlight.innerHTML = highlightCode(textarea.value, lang);
  updateGutter(path);
}
(window as any).handleScriptInput = handleScriptInput;

export function syncScriptScroll(path: number[]) {
  const pathStr = JSON.stringify(path);
  const textarea = document.getElementById(`script-code-${pathStr}`) as HTMLTextAreaElement | null;
  const highlight = document.getElementById(`script-highlight-${pathStr}`);
  const gutter = document.getElementById(`script-gutter-${pathStr}`);
  if (textarea && highlight) {
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }
  if (textarea && gutter) gutter.scrollTop = textarea.scrollTop;
}
(window as any).syncScriptScroll = syncScriptScroll;

export function handleScriptKeydown(e: KeyboardEvent, path: number[]) {
  if (e.key === "Tab") {
    e.preventDefault();
    const ta = e.target as HTMLTextAreaElement;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + "    " + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + 4;
    handleScriptInput(path);
  }
}
(window as any).handleScriptKeydown = handleScriptKeydown;

export function updateScriptEditor(path: number[]) {
  renderFlow();
}
(window as any).updateScriptEditor = updateScriptEditor;
