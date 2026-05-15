/**
 * Define una pestaña (Tab) de la interfaz principal de la aplicación.
 * Las pestañas aparecen en la barra lateral (Activity Bar) y cargan diferentes vistas.
 */
export interface TabDefinition {
  /** ID único de la pestaña (ej: 'workflows', 'config', 'plugins') */
  id: string;
  /** Etiqueta que aparece en el botón de la barra lateral al pasar el ratón */
  label: string;
  /** Icono opcional (puede ser un Emoji o una clase de icono) */
  icon?: string;
  /** Ruta relativa al archivo HTML que contiene el fragmento de la vista (ej: 'views/workflows.html') */
  viewPath: string;
  /** ID del contenedor DOM (div) donde se inyectará el contenido del HTML cargado */
  containerId: string;
  /** 
   * Función de inicialización opcional que se ejecuta una sola vez al cargar la aplicación.
   * Útil para configurar listeners globales o estados iniciales de la sección.
   */
  init?: () => void | Promise<void>;
  /** 
   * Función que se ejecuta cada vez que el usuario hace clic y activa esta pestaña.
   * Se utiliza para refrescar datos o reiniciar animaciones de la vista.
   */
  onActivate?: () => void | Promise<void>;
}

/**
 * Registro central de la Interfaz de Usuario (UI Registry).
 * Controla la navegación lateral y permite añadir nuevas secciones de forma modular,
 * tanto desde el núcleo de la app como mediante plugins con UI.
 */
class UIRegistry {
  private tabs: Map<string, TabDefinition> = new Map();
  private activeTabId: string | null = null;

  /** 
   * Registra una nueva pestaña en el sistema.
   * @param tab La definición de la pestaña a registrar.
   */
  registerTab(tab: TabDefinition) {
    this.tabs.set(tab.id, tab);
    console.log(`[UIRegistry] Pestaña registrada: ${tab.id}`);
  }

  /** 
   * Busca una pestaña registrada mediante su identificador único.
   * @param id El ID de la pestaña.
   */
  getTab(id: string): TabDefinition | undefined {
    return this.tabs.get(id);
  }

  /** 
   * Retorna una lista con todas las pestañas registradas actualmente.
   */
  getAllTabs(): TabDefinition[] {
    return Array.from(this.tabs.values());
  }

  /** 
   * Cambia la vista activa a la pestaña indicada, gestionando las clases CSS
   * de visibilidad y disparando los eventos de ciclo de vida (onActivate).
   * @param id El ID de la pestaña que se desea activar.
   */
  async activateTab(id: string) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    // Actualizar clases de UI para reflejar el cambio visual
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));

    const tabEl = document.querySelector(`.tab[data-tab="${id}"]`);
    const paneEl = document.getElementById(tab.containerId);

    tabEl?.classList.add("active");
    paneEl?.classList.add("active");

    this.activeTabId = id;

    // Disparar callback de activación si existe
    if (tab.onActivate) {
      await tab.onActivate();
    }
  }

  /** 
   * Retorna el identificador de la pestaña que está visible actualmente.
   */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }
}

/** Instancia única (singleton) del registro de UI para toda la aplicación */
export const uiRegistry = new UIRegistry();

