import { app, ipcMain, webContents } from "electron";
import * as path from "path";
import * as fs from "fs";
import chokidar from "chokidar";
import log from "./logger";
import {
  PluginManifest,
  ExecutionContext,
  RemotePlugin,
} from "../src/types/pokepad";

/**
 * Plugin management system for PokePad's Main Process.
 * Handles discovery, loading, installation, and execution of local and remote plugins.
 */

const plugins: Map<string, { manifest: PluginManifest; execute: Function }> =
  new Map();

/**
 * Extracts a ZIP archive to a destination directory using platform-native commands.
 * @param zipPath Absolute path to the .zip file
 * @param destDir Absolute path to the destination folder
 */
function extractZip(zipPath: string, destDir: string): void {
  const { execSync } = require("child_process");
  if (process.platform === "win32") {
    execSync(
      `powershell -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force"`,
    );
  } else {
    execSync(`tar -xf "${zipPath}" -C "${destDir}"`);
  }
}

// Mock registry for development
const MOCK_REGISTRY: RemotePlugin[] = [];

/**
 * Returns the primary directory where user plugins are stored.
 * Ensures the directory exists before returning.
 */
export function getPluginsDir() {
  const dirs = [
    path.join(app.getPath("userData"), "plugins"),
    path.join(app.getAppPath(), "plugins"), // Local plugins
  ];

  dirs.forEach((d) => {
    if (!fs.existsSync(d)) {
      try {
        fs.mkdirSync(d, { recursive: true });
      } catch (e) {
        // May fail if appPath is read-only
      }
    }
  });

  return dirs[0]; // Return the main one for "open folder" action
}

/**
 * Scans the plugin directories and loads all valid plugins into memory.
 * Plugins are validated by checking for manifest.json and either index.js or UI extensions.
 */
export async function loadPlugins() {
  const pluginsDirs = [
    path.join(app.getAppPath(), "plugins"), // Built-ins first
    path.join(app.getPath("userData"), "plugins"), // User plugins override built-ins
  ];

  plugins.clear();

  for (const pluginsDir of pluginsDirs) {
    if (!fs.existsSync(pluginsDir)) continue;
    const items = fs.readdirSync(pluginsDir, { withFileTypes: true });

    for (const dir of items) {
      if (dir.isDirectory()) {
        const pluginPath = path.join(pluginsDir, dir.name);
        const manifestPath = path.join(pluginPath, "manifest.json");
        const scriptPath = path.join(pluginPath, "index.js");

        if (fs.existsSync(manifestPath)) {
          try {
            const manifestContent = fs.readFileSync(manifestPath, "utf-8");
            const manifest: PluginManifest = JSON.parse(manifestContent);
            manifest.id = manifest.id || dir.name;
            manifest.path = pluginPath;

            // Default to enabled if not specified (legacy support)
            if (manifest.enabled === undefined) {
              manifest.enabled = true;
            }

            let execute: Function | null = null;
            if (fs.existsSync(scriptPath)) {
              delete require.cache[require.resolve(scriptPath)];
              const exported = require(scriptPath);
              execute = typeof exported === "function" ? exported : null;
            }

            // A plugin is valid if it has a background script OR a UI extension
            if (execute || manifest.ui) {
              plugins.set(manifest.id, {
                manifest,
                execute: execute || (() => {}),
              });
              log.info(
                `Plugin loaded: ${manifest.name} (${manifest.id}) [${manifest.enabled ? "ACTIVE" : "DISABLED"}]`,
              );
            } else {
              log.warn(
                `Plugin ${dir.name} has neither index.js nor UI extension.`,
              );
            }
          } catch (err) {
            log.error(`Failed to load plugin in ${dir.name}:`, err);
          }
        }
      }
    }
  }
}

/**
 * Returns an array of manifests for all currently loaded plugins.
 */
export function getLoadedPlugins(): PluginManifest[] {
  return Array.from(plugins.values()).map((p) => p.manifest);
}

/**
 * Notifies all renderer windows that the list of plugins has changed.
 */
function broadcastPluginsChanged() {
  const pluginList = getLoadedPlugins();
  webContents.getAllWebContents().forEach((wc) => {
    wc.send("plugins-changed", pluginList);
  });
}

/**
 * Executes a plugin's background logic.
 * @param pluginId The ID of the plugin to execute
 * @param params The parameters configured for this specific step instance
 * @param context The current execution context (variables, etc.)
 */
export async function executePlugin(
  pluginId: string,
  params: any,
  context: ExecutionContext,
) {
  const plugin = plugins.get(pluginId);
  if (!plugin || !plugin.manifest.enabled) {
    throw new Error(`Plugin not found or is disabled: ${pluginId}`);
  }

  if (!plugin.execute) {
    throw new Error(`Plugin has no execution logic: ${pluginId}`);
  }

  // Inject some utils if needed
  const utils = {
    log: (msg: string) => log.info(`[Plugin:${pluginId}] ${msg}`),
    error: (msg: string) => log.error(`[Plugin:${pluginId}] ${msg}`),
  };

  try {
    await plugin.execute(params, context, utils);
  } catch (err: any) {
    log.error(`Error executing plugin ${pluginId}:`, err);
    throw err;
  }
}

