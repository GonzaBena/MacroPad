import { PluginManifest, RemotePlugin } from "../../src/types/pokepad";

let allPlugins: PluginManifest[] = [];
let remotePlugins: RemotePlugin[] = [];
let selectedPluginId: string | null = null;
let selectedRemoteId: string | null = null;

function formatDisplayName(name: string, id: string): string {
  if (!name || name === id || /^[a-z0-9][a-z0-9-_]*$/.test(name)) {
    return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return name;
}

function renderIconHtml(icon: string | undefined): string {
  if (!icon) return "🧩";
  if (icon.startsWith("http") || icon.match(/\.(png|jpg|jpeg|gif|svg)$/i)) {
    return `<img src="${icon}" alt="icon" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;" />`;
  }
  return icon;
}

async function init() {
  // Close window
  document.getElementById("btn-close")?.addEventListener("click", () => {
    window.arduino.close();
  });

  // Tabs switching
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", async () => {
      const target = (tab as HTMLElement).dataset.tab;
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      document.querySelectorAll(".tab-pane").forEach((pane) => {
        pane.classList.remove("active");
      });
      document.getElementById(`tab-${target}`)?.classList.add("active");

      if (target === "install" && remotePlugins.length === 0) {
        await refreshRemotePlugins();
      }
    });
  });

  // Search local
  const searchInput = document.getElementById("plugin-search") as HTMLInputElement;
  const installedSuggest = document.getElementById("installed-tag-suggest") as HTMLElement;

  searchInput?.addEventListener("input", () => {
    const tq = getTagQuery(searchInput);
    if (tq !== null) {
      const allTags = [...new Set(allPlugins.flatMap((p) => p.tags || []))].sort();
      renderTagSuggest(installedSuggest, tq.query, allTags, (tag) => {
        applyTagSuggestion(searchInput, tag, tq.start);
        installedSuggest.style.display = "none";
      });
    } else {
      installedSuggest.style.display = "none";
      installedSuggest.innerHTML = "";
    }
    renderPluginList(searchInput.value);
  });

  searchInput?.addEventListener("keydown", (e) => {
    handleSuggestKeydown(e, installedSuggest);
  });

  searchInput?.addEventListener("blur", () => {
    setTimeout(() => { installedSuggest.style.display = "none"; }, 150);
  });

  // Filter local status
  document
    .getElementById("filter-installed-status")
    ?.addEventListener("change", () => {
      renderPluginList(searchInput.value);
    });

  // Open plugins folder
  document
    .getElementById("btn-open-plugins-folder")
    ?.addEventListener("click", () => {
      window.arduino.openPluginsFolder();
    });

  // Search remote
  const remoteSearchInput = document.getElementById("remote-search") as HTMLInputElement;
  const remoteSuggest = document.getElementById("remote-tag-suggest") as HTMLElement;

  remoteSearchInput?.addEventListener("input", () => {
    const tq = getTagQuery(remoteSearchInput);
    if (tq !== null) {
      const allTags = [...new Set(remotePlugins.flatMap((p) => p.tags || []))].sort();
      renderTagSuggest(remoteSuggest, tq.query, allTags, (tag) => {
        applyTagSuggestion(remoteSearchInput, tag, tq.start);
        remoteSuggest.style.display = "none";
      });
    } else {
      remoteSuggest.style.display = "none";
      remoteSuggest.innerHTML = "";
    }
    renderRemoteList(remoteSearchInput.value);
  });

  remoteSearchInput?.addEventListener("keydown", (e) => {
    handleSuggestKeydown(e, remoteSuggest);
  });

  remoteSearchInput?.addEventListener("blur", () => {
    setTimeout(() => { remoteSuggest.style.display = "none"; }, 150);
  });

  // Filter remote status
  document
    .getElementById("filter-remote-status")
    ?.addEventListener("change", () => {
      renderRemoteList(remoteSearchInput.value);
    });

  // Refresh remote
  document
    .getElementById("btn-refresh-remote")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById("btn-refresh-remote");
      btn?.classList.add("spinning");
      await refreshRemotePlugins();
      setTimeout(() => btn?.classList.remove("spinning"), 600);
    });

  // Install from ZIP
  document
    .getElementById("btn-install-zip")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById(
        "btn-install-zip",
      ) as HTMLButtonElement;
      const originalContent = btn.innerHTML;

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Instalando...`;

      try {
        const result = await window.arduino.installLocalPlugin();

        if (result.canceled) {
          btn.disabled = false;
          btn.innerHTML = originalContent;
          return;
        }

        if (result.success) {
          alert("Plugin instalado correctamente.");
          await refreshPlugins();

          // Switch to "Installed" tab
          const installedTab = document.querySelector(
            '[data-tab="installed"]',
          ) as HTMLElement;
          installedTab?.click();

          if (result.id) selectPlugin(result.id);
        } else {
          alert(`Error al instalar el plugin: ${result.error}`);
        }
      } catch (err: any) {
        alert(`Error crítico: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
      }
    });
  window.arduino.onPluginsChanged(async () => {
    await refreshPlugins();
  });

  // Load plugins
  await refreshPlugins();
}

