const { app, shell, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

const BUILTIN_THEMES_DIR = path.join(__dirname, "..", "assets", "themes");
const USER_THEMES_DIR = path.join(app.getPath("userData"), "themes");

function ensureUserThemesDir() {
  if (!fs.existsSync(USER_THEMES_DIR)) {
    fs.mkdirSync(USER_THEMES_DIR, { recursive: true });
  }

  // Copiar archivos de ejemplo si no existen
  const examples = ["template-example.json", "README.md"];
  examples.forEach(file => {
    const src = path.join(BUILTIN_THEMES_DIR, file);
    const dest = path.join(USER_THEMES_DIR, file);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      try {
        fs.copyFileSync(src, dest);
      } catch (e) {
        console.error("Error copying example theme file:", file, e);
      }
    }
  });
}

function getThemeList() {
  ensureUserThemesDir();
  const themes = [];

  // Load builtin
  if (fs.existsSync(BUILTIN_THEMES_DIR)) {
    const builtinFiles = fs.readdirSync(BUILTIN_THEMES_DIR);
    builtinFiles.forEach((file) => {
      if (file.endsWith(".json")) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(BUILTIN_THEMES_DIR, file), "utf-8"));
          themes.push({
            id: content.id,
            name: content.name,
            type: content.type,
            isUserTheme: false,
            path: path.join(BUILTIN_THEMES_DIR, file),
          });
        } catch (e) {
          console.error("Error loading builtin theme:", file, e);
        }
      }
    });
  }

  // Load user themes
  const userFiles = fs.readdirSync(USER_THEMES_DIR);
  userFiles.forEach((file) => {
    if (file.endsWith(".json")) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(USER_THEMES_DIR, file), "utf-8"));
        themes.push({
          id: content.id,
          name: content.name,
          type: content.type,
          isUserTheme: true,
          path: path.join(USER_THEMES_DIR, file),
        });
      } catch (e) {
        console.error("Error loading user theme:", file, e);
      }
    }
  });

  return themes;
}

function getThemeData(themeId) {
  const list = getThemeList();
  const themeInfo = list.find((t) => t.id === themeId);
  if (!themeInfo) return null;

  try {
    return JSON.parse(fs.readFileSync(themeInfo.path, "utf-8"));
  } catch (e) {
    console.error("Error reading theme data:", themeId, e);
    return null;
  }
}

function openThemesFolder() {
  ensureUserThemesDir();
  shell.openPath(USER_THEMES_DIR);
}

// ── Theme Converter ──