/**
 * Registers all IPC handlers related to plugin management.
 */
export function setupPlugins() {
  ipcMain.handle("get-plugins", async () => {
    return getLoadedPlugins();
  });

  ipcMain.handle("reload-plugins", async () => {
    await loadPlugins();
    broadcastPluginsChanged();
    return getLoadedPlugins();
  });

  ipcMain.handle("toggle-plugin", async (_event, { id, enabled }) => {
    const plugin = plugins.get(id);
    if (!plugin) return { success: false, error: "Plugin not found" };

    try {
      plugin.manifest.enabled = enabled;
      const manifestPath = path.join(plugin.manifest.path!, "manifest.json");
      const currentContent = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      currentContent.enabled = enabled;
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(currentContent, null, 2),
        "utf-8",
      );

      log.info(`Plugin ${id} ${enabled ? "enabled" : "disabled"}`);
      broadcastPluginsChanged();
      return { success: true };
    } catch (err: any) {
      log.error(`Failed to toggle plugin ${id}:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("delete-plugin", async (_event, id: string) => {
    const plugin = plugins.get(id);
    if (!plugin || !plugin.manifest.path) {
      return { success: false, error: "Plugin no encontrado" };
    }

    const userPluginsDir = path.join(app.getPath("userData"), "plugins");
    const builtinPluginsDir = path.join(app.getAppPath(), "plugins");
    const pluginPath = plugin.manifest.path;

    if (
      !pluginPath.startsWith(userPluginsDir) &&
      !pluginPath.startsWith(builtinPluginsDir)
    ) {
      return { success: false, error: "Ruta de plugin no válida" };
    }

    try {
      fs.rmSync(pluginPath, { recursive: true, force: true });
      await loadPlugins();
      broadcastPluginsChanged();
      log.info(`Plugin ${id} deleted`);
      return { success: true };
    } catch (err: any) {
      log.error(`Failed to delete plugin ${id}:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("open-plugins-folder", () => {
    const { shell } = require("electron");
    shell.openPath(getPluginsDir());
  });

  ipcMain.handle("read-plugin-readme", async (_event, pluginId: string) => {
    const plugin = plugins.get(pluginId);
    if (!plugin || !plugin.manifest.path) return null;

    const readmePath = path.join(plugin.manifest.path, "README.md");
    if (fs.existsSync(readmePath)) {
      try {
        return fs.readFileSync(readmePath, "utf-8");
      } catch (err) {
        log.error(`Error reading README for plugin ${pluginId}:`, err);
        return null;
      }
    }
    return null;
  });

  ipcMain.handle(
    "read-plugin-asset",
    async (_event, { pluginId, assetPath }) => {
      const plugin = plugins.get(pluginId);
      if (!plugin || !plugin.manifest.path) return null;

      // Security: Prevent directory traversal
      const safePath = path.join(
        plugin.manifest.path,
        path.normalize(assetPath).replace(/^(\.\.[\/\\])+/, ""),
      );

      if (
        fs.existsSync(safePath) &&
        safePath.startsWith(plugin.manifest.path)
      ) {
        try {
          return fs.readFileSync(safePath, "utf-8");
        } catch (err) {
          log.error(
            `Error reading asset ${assetPath} for plugin ${pluginId}:`,
            err,
          );
          return null;
        }
      }
      return null;
    },
  );

  ipcMain.handle("get-remote-plugins", async () => {
    try {
      const REGISTRY_URL =
        "https://raw.githubusercontent.com/GonzaBena/Pokepad_plugins/master/registry.json";

      // Cache busting with timestamp
      const response = await fetch(`${REGISTRY_URL}?t=${Date.now()}`);
      if (!response.ok)
        throw new Error("No se pudo obtener el registro de plugins");

      return await response.json();
    } catch (err) {
      log.error("Error fetching remote plugins:", err);
      // Fallback a mock para desarrollo si falla la red
      return MOCK_REGISTRY;
    }
  });

  ipcMain.handle(
    "install-remote-plugin",
    async (_event, { id, downloadUrl }) => {
      log.info(`Install requested for ${id} from ${downloadUrl}`);

      try {
        const pluginsDir = getPluginsDir();
        const tempZipPath = path.join(app.getPath("temp"), `${id}.zip`);
        const tempExtractDir = path.join(
          app.getPath("temp"),
          `extract_${id}_${Date.now()}`,
        );
        const targetDir = path.join(pluginsDir, id);

        // 1. Download
        const response = await fetch(downloadUrl);
        if (!response.ok)
          throw new Error(`Failed to download: ${response.statusText}`);

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(tempZipPath, buffer);

        // 2. Extract to temp
        if (!fs.existsSync(tempExtractDir)) {
          fs.mkdirSync(tempExtractDir, { recursive: true });
        }
        extractZip(tempZipPath, tempExtractDir);

        // 3. Find content (handle single root folder)
        let pluginContentDir = tempExtractDir;
        let manifestPath = path.join(pluginContentDir, "manifest.json");

        if (!fs.existsSync(manifestPath)) {
          const items = fs.readdirSync(tempExtractDir, { withFileTypes: true });
          const dirs = items.filter((i) => i.isDirectory());
          if (dirs.length === 1) {
            pluginContentDir = path.join(tempExtractDir, dirs[0].name);
            manifestPath = path.join(pluginContentDir, "manifest.json");
          }
        }

        if (!fs.existsSync(manifestPath)) {
          throw new Error("No se encontró manifest.json en el plugin descargado");
        }

        // 4. Set initial state to disabled and enforce correct ID in the manifest
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        manifest.enabled = false;
        manifest.id = id; // Force ID to match registry
        fs.writeFileSync(
          manifestPath,
          JSON.stringify(manifest, null, 2),
          "utf-8",
        );

        // 5. Move to final destination
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
        fs.renameSync(pluginContentDir, targetDir);

        // 6. Cleanup
        fs.unlinkSync(tempZipPath);
        if (fs.existsSync(tempExtractDir)) {
          fs.rmSync(tempExtractDir, { recursive: true, force: true });
        }

        // 7. Reload
        await loadPlugins();
        broadcastPluginsChanged();

        log.info(`Successfully installed plugin ${id}`);
        return { success: true };
      } catch (err: any) {
        log.error(`Failed to install plugin ${id}:`, err);
        return { success: false, error: err.message };
      }    },
  );

  ipcMain.handle("install-local-plugin", async () => {
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Zip files", extensions: ["zip"] }],
    });

    if (result.canceled || result.filePaths.length === 0)
      return { canceled: true };

    const zipPath = result.filePaths[0];
    const tempId = `temp_${Date.now()}`;
    const tempExtractDir = path.join(app.getPath("temp"), tempId);

    try {
      if (!fs.existsSync(tempExtractDir)) {
        fs.mkdirSync(tempExtractDir, { recursive: true });
      }

      extractZip(zipPath, tempExtractDir);

      // Validation logic
      let manifestPath = path.join(tempExtractDir, "manifest.json");
      let scriptPath = path.join(tempExtractDir, "index.js");
      let pluginContentDir = tempExtractDir;

      // Handle the case where the ZIP contains a single folder wrapping everything
      if (!fs.existsSync(manifestPath)) {
        const items = fs.readdirSync(tempExtractDir, { withFileTypes: true });
        const dirs = items.filter((i) => i.isDirectory());
        if (dirs.length === 1) {
          pluginContentDir = path.join(tempExtractDir, dirs[0].name);
          manifestPath = path.join(pluginContentDir, "manifest.json");
          scriptPath = path.join(pluginContentDir, "index.js");
        }
      }

      if (!fs.existsSync(manifestPath))
        throw new Error("No se encontró manifest.json en el ZIP.");
      if (!fs.existsSync(scriptPath))
        throw new Error("No se encontró index.js en el ZIP.");

      const manifest: PluginManifest = JSON.parse(
        fs.readFileSync(manifestPath, "utf-8"),
      );
      if (!manifest.id || !manifest.name || !manifest.version) {
        throw new Error(
          "El manifest.json debe contener 'id', 'name' y 'version'.",
        );
      }

      // Ensure disabled state on local install
      manifest.enabled = false;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

      const finalPath = path.join(getPluginsDir(), manifest.id);
      if (fs.existsSync(finalPath)) {
        // Option: Prompt for overwrite or just overwrite. Overwriting for now.
        fs.rmSync(finalPath, { recursive: true, force: true });
      }

      fs.renameSync(pluginContentDir, finalPath);

      // Cleanup temp
      fs.rmSync(tempExtractDir, { recursive: true, force: true });

      await loadPlugins();
      broadcastPluginsChanged();
      return { success: true, id: manifest.id };
    } catch (err: any) {
      log.error("Failed to install local plugin:", err);
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }
      return { success: false, error: err.message };
    }
  });

  // Initial load deferred (Lazy Loading)
  setTimeout(() => {
    log.info("[plugins] Performing deferred initial load");
    loadPlugins().then(() => {
      broadcastPluginsChanged();
      setupPluginWatcher();
    });
  }, 2000);
}

function setupPluginWatcher() {
  const watchDirs = [
    path.join(app.getAppPath(), "plugins"),
    path.join(app.getPath("userData"), "plugins"),
  ].filter((d) => fs.existsSync(d));

  if (watchDirs.length === 0) return;

  let reloadTimeout: ReturnType<typeof setTimeout> | null = null;

  const watcher = chokidar.watch(watchDirs, {
    depth: 2,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  const scheduleReload = () => {
    if (reloadTimeout) clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(async () => {
      log.info("[plugins] Change detected, reloading plugins...");
      await loadPlugins();
      broadcastPluginsChanged();
    }, 500);
  };

  watcher.on("add", scheduleReload);
  watcher.on("change", scheduleReload);
  watcher.on("unlink", scheduleReload);
  watcher.on("addDir", scheduleReload);
  watcher.on("unlinkDir", scheduleReload);
}