async function refreshPlugins() {
  allPlugins = await window.arduino.getPlugins();
  renderPluginList();
}

async function refreshRemotePlugins() {
  const container = document.getElementById("remote-list");
  if (container)
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 12px;">Cargando repositorio...</div>`;

  try {
    remotePlugins = await window.arduino.getRemotePlugins();
    renderRemoteList(
      (document.getElementById("remote-search") as HTMLInputElement)?.value ||
        "",
    );
  } catch (err) {
    if (container)
      container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--red); font-size: 12px;">Error al cargar el repositorio</div>`;
  }
}

function getTagQuery(input: HTMLInputElement): { query: string; start: number } | null {
  const val = input.value;
  const cursor = input.selectionStart ?? val.length;
  const before = val.slice(0, cursor);
  const hashIdx = before.lastIndexOf('#');
  if (hashIdx === -1) return null;
  const fragment = before.slice(hashIdx + 1);
  if (/\s/.test(fragment)) return null;
  return { query: fragment, start: hashIdx };
}

function applyTagSuggestion(input: HTMLInputElement, tag: string, start: number): void {
  const cursor = input.selectionStart ?? input.value.length;
  input.value = input.value.slice(0, start) + '#' + tag + ' ' + input.value.slice(cursor);
  const newCursor = start + 1 + tag.length + 1;
  input.setSelectionRange(newCursor, newCursor);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function renderTagSuggest(
  suggestEl: HTMLElement,
  query: string,
  availableTags: string[],
  onSelect: (tag: string) => void,
): void {
  const matches = availableTags.filter((t) =>
    t.toLowerCase().startsWith(query.toLowerCase()),
  );
  if (matches.length === 0) {
    suggestEl.style.display = 'none';
    suggestEl.innerHTML = '';
    return;
  }
  suggestEl.style.display = 'block';
  suggestEl.innerHTML = matches
    .map(
      (t) =>
        `<div class="tag-suggest-item" data-tag="${t}"><span class="tag-suggest-prefix">#</span>${t}</div>`,
    )
    .join('');
  suggestEl.querySelectorAll('.tag-suggest-item').forEach((item) => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onSelect((item as HTMLElement).dataset.tag!);
    });
  });
}