function hexNormalize(color) {
  if (!color || typeof color !== "string") return null;
  const s = color.trim().replace(/^['"]|['"]$/g, "");
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    return "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s;
  if (/^#[0-9A-Fa-f]{8}$/.test(s)) return s.slice(0, 7); // strip alpha
  // 0x prefix
  const m = s.match(/^0x([0-9A-Fa-f]{6})$/i);
  if (m) return "#" + m[1];
  return null;
}

function toRgba(hex, alpha) {
  const h = hexNormalize(hex);
  if (!h) return null;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Minimal YAML parser — handles up to 3 levels of nesting, key: value pairs.
 * No arrays, no multi-line values, no anchors. Enough for terminal theme files.
 */
function parseMinimalYaml(content) {
  const result = {};
  const lines = content.split(/\r?\n/);
  // Stack entries: { obj, indent }
  const stack = [{ obj: result, indent: -1 }];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.match(/^(\s*)/)[1].length;
    const trimmed = line.trim();
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();
    // Strip inline comment
    const commentIdx = value.search(/\s+#/);
    if (commentIdx !== -1) value = value.slice(0, commentIdx).trim();
    // Strip quotes
    value = value.replace(/^['"]|['"]$/g, "");

    // Pop stack to find parent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1].obj;

    if (!value) {
      parent[key] = {};
      stack.push({ obj: parent[key], indent });
    } else {
      parent[key] = value;
    }
  }
  return result;
}

/**
 * Minimal TOML parser — handles [section.path] headers and key = "value" pairs.
 * Enough for Alacritty TOML and similar terminal theme files.
 */
function parseMinimalToml(content) {
  const result = {};
  const lines = content.split(/\r?\n/);
  let currentPath = [];

  const getOrCreate = (obj, keys) => {
    let cur = obj;
    for (const k of keys) {
      if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
      cur = cur[k];
    }
    return cur;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    // Section header: [colors.primary] or [[colors.primary]]
    const sectionMatch = line.match(/^\[+([^\]]+)\]+$/);
    if (sectionMatch) {
      currentPath = sectionMatch[1].split(".").map(s => s.trim());
      getOrCreate(result, currentPath);
      continue;
    }

    // key = value
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let raw = line.slice(eqIdx + 1).trim();

    // Extract value: handle quoted strings, strip inline comments outside quotes
    let value;
    const quoted = raw.match(/^["'](.*)["']$/);
    if (quoted) {
      value = quoted[1];
    } else {
      const commentIdx = raw.indexOf("#");
      if (commentIdx !== -1) raw = raw.slice(0, commentIdx).trim();
      value = raw;
    }

    const target = getOrCreate(result, currentPath);
    target[key] = value;
  }
  return result;
}

/**
 * Derive a color by blending hex toward white (dark themes) or black (light themes).
 * amount: 0..1 — how much to blend
 */
function blendHex(hex, amount, isDark) {
  const h = hexNormalize(hex);
  if (!h) return null;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  const target = isDark ? 255 : 0;
  const nr = Math.round(r + (target - r) * amount);
  const ng = Math.round(g + (target - g) * amount);
  const nb = Math.round(b + (target - b) * amount);
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

/**
 * Fill missing surface/border/muted vars by deriving from --bg and --text.
 * Applied after all format-specific converters so it works for VSCode, Alacritty, and flat.
 */
function fillMissingVars(colors, type) {
  const isDark = type !== "light";
  const bg   = colors["--bg"];
  const text = colors["--text"];

  const set = (key, value) => { if (!colors[key] && value) colors[key] = value; };

  // Surfaces — progressively lighter (dark) or darker (light) than bg
  set("--surface",  blendHex(bg, isDark ? 0.06 : 0.04, isDark));
  set("--surface2", blendHex(bg, isDark ? 0.11 : 0.08, isDark));
  set("--surface3", blendHex(bg, isDark ? 0.17 : 0.13, isDark));

  // Borders — between bg and surface3
  set("--border",  blendHex(bg, isDark ? 0.20 : 0.17, isDark));
  set("--border2", blendHex(bg, isDark ? 0.30 : 0.25, isDark));

  // Muted text — midpoint between text and bg
  if (text && bg) {
    const th = hexNormalize(text);
    const bh = hexNormalize(bg);
    if (th && bh) {
      const mid = (a, b) => Math.round((a + b) / 2);
      const mix = (t, b, f) => Math.round(t + (b - t) * f);
      const tr = parseInt(th.slice(1,3), 16), tg = parseInt(th.slice(3,5), 16), tb = parseInt(th.slice(5,7), 16);
      const br = parseInt(bh.slice(1,3), 16), bg2 = parseInt(bh.slice(3,5), 16), bb = parseInt(bh.slice(5,7), 16);
      const toHex = (r, g, b) => `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
      set("--muted",  toHex(mix(tr,br,0.45), mix(tg,bg2,0.45), mix(tb,bb,0.45)));
      set("--muted2", toHex(mix(tr,br,0.65), mix(tg,bg2,0.65), mix(tb,bb,0.65)));
    }
  }
}

function pickHex(colorsObj, ...tokens) {
  for (const t of tokens) {
    if (!t) continue;
    const v = hexNormalize(colorsObj[t]);
    if (v) return v;
  }
  return null;
}

function buildColorEntry(result, varName, hex) {
  if (!hex) return;
  result[varName] = hex;
  result[`${varName}-bg`] = toRgba(hex, 0.12);
}

function convertVscodeTheme(data) {
  const c = data.colors || {};
  const pick = (...tokens) => pickHex(c, ...tokens);

  const colors = {};
  const v = (k, ...tokens) => { const h = pick(...tokens); if (h) colors[k] = h; };

  v("--bg",       "editor.background");
  v("--surface",  "sideBar.background", "panel.background", "activityBar.background");
  v("--surface2", "editorGroupHeader.tabsBackground", "tab.inactiveBackground", "titleBar.activeBackground");
  v("--surface3", "tab.activeBackground", "list.hoverBackground");
  v("--border",   "panel.border", "editorGroup.border", "tab.border", "editorGroupHeader.border");
  v("--border2",  "input.border", "focusBorder");
  v("--text",     "editor.foreground", "foreground");
  v("--muted",    "sideBar.foreground", "tab.inactiveForeground", "descriptionForeground");
  v("--muted2",   "editorLineNumber.foreground");

  buildColorEntry(colors, "--green",  pick("gitDecoration.addedResourceForeground", "terminal.ansiGreen", "terminal.ansiBrightGreen", "notificationsSuccessIcon.foreground"));
  buildColorEntry(colors, "--red",    pick("errorForeground", "gitDecoration.deletedResourceForeground", "terminal.ansiRed", "notificationsErrorIcon.foreground"));
  buildColorEntry(colors, "--blue",   pick("textLink.foreground", "terminal.ansiBlue", "terminal.ansiBrightBlue"));
  buildColorEntry(colors, "--purple", pick("terminal.ansiMagenta", "terminal.ansiBrightMagenta"));
  buildColorEntry(colors, "--pink",   pick("terminal.ansiBrightMagenta", "terminal.ansiMagenta"));
  buildColorEntry(colors, "--teal",   pick("terminal.ansiCyan", "terminal.ansiBrightCyan"));
  buildColorEntry(colors, "--orange", pick("editorWarning.foreground", "terminal.ansiYellow", "notificationsWarningIcon.foreground"));

  return { colors, type: data.type || "dark" };
}

function convertAlacrittyTheme(data) {
  // Alacritty: data.colors.primary.{background,foreground}, data.colors.normal.{red,green,...}
  const c = data.colors || data; // support both `{ colors: ... }` and direct `{ primary: ..., normal: ... }`
  const primary = c.primary || {};
  const normal  = c.normal  || {};
  const bright  = c.bright  || {};

  const pickNB = (...keys) => {
    for (const k of keys) {
      const v = hexNormalize(normal[k]) || hexNormalize(bright[k]);
      if (v) return v;
    }
    return null;
  };

  const colors = {};
  const bg   = hexNormalize(primary.background);
  const text = hexNormalize(primary.foreground);
  if (bg)   colors["--bg"]   = bg;
  if (text) colors["--text"] = text;

  buildColorEntry(colors, "--red",    pickNB("red"));
  buildColorEntry(colors, "--green",  pickNB("green"));
  buildColorEntry(colors, "--blue",   pickNB("blue"));
  buildColorEntry(colors, "--purple", pickNB("magenta"));
  buildColorEntry(colors, "--teal",   pickNB("cyan"));
  buildColorEntry(colors, "--orange", hexNormalize(bright.yellow) || hexNormalize(normal.yellow));

  return { colors, type: "dark" };
}

function convertFlatTheme(data) {
  // Windows Terminal / generic flat scheme: { background, foreground, red, green, ... }
  const pick = (...keys) => pickHex(data, ...keys);
  const colors = {};
  const bg   = pick("background", "Background");
  const text = pick("foreground", "Foreground");
  if (bg)   colors["--bg"]   = bg;
  if (text) colors["--text"] = text;

  buildColorEntry(colors, "--red",    pick("red", "brRed", "brightRed"));
  buildColorEntry(colors, "--green",  pick("green", "brGreen", "brightGreen"));
  buildColorEntry(colors, "--blue",   pick("blue", "brBlue", "brightBlue"));
  buildColorEntry(colors, "--purple", pick("purple", "magenta", "brMagenta", "brightMagenta"));
  buildColorEntry(colors, "--teal",   pick("cyan", "brCyan", "brightCyan"));
  buildColorEntry(colors, "--orange", pick("orange", "yellow", "brYellow", "brightYellow"));

  return { colors, type: "dark" };
}

function detectAndConvert(data) {
  let result;

  // VSCode: has .colors object with dot-separated token names
  if (data.colors && typeof data.colors === "object") {
    const keys = Object.keys(data.colors);
    if (keys.some(k => k.includes("."))) {
      result = convertVscodeTheme(data);
    } else if (data.colors.primary || data.colors.normal) {
      // Alacritty nested: colors.primary / colors.normal
      result = convertAlacrittyTheme(data);
    } else if (data.colors.background || data.colors.foreground) {
      // Flat inside colors key
      result = convertFlatTheme(data.colors);
    }
  }

  if (!result) {
    if (data.primary || data.normal) {
      // Alacritty at root without colors wrapper
      result = convertAlacrittyTheme(data);
    } else if (data.background || data.foreground) {
      // Flat at root
      result = convertFlatTheme(data);
    }
  }

  if (!result) {
    throw new Error("Formato de tema no reconocido. Se esperaba VSCode JSON, Alacritty YAML/TOML u otro esquema de colores estándar.");
  }

  fillMissingVars(result.colors, result.type);
  return result;
}

async function importExternalTheme() {
  const { getWindow } = require("./window");
  const win = getWindow();
  if (!win) return { ok: false, error: "No window" };

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: "Importar tema externo",
    filters: [{ name: "Tema (JSON / YAML / TOML)", extensions: ["json", "yaml", "yml", "toml"] }],
    properties: ["openFile"],
  });

  if (canceled || !filePaths.length) return { ok: false, error: "Cancelled" };

  try {
    const filePath = filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    const content = fs.readFileSync(filePath, "utf-8");

    let data;
    if (ext === ".yaml" || ext === ".yml") {
      data = parseMinimalYaml(content);
    } else if (ext === ".toml") {
      data = parseMinimalToml(content);
    } else {
      data = JSON.parse(content);
    }

    const rawName = data.name || path.basename(filePath, ext);
    const { colors, type } = detectAndConvert(data);

    if (Object.keys(colors).length < 2) {
      throw new Error("No se encontraron suficientes colores para convertir el tema.");
    }

    const baseId = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const themeId = `imported-${baseId}-${Date.now().toString(36)}`;

    const themeData = { id: themeId, name: rawName, type, colors };

    ensureUserThemesDir();
    const outPath = path.join(USER_THEMES_DIR, `${themeId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(themeData, null, 2), "utf-8");

    return { ok: true, theme: themeData };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getThemeList,
  getThemeData,
  openThemesFolder,
  importExternalTheme,
};
