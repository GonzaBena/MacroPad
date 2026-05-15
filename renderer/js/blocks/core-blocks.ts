import { blockRegistry } from '../registry/block-registry.js';
import { state, MEDIA_OPTIONS } from '../state.js';
import { 
  updateParam, 
  renderFlow, 
  closeContextMenu, 
  openStepAppSelector 
} from '../workflows.js';
import { showToast } from '../ui.js';

/**
 * Helpers para construir la UI de parámetros de forma consistente.
 */
export const uiHelpers = {
  makeRow: (labelText: string) => {
    const row = document.createElement("div");
    row.className = "param-row";
    const lbl = document.createElement("div");
    lbl.className = "param-label";
    lbl.textContent = labelText;
    row.appendChild(lbl);
    return row;
  },

  resolveForPreview: (val: any) => {
    if (typeof val !== "string" || !val.includes("$")) return null;
    const vars: any = state.globalVariables || {};
    const unwrap = (v: any) => (v && typeof v === "object" && "value" in v) ? v.value : v;
    if (/^\$[a-zA-Z0-9_]+$/.test(val)) {
      const name = val.substring(1);
      return name in vars ? String(unwrap(vars[name]) ?? "") : null;
    }
    const result = val.replace(/\$([a-zA-Z0-9_]+)/g, (m, name) =>
      name in vars ? String(unwrap(vars[name]) ?? "") : m
    );
    return result !== val ? result : null;
  },

  attachVarHint: (inp: HTMLInputElement) => {
    const anchor = inp.closest(".param-input-row") || inp.parentElement;
    anchor?.parentElement?.querySelector(".param-var-hint")?.remove();
    const resolved = uiHelpers.resolveForPreview(inp.value);
    if (resolved === null) return;
    const hint = document.createElement("div");
    hint.className = "param-var-hint";
    hint.textContent = `= ${resolved}`;
    hint.title = resolved;
    anchor?.insertAdjacentElement("afterend", hint);
  },

  makeInput: (pathStr: string, type: string, value: any, placeholder: string, param: string) => {
    const inp = document.createElement("input");
    inp.type = type;
    inp.className = "param-input";
    inp.value = value;
    inp.placeholder = placeholder || "";
    inp.dataset.path = pathStr;
    inp.dataset.param = param;
    setTimeout(() => uiHelpers.attachVarHint(inp), 0);
    inp.addEventListener("input", () => uiHelpers.attachVarHint(inp));
    return inp;
  },

  makeSelect: (path: number[], options: any[], current: any, param: string, cls = "") => {
    const sel = document.createElement("select");
    sel.className = "param-select " + cls;
    sel.dataset.path = JSON.stringify(path);
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
  },

  makeHint: (text: string) => {
    const hint = document.createElement("div");
    hint.className = "param-hint";
    hint.textContent = text;
    return hint;
  },

  makeVarLink: (path: number[], param: string, discoverVariables: any, typeFilter: string | null = null) => {
    const btn = document.createElement("button");
    btn.className = "btn-var-link";
    btn.title = "Vincular a variable" + (typeFilter ? ` (${typeFilter})` : "");
    btn.textContent = "v";
    btn.onclick = (e) => {
      e.stopPropagation();
      closeContextMenu();
      const vars = discoverVariables(path, typeFilter);
      if (!vars.length) {
        showToast("Sin variables", `Definí una variable de tipo ${typeFilter || 'cualquiera'} primero`);
        return;
      }

      const menu = document.createElement("div");
      menu.className = "context-menu";
      vars.forEach((v: {name: string, type: string}) => {
        const item = document.createElement("div");
        item.className = "context-menu-item";
        item.innerHTML = `<span>$${v.name}</span><span class="var-type-tag">${v.type}</span>`;
        item.onclick = () => {
          updateParam(path, param, `$${v.name}`);
          renderFlow();
          closeContextMenu();
        };
        menu.appendChild(item);
      });
      document.body.appendChild(menu);
      const rect = btn.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 5}px`;
      (window as any).activeContextMenu = menu;
    };
    return btn;
  }
};

export function registerCoreBlocks() {
  const h = uiHelpers;

  blockRegistry.register({
    type: 'keypress',
    label: 'Simular tecla',
    icon: '⌨',
    cls: 't-keypress',
    getSummary: (step) => step.params?.combo || '–',
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const pathStr = JSON.stringify(path);
      const row = h.makeRow("Combinación de teclas");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = h.makeInput(pathStr, "text", p.combo || "", "ej: cmd+space, $mi_tecla", "combo");
      inp.className = "param-input key-input flex-1";
      
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost btn-key-capture";
      btn.title = "Capturar teclas";
      btn.textContent = "⌨️";
      btn.dataset.path = pathStr;
      
      wrap.appendChild(inp);
      wrap.appendChild(h.makeVarLink(path, "combo", utils.discoverVariables, "string"));
      wrap.appendChild(btn);
      row.appendChild(wrap);
      row.appendChild(h.makeHint("Escribí la combinación manualmente o usá el botón para capturarla."));
      container.appendChild(row);
    }
  });

  blockRegistry.register({
    type: 'wait',
    label: 'Esperar',
    icon: '◷',
    cls: 't-wait',
    getSummary: (step) => `${step.params?.ms ?? 500} ms`,
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const row = h.makeRow("Duración (ms)");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = h.makeInput(JSON.stringify(path), "text", p.ms || 500, "", "ms");
      inp.className = "param-input flex-1";
      wrap.appendChild(inp);
      wrap.appendChild(h.makeVarLink(path, "ms", utils.discoverVariables, "int"));
      row.appendChild(wrap);
      container.appendChild(row);
    }
  });

  blockRegistry.register({
    type: 'clipboard',
    label: 'Copiar texto',
    icon: '⎘',
    cls: 't-clipboard',
    getSummary: (step) => step.params?.text ? `"${String(step.params.text).slice(0, 28)}"` : "–",
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const row = h.makeRow("Texto a copiar");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = h.makeInput(JSON.stringify(path), "text", p.text || "", "Texto o $variable", "text");
      inp.className = "param-input flex-1";
      inp.title = p.text || "";
      inp.addEventListener("input", (e: any) => { e.target.title = e.target.value; });
      wrap.appendChild(inp);
      wrap.appendChild(h.makeVarLink(path, "text", utils.discoverVariables, "string"));
      row.appendChild(wrap);
      container.appendChild(row);
    }
  });

  blockRegistry.register({
    type: 'media',
    label: 'Media',
    icon: '▶',
    cls: 't-media',
    getSummary: (step) => (step.params?.action || "").replace(/_/g, " "),
    renderParams: (container, step, path) => {
      const row = h.makeRow("Acción");
      row.appendChild(
        h.makeSelect(
          path,
          MEDIA_OPTIONS.map((o) => ({ v: o.value, l: o.label })),
          step.params?.action,
          "action",
          "media-action-select",
        ),
      );
      container.appendChild(row);
    }
  });

  blockRegistry.register({
    type: 'open_url',
    label: 'Abrir URL',
    icon: '↗',
    cls: 't-open_url',
    getSummary: (step) => step.params?.url || '–',
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const row = h.makeRow("URL");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = h.makeInput(JSON.stringify(path), "text", p.url || "", "https://ejemplo.com o $variable", "url");
      inp.className = "param-input flex-1";
      inp.title = p.url || "";
      inp.addEventListener("input", (e: any) => { e.target.title = e.target.value; });
      wrap.appendChild(inp);
      wrap.appendChild(h.makeVarLink(path, "url", utils.discoverVariables, "string"));
      row.appendChild(wrap);
      container.appendChild(row);
    }
  });

  blockRegistry.register({
    type: 'run_cmd',
    label: 'Ejecutar cmd',
    icon: '$',
    cls: 't-run_cmd',
    getSummary: (step) => step.params?.cmd || '–',
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const row = h.makeRow("Comando");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = h.makeInput(JSON.stringify(path), "text", p.cmd || "", "Comando o $variable", "cmd");
      inp.className = "param-input flex-1";
      inp.title = p.cmd || "";
      inp.addEventListener("input", (e: any) => { e.target.title = e.target.value; });
      wrap.appendChild(inp);
      wrap.appendChild(h.makeVarLink(path, "cmd", utils.discoverVariables, "string"));
      row.appendChild(wrap);
      container.appendChild(row);
    }
  });

  blockRegistry.register({
    type: 'open_file',
    label: 'Abrir archivo',
    icon: '⌂',
    cls: 't-open_file',
    getSummary: (step) => step.params?.path ? step.params.path.split(/[\\/]/).pop() : "–",
    renderParams: (container, step, path, utils) => renderFileAppParams(container, step, path, utils, h)
  });

  blockRegistry.register({
    type: 'open_app',
    label: 'Abrir aplicación',
    icon: '🚀',
    cls: 't-open_app',
    getSummary: (step) => step.params?.appDisplayName || (step.params?.path ? step.params.path.split(/[\\/]/).pop() : "–"),
    renderParams: (container, step, path, utils) => renderFileAppParams(container, step, path, utils, h)
  });

  blockRegistry.register({
    type: 'set_variable',
    label: 'Definir variable',
    icon: '📦',
    cls: 't-var',
    getSummary: (step) => `$${step.params?.name || "?"} = ${step.params?.value ?? ""}`,
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const currentType = p.type || "string";

      const r1 = h.makeRow("Nombre");
      r1.appendChild(h.makeInput(JSON.stringify(path), "text", p.name || "", "mi_variable", "name"));
      container.appendChild(r1);

      const r2 = h.makeRow("Tipo");
      const typeSel = h.makeSelect(
        path,
        [
          { v: "string", l: "Texto" },
          { v: "int",    l: "Número entero" },
          { v: "float",  l: "Número decimal" },
          { v: "bool",   l: "Booleano" },
          { v: "list",   l: "Lista (JSON)" },
          { v: "json",   l: "Objeto JSON" },
        ],
        currentType,
        "type",
      );

      typeSel.addEventListener("change", (e: any) => {
        const newType = e.target.value;
        const currentVal = String(p.value ?? "");
        let newVal = currentVal;

        if (newType === "int") {
          const n = parseInt(currentVal, 10);
          if (isNaN(n)) {
            newVal = "0";
            showToast("Conversión", "El valor no era un entero válido, se reseteó a 0");
          } else {
            newVal = String(n);
          }
        } else if (newType === "float") {
          const n = parseFloat(currentVal);
          if (isNaN(n)) {
            newVal = "0.0";
            showToast("Conversión", "El valor no era un decimal válido, se reseteó a 0.0");
          } else {
            newVal = String(n);
          }
        } else if (newType === "bool") {
          const truthy = currentVal === "true" || currentVal === "1" || currentVal === "yes";
          newVal = truthy ? "true" : "false";
        } else if (newType === "list") {
          try {
            const parsed = JSON.parse(currentVal);
            if (!Array.isArray(parsed)) throw new Error();
          } catch {
            newVal = "[]";
            showToast("Lista", "Se cambió a lista vacía []");
          }
        } else if (newType === "json") {
          try {
            const parsed = JSON.parse(currentVal);
            if (typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
          } catch {
            newVal = "{}";
            showToast("JSON", "Se cambió a objeto vacío {}");
          }
        }

        updateParam(path, "value", newVal);
        renderFlow();
      });

      r2.appendChild(typeSel);
      container.appendChild(r2);

      const r3 = h.makeRow("Valor inicial");
      const w3 = document.createElement("div");
      w3.className = "param-input-row";

      if (currentType === "bool") {
        const boolSel = h.makeSelect(
          path,
          [
            { v: "true",  l: "true" },
            { v: "false", l: "false" },
          ],
          p.value === "true" ? "true" : "false",
          "value",
        );
        boolSel.className = "param-select flex-1";
        w3.appendChild(boolSel);
      } else {
        const placeholders: Record<string, string> = {
          string: "texto...",
          int:    "0",
          float:  "0.0",
          list:   '["item1", "item2"]',
          json:   '{"clave": "valor"}',
        };
        const i3 = h.makeInput(JSON.stringify(path), "text", p.value ?? "", placeholders[currentType] || "valor...", "value");
        i3.className = "param-input flex-1";
        w3.appendChild(i3);
        w3.appendChild(h.makeVarLink(path, "value", utils.discoverVariables, currentType));
      }

      r3.appendChild(w3);
      container.appendChild(r3);
    }
  });

  blockRegistry.register({
    type: 'modify_variable',
    label: 'Modificar variable',
    icon: '⚙',
    cls: 't-var',
    getSummary: (step) => `$${step.params?.name || "?"} ${step.params?.op || "="} ${step.params?.value ?? ""}`,
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const availableVars = utils.discoverVariables(path);
      
      const r1 = h.makeRow("Variable");
      const sel = document.createElement("select");
      sel.className = "param-select";
      sel.dataset.path = JSON.stringify(path);
      sel.dataset.param = "name";
      availableVars.forEach((v: {name: string, type: string}) => {
        const opt = document.createElement("option");
        opt.value = v.name;
        opt.textContent = `$${v.name} (${v.type})`;
        if (p.name === v.name) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", (e: any) => updateParam(path, "name", e.target.value));
      r1.appendChild(sel);
      container.appendChild(r1);
      
      const r2 = h.makeRow("Operación");
      r2.appendChild(
        h.makeSelect(
          path,
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
      
      const r3 = h.makeRow("Valor");
      const wrap = document.createElement("div");
      wrap.className = "param-input-row";
      const inp = h.makeInput(JSON.stringify(path), "text", p.value || "", "valor o $variable", "value");
      inp.className = "param-input flex-1";
      wrap.appendChild(inp);
      
      // Determine expected type for the value based on the operation
      let expectedType: string | null = null;
      if (p.op === "add" || p.op === "sub") expectedType = "int";
      if (p.op === "concat") expectedType = "string";
      
      wrap.appendChild(h.makeVarLink(path, "value", utils.discoverVariables, expectedType));
      r3.appendChild(wrap);
      container.appendChild(r3);
    }
  });

  blockRegistry.register({
    type: 'list_operation',
    label: 'Operación de lista',
    icon: '▤',
    cls: 't-var',
    getSummary: (step) => `${step.params?.op || "append"} → $${step.params?.name || "?"}`,
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const availableVars = utils.discoverVariables(path, "list");
      
      const r1 = h.makeRow("Lista");
      const sel = document.createElement("select");
      sel.className = "param-select";
      sel.dataset.path = JSON.stringify(path);
      sel.dataset.param = "name";
      availableVars.forEach((v: {name: string, type: string}) => {
        const opt = document.createElement("option");
        opt.value = v.name;
        opt.textContent = `$${v.name}`;
        if (p.name === v.name) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", (e: any) => updateParam(path, "name", e.target.value));
      r1.appendChild(sel);
      container.appendChild(r1);
      
      const r2 = h.makeRow("Operación");
      r2.appendChild(
        h.makeSelect(
          path,
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
        const r3 = h.makeRow(p.op === "append" ? "Elemento" : "Índice");
        const wrap = document.createElement("div");
        wrap.className = "param-input-row";
        const inp = h.makeInput(JSON.stringify(path), "text", p.value || "", "valor o $variable", "value");
        inp.className = "param-input flex-1";
        wrap.appendChild(inp);
        wrap.appendChild(h.makeVarLink(path, "value", utils.discoverVariables, p.op === "remove_at" ? "int" : null));
        r3.appendChild(wrap);
        container.appendChild(r3);
      }
    }
  });

  blockRegistry.register({
    type: 'loop',
    label: 'Bucle (Repetir)',
    icon: '🔄',
    cls: 't-loop',
    isContainer: true,
    getSummary: (step) => {
      const p = step.params || {};
      return p.mode === "foreach"
        ? `foreach $${p.list_name || "?"}  as $${p.var_name || "item"}`
        : `× ${p.iterations ?? 5}`;
    },
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      
      const r1 = h.makeRow("Modo");
      r1.appendChild(
        h.makeSelect(
          path,
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
        const r2 = h.makeRow("Lista");
        const availableVars = utils.discoverVariables(path, "list");
        const sel = document.createElement("select");
        sel.className = "param-select";
        sel.dataset.path = JSON.stringify(path);
        sel.dataset.param = "list_name";
        availableVars.forEach((v: {name: string, type: string}) => {
          const opt = document.createElement("option");
          opt.value = v.name;
          opt.textContent = `$${v.name}`;
          if (p.list_name === v.name) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener("change", (e: any) => updateParam(path, "list_name", e.target.value));
        r2.appendChild(sel);
        container.appendChild(r2);
        
        const r3 = h.makeRow("Var. Temporal");
        r3.appendChild(h.makeInput(JSON.stringify(path), "text", p.var_name || "item", "nombre de variable", "var_name"));
        container.appendChild(r3);
      } else {
        const r2 = h.makeRow("Iteraciones");
        const wrap = document.createElement("div");
        wrap.className = "param-input-row";
        const inp = h.makeInput(JSON.stringify(path), "text", p.iterations || 5, "ej: 5 o $variable", "iterations");
        inp.className = "param-input flex-1";
        wrap.appendChild(inp);
        wrap.appendChild(h.makeVarLink(path, "iterations", utils.discoverVariables, "int"));
        r2.appendChild(wrap);
        container.appendChild(r2);
      }
    }
  });

  blockRegistry.register({
    type: 'condition',
    label: 'Condicional (Si...)',
    icon: '❓',
    cls: 't-condition',
    isContainer: true,
    getSummary: (step) => (step.params?.type || "").replace(/_/g, " "),
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const r1 = h.makeRow("Si...");
      const opts = [
        { v: "prev_step_success", l: "El paso anterior fue exitoso" },
        { v: "clipboard_match", l: "El portapapeles contiene..." },
        { v: "app_running", l: "La aplicación está abierta..." },
        { v: "var_cmp", l: "Comparar variables" },
      ];
      r1.appendChild(
        h.makeSelect(
          path,
          opts,
          p.type || "prev_step_success",
          "type",
          "condition-type-select",
        ),
      );
      container.appendChild(r1);

      if (p.type === "clipboard_match" || p.type === "app_running") {
        const r2 = h.makeRow("Valor esperado");
        const wrap = document.createElement("div");
        wrap.className = "param-input-row";
        const inp = h.makeInput(
          JSON.stringify(path),
          "text",
          p.value || "",
          p.type === "app_running" ? "spotify.exe" : "texto o $variable",
          "value",
        );
        inp.className = "param-input flex-1";
        wrap.appendChild(inp);
        wrap.appendChild(h.makeVarLink(path, "value", utils.discoverVariables, "string"));
        r2.appendChild(wrap);
        container.appendChild(r2);
      } else if (p.type === "var_cmp") {
        const r2 = h.makeRow("Variables");
        const wrap = document.createElement("div");
        wrap.className = "param-input-row gap-4";
        const v1 = h.makeInput(JSON.stringify(path), "text", p.var1 || "", "$var1", "var1");
        v1.className = "param-input flex-1";
        const v2 = h.makeInput(JSON.stringify(path), "text", p.var2 || "", "$var2", "var2");
        v2.className = "param-input flex-1";
        wrap.appendChild(v1);
        wrap.appendChild(h.makeVarLink(path, "var1", utils.discoverVariables));
        wrap.appendChild(document.createTextNode("vs"));
        wrap.appendChild(v2);
        wrap.appendChild(h.makeVarLink(path, "var2", utils.discoverVariables));
        r2.appendChild(wrap);
        container.appendChild(r2);

        const r3 = h.makeRow("Operador");
        r3.appendChild(
          h.makeSelect(
            path,
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
    }
  });

  blockRegistry.register({
    type: 'notify',
    label: 'Notificación',
    icon: '◉',
    cls: 't-notify',
    getSummary: (step) => [step.params?.title, step.params?.body].filter(Boolean).join(" · ").slice(0, 36) || "–",
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const r1 = h.makeRow("Título");
      const w1 = document.createElement("div");
      w1.className = "param-input-row";
      const i1 = h.makeInput(JSON.stringify(path), "text", p.title || "", "Título o $variable", "title");
      i1.className = "param-input flex-1";
      w1.appendChild(i1);
      w1.appendChild(h.makeVarLink(path, "title", utils.discoverVariables, "string"));
      r1.appendChild(w1);
      container.appendChild(r1);

      const r2 = h.makeRow("Mensaje");
      const w2 = document.createElement("div");
      w2.className = "param-input-row";
      const i2 = h.makeInput(JSON.stringify(path), "text", p.body || "", "Cuerpo o $variable", "body");
      i2.className = "param-input flex-1";
      w2.appendChild(i2);
      w2.appendChild(h.makeVarLink(path, "body", utils.discoverVariables, "string"));
      r2.appendChild(w2);
      container.appendChild(r2);
    }
  });

  blockRegistry.register({
    type: 'run_script',
    label: 'Ejecutar script',
    icon: '{ }',
    cls: 't-run_script',
    getSummary: (step) => {
      const p = step.params || {};
      const lines = (p.code || "").split("\n").filter((l: string) => l.trim()).length;
      return `${p.lang || "python"} · ${lines} línea${lines !== 1 ? "s" : ""}`;
    },
    renderParams: (container, step, path) => {
      const p = step.params || {};
      const pathStr = JSON.stringify(path);
      const r1 = h.makeRow("Lenguaje");
      const selWrap = document.createElement("div");
      selWrap.className = "param-select-row";
      selWrap.appendChild(
        h.makeSelect(
          path,
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
      
      const btnMax = document.createElement("button");
      btnMax.className = "btn btn-ghost btn-maximize-script";
      btnMax.title = "Abrir en editor de pantalla completa";
      btnMax.innerHTML = "⛶";
      btnMax.onclick = () => {
        (window as any).showCodeEditor(
          `Editando Script (${p.lang || "python"})`,
          p.lang || "python",
          p.code || "",
          (newCode: string) => {
            updateParam(path, "code", newCode);
            renderFlow();
          }
        );
      };
      selWrap.appendChild(btnMax);
      
      r1.appendChild(selWrap);
      container.appendChild(r1);

      const r2 = h.makeRow("Código");
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
    }
  });

  blockRegistry.register({
    type: 'screenshot',
    label: 'Captura de pantalla',
    icon: '📸',
    cls: 't-screenshot',
    getSummary: (step) => step.params?.filename || "auto",
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const row = h.makeRow("Nombre del archivo");
      const wrap = document.createElement("div"); 
      wrap.className = "param-input-row";
      const inp = h.makeInput(JSON.stringify(path), "text", p.filename || "", "ej: captura.png o $mi_var", "filename");
      inp.className = "param-input flex-1";
      wrap.appendChild(inp);
      wrap.appendChild(h.makeVarLink(path, "filename", utils.discoverVariables, "string"));
      row.appendChild(wrap);
      container.appendChild(row);
      container.appendChild(h.makeHint("Se guardará en la carpeta Imágenes/MacroPad. Dejar vacío para nombre automático."));
    }
  });

  blockRegistry.register({
    type: 'screenshot_region',
    label: 'Captura de región',
    icon: '✂️',
    cls: 't-screenshot',
    getSummary: (step) => step.params?.filename || "selección",
    renderParams: (container, step, path, utils) => {
      const p = step.params || {};
      const r1 = h.makeRow("Nombre del archivo");
      const w1 = document.createElement("div"); 
      w1.className = "param-input-row";
      const i1 = h.makeInput(JSON.stringify(path), "text", p.filename || "", "ej: region.png", "filename");
      i1.className = "param-input flex-1";
      w1.appendChild(i1); 
      w1.appendChild(h.makeVarLink(path, "filename", utils.discoverVariables, "string"));
      r1.appendChild(w1); 
      container.appendChild(r1);
      container.appendChild(h.makeHint("Al ejecutarse, se pedirá seleccionar el área en pantalla."));
    }
  });

  blockRegistry.register({
    type: 'note',
    label: 'Nota / Comentario',
    icon: '📝',
    cls: 't-note',
    getSummary: (step) => (step.params?.text || "").replace(/\n/g, " ").slice(0, 40) || "–",
  });
}

function renderFileAppParams(container: HTMLElement, step: any, path: number[], utils: any, h: any) {
  const p = step.params || {};
  const pathStr = JSON.stringify(path);
  const isApp = step.type === "open_app";
  const row = h.makeRow(isApp ? "Aplicación" : "Ruta");
  const wrap = document.createElement("div");
  wrap.className = "param-input-row";
  
  const displayValue = isApp
    ? (p.appDisplayName || (p.path ? p.path.split(/[\\/]/).pop() : ""))
    : (p.path || "");

  const inp = h.makeInput(pathStr, "text", displayValue, isApp ? "Seleccioná aplicación..." : "/Users/vos/archivo.pdf", isApp ? "path-display" : "path");
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
  wrap.appendChild(h.makeVarLink(path, "path", utils.discoverVariables));
  if (isApp) wrap.appendChild(btnQuick);
  wrap.appendChild(btn);
  row.appendChild(wrap);
  container.appendChild(row);
}