function handleSuggestKeydown(e: KeyboardEvent, suggestEl: HTMLElement): boolean {
  if (suggestEl.style.display === 'none' || !suggestEl.style.display) return false;
  const items = Array.from(suggestEl.querySelectorAll('.tag-suggest-item'));
  const focusedIdx = items.findIndex((it) => it.classList.contains('focused'));

  if (e.key === 'Escape') {
    e.preventDefault();
    suggestEl.style.display = 'none';
    return true;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = Math.min(focusedIdx + 1, items.length - 1);
    items.forEach((it, i) => it.classList.toggle('focused', i === next));
    (items[next] as HTMLElement).scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = Math.max(focusedIdx - 1, 0);
    items.forEach((it, i) => it.classList.toggle('focused', i === prev));
    (items[prev] as HTMLElement).scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (e.key === 'Enter') {
    const focused = items[focusedIdx] as HTMLElement | undefined;
    if (focused) {
      e.preventDefault();
      focused.dispatchEvent(new MouseEvent('mousedown'));
      return true;
    }
  }
  return false;
}

function parseSearchInput(value: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const text = value
    .replace(/#(\w+)/g, (_, tag) => { tags.push(tag.toLowerCase()); return ''; })
    .trim();
  return { text, tags };
}


function renderPluginList(rawFilterText = "") {
  const container = document.getElementById("plugin-list");
  if (!container) return;

  const statusFilter =
    (document.getElementById("filter-installed-status") as HTMLSelectElement)
      ?.value || "all";

  const { text: filterText, tags: inlineTags } = parseSearchInput(rawFilterText);
  const effectiveTag = inlineTags[0] ?? null;

  const filtered = allPlugins.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(filterText.toLowerCase()) ||
      (p.author || "").toLowerCase().includes(filterText.toLowerCase());

    let matchesStatus = true;
    if (statusFilter === "active") matchesStatus = p.enabled === true;
    if (statusFilter === "disabled") matchesStatus = p.enabled === false;

    const matchesTag = !effectiveTag || (p.tags || []).includes(effectiveTag);

    return matchesSearch && matchesStatus && matchesTag;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 12px;">No se encontraron plugins</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((p) => {
      const tagsHtml =
        p.tags && p.tags.length > 0
          ? `<div class="plugin-item-tags">${p.tags.map((t) => `<span class="plugin-tag">${t}</span>`).join("")}</div>`
          : "";
      return `
    <div class="plugin-item ${p.id === selectedPluginId ? "active" : ""} ${!p.enabled ? "plugin-item-disabled" : ""}" data-id="${p.id}">
      <div class="plugin-item-icon">${p.icon || "🧩"}</div>
      <div class="plugin-item-info">
        <div class="plugin-item-name">${p.name}</div>
        <div class="plugin-item-meta">v${p.version} • ${p.enabled ? "Activo" : "Inactivo"}</div>
        ${tagsHtml}
      </div>
    </div>
  `;
    })
    .join("");

  container.querySelectorAll(".plugin-item").forEach((item) => {
    item.addEventListener("click", () => {
      const id = (item as HTMLElement).dataset.id;
      if (id) selectPlugin(id);
    });
  });
}

function renderRemoteList(rawFilterText = "") {
  const container = document.getElementById("remote-list");
  if (!container) return;

  const statusFilter =
    (document.getElementById("filter-remote-status") as HTMLSelectElement)
      ?.value || "all";

  const { text: filterText, tags: inlineTags } = parseSearchInput(rawFilterText);
  const effectiveTag = inlineTags[0] ?? null;

  const filtered = remotePlugins.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(filterText.toLowerCase()) ||
      (p.author || "").toLowerCase().includes(filterText.toLowerCase()) ||
      (p.description || "").toLowerCase().includes(filterText.toLowerCase());

    const isInstalled = allPlugins.some((ap) => ap.id === p.id);
    let matchesStatus = true;
    if (statusFilter === "installed") matchesStatus = isInstalled;
    if (statusFilter === "not-installed") matchesStatus = !isInstalled;

    const matchesTag = !effectiveTag || (p.tags || []).includes(effectiveTag);

    return matchesSearch && matchesStatus && matchesTag;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 12px;">No se encontraron plugins</div>`;
    return;
  }

  container.innerHTML = filtered
    .map((p) => {
      const isInstalled = allPlugins.some((ap) => ap.id === p.id);
      const tagsHtml =
        p.tags && p.tags.length > 0
          ? `<div class="plugin-item-tags">${p.tags.map((t) => `<span class="plugin-tag">${t}</span>`).join("")}</div>`
          : "";
      return `
          <div class="plugin-item ${p.id === selectedRemoteId ? "active" : ""} ${p.isVerified ? "plugin-item-verified" : ""} ${isInstalled ? "plugin-item-installed" : ""}" data-id="${p.id}">
            <div class="plugin-item-icon">${p.icon || "🧩"}</div>
            <div class="plugin-item-info">
              <div class="plugin-item-name">
                ${formatDisplayName(p.name, p.id)}
                ${p.isVerified ? '<span class="verified-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ""}
              </div>
              <div class="plugin-item-meta">v${p.version} • ${isInstalled ? "Ya instalado" : p.author || "Anónimo"}</div>
              ${tagsHtml}
            </div>
          </div>
        `;
    })
    .join("");

  container.querySelectorAll(".plugin-item").forEach((item) => {
    item.addEventListener("click", () => {
      const id = (item as HTMLElement).dataset.id;
      if (id) selectRemotePlugin(id);
    });
  });
}

async function selectPlugin(id: string) {
  selectedPluginId = id;
  const searchVal =
    (document.getElementById("plugin-search") as HTMLInputElement)?.value || "";
  renderPluginList(searchVal);

  const plugin = allPlugins.find((p) => p.id === id);
  const container = document.getElementById("plugin-details");
  if (!container || !plugin) return;

  container.innerHTML = `
    <div class="plugin-detail-header">
      <div class="plugin-large-icon">${renderIconHtml(plugin.icon)}</div>
      <div class="plugin-header-info">
        <h1 class="plugin-title">${plugin.name}</h1>
        <div class="plugin-author-version">
          Versión <span style="color:var(--text)">${plugin.version}</span> • 
          Por <span class="plugin-author">${plugin.author || "Anónimo"}</span>
        </div>
        <div class="plugin-actions">
          <button class="btn ${plugin.enabled ? "btn-outline" : "btn-primary"}" id="btn-toggle-plugin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
            ${plugin.enabled ? "Deshabilitar" : "Habilitar"}
          </button>
          <button class="btn btn-outline" id="btn-config-plugin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            Config
          </button>
          <button class="btn btn-outline btn-danger" id="btn-delete-plugin">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
            Eliminar
          </button>
        </div>
      </div>
    </div>
    <div class="readme-container" id="readme-content">
      <div style="color: var(--muted); font-size: 13px;">Cargando descripción...</div>
    </div>
  `;

  // Load README
  try {
    const readme = await window.arduino.readPluginReadme(id);
    const readmeEl = document.getElementById("readme-content");
    if (readmeEl) {
      if (readme) {
        // @ts-ignore
        const html = DOMPurify.sanitize(marked.parse(readme));
        readmeEl.innerHTML = html;
      } else {
        readmeEl.innerHTML = `<div style="color: var(--muted); text-align: center; padding: 20px;">No tiene descripción (README.md no encontrado)</div>`;
      }
    }
  } catch (e) {
    console.error("Error loading README:", e);
  }

  // Toggle Action
  document
    .getElementById("btn-toggle-plugin")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById(
        "btn-toggle-plugin",
      ) as HTMLButtonElement;
      btn.disabled = true;
      const newState = !plugin.enabled;
      const result = await window.arduino.togglePlugin({
        id: plugin.id,
        enabled: newState,
      });

      if (result.success) {
        await refreshPlugins();
        selectPlugin(plugin.id);
      } else {
        alert(`Error: ${result.error}`);
        btn.disabled = false;
      }
    });

  document
    .getElementById("btn-config-plugin")
    ?.addEventListener("click", () => {
      alert("Este plugin no tiene configuraciones adicionales.");
    });
  document
    .getElementById("btn-delete-plugin")
    ?.addEventListener("click", async () => {
      if (
        !confirm(
          `¿Eliminar el plugin "${plugin.name}"? Esta acción no se puede deshacer.\n\nTodos los bloques de este plugin en tus workflows se convertirán en notas descriptivas.`,
        )
      )
        return;

      const btn = document.getElementById(
        "btn-delete-plugin",
      ) as HTMLButtonElement;
      btn.disabled = true;

      const result = await window.arduino.deletePlugin(plugin.id);
      if (result.success) {
        await refreshPlugins();
        selectedPluginId = null;
        const details = document.getElementById("plugin-details");
        if (details) {
          details.innerHTML = `<div class="empty-state"><div class="empty-icon">🧩</div><p>Seleccioná un plugin para ver los detalles</p></div>`;
        }
      } else {
        alert(`Error al eliminar el plugin: ${result.error}`);
        btn.disabled = false;
      }
    });
}

async function selectRemotePlugin(id: string) {
  selectedRemoteId = id;
  renderRemoteList(
    (document.getElementById("remote-search") as HTMLInputElement)?.value || "",
  );

  const plugin = remotePlugins.find((p) => p.id === id);
  const container = document.getElementById("remote-details");
  if (!container || !plugin) return;

  const isInstalled = allPlugins.some((p) => p.id === plugin.id);

  container.innerHTML = `
    <div class="plugin-detail-header">
      <div class="plugin-large-icon">${renderIconHtml(plugin.icon)}</div>
      <div class="plugin-header-info">
        <h1 class="plugin-title">
          ${formatDisplayName(plugin.name, plugin.id)}
          ${plugin.isVerified ? '<span class="verified-badge" title="Verificado"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' : ""}
        </h1>
        <div class="plugin-author-version">
          v${plugin.version} • Por <span class="plugin-author">${plugin.author || "Anónimo"}</span>
        </div>
        
        <div class="plugin-stats-row">
          <div class="stat-item">
            <span class="stat-icon">📥</span>
            ${plugin.downloads} instalaciones
          </div>
          <div class="stat-item">
            <span class="stat-icon">📅</span>
            Actualizado: ${new Date(plugin.updatedAt).toLocaleDateString()}
          </div>
        </div>

        <div class="plugin-actions">
          ${
            isInstalled
              ? `
            <button class="btn btn-outline" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Instalado
            </button>
          `
              : `
            <button class="btn btn-install" id="btn-install-plugin">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Instalar Plugin
            </button>
          `
          }
        </div>
        <div id="install-status"></div>
      </div>
    </div>
    <div class="readme-container">
      <h3>Descripción</h3>
      <p>${plugin.description || "Sin descripción disponible."}</p>
      
      <div style="margin-top: 24px; padding: 16px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px dashed var(--border);">
        <h4 style="margin: 0 0 8px 0; font-size: 13px; color: var(--amber);">Información de Seguridad</h4>
        <p style="margin: 0; font-size: 12px; color: var(--muted);">
          ${
            plugin.isVerified
              ? "Este plugin ha sido verificado por el equipo de PokePad y es seguro de usar."
              : "Este plugin es proporcionado por la comunidad. Asegúrate de confiar en el autor antes de instalarlo."
          }
        </p>
      </div>
    </div>
  `;

  document
    .getElementById("btn-install-plugin")
    ?.addEventListener("click", async () => {
      const btn = document.getElementById(
        "btn-install-plugin",
      ) as HTMLButtonElement;
      const status = document.getElementById("install-status");
      if (!btn || !status) return;

      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Instalando...`;
      status.innerHTML = `
      <div class="install-progress">
        <div class="install-progress-bar" style="width: 50%"></div>
      </div>
    `;

      try {
        const result = await window.arduino.installRemotePlugin({
          id: plugin.id,
          downloadUrl: plugin.downloadUrl,
        });

        if (result.success) {
          status.innerHTML = `<div style="color: var(--amber); font-size: 12px; margin-top: 8px; font-weight: 700;">¡Instalación completada!</div>`;
          btn.innerHTML = `Completado`;

          // Refresh local list
          await refreshPlugins();
          // Refresh remote list to show "Installed" badge
          renderRemoteList(
            (document.getElementById("remote-search") as HTMLInputElement)
              ?.value || "",
          );

          // Update current view to show "Installed"
          setTimeout(() => selectRemotePlugin(id), 1500);
        } else {
          throw new Error(result.error || "Error desconocido");
        }
      } catch (err: any) {
        btn.disabled = false;
        btn.innerHTML = `Reintentar Instalación`;
        status.innerHTML = `<div style="color: var(--red); font-size: 12px; margin-top: 8px;">Error: ${err.message}</div>`;
      }
    });
}

document.addEventListener("DOMContentLoaded", init);
