import { StepType, Step } from '../../../src/types/pokepad';

/**
 * Define la estructura de un bloque de workflow (Step).
 * Cada bloque representa una acción que el usuario puede configurar y ejecutar.
 */
export interface BlockDefinition {
  /** Identificador único del tipo de bloque (ej: 'keypress', 'my_custom_action') */
  type: StepType | string;
  /** Nombre amigable que se muestra en el menú de selección de bloques */
  label: string;
  /** Icono o Emoji representativo que aparecerá en el badge del bloque */
  icon: string;
  /** Clase CSS para colorear el bloque (ej: 't-system', 't-logic', 't-media') */
  cls: string;
  /** Si es true, el bloque actúa como un contenedor de otros bloques (ej: Bucles, Condicionales) */
  isContainer?: boolean;
  
  /** 
   * Función encargada de dibujar los inputs de configuración en el editor de workflows.
   * @param container El elemento DOM (HTMLElement) donde se debe inyectar la interfaz de usuario.
   * @param step El objeto de datos del paso actual, que contiene sus parámetros persistidos.
   * @param path El camino jerárquico (array de índices) que identifica la posición del paso en el workflow.
   * @param utils Objeto con funciones de utilidad, como 'discoverVariables' para autocompletado.
   */
  renderParams?: (container: HTMLElement, step: Step, path: number[], utils: any) => void;
  
  /** 
   * Retorna una cadena de texto breve que resume la configuración actual del bloque.
   * Se muestra cuando el bloque está colapsado en el editor para que el usuario sepa qué hace sin abrirlo.
   * @param step El objeto del paso a resumir.
   */
  getSummary?: (step: Step) => string;
  
  /** Descripción detallada opcional que puede mostrarse como ayuda al usuario final */
  description?: string;
}

/**
 * Registro central de bloques (Step Registry).
 * Sigue el patrón Registry para permitir la extensión modular de los bloques de workflow.
 * Los plugins pueden usar este registro para añadir nuevas funcionalidades al editor.
 */
class BlockRegistry {
  private blocks: Map<string, BlockDefinition> = new Map();

  /** 
   * Registra una nueva definición de bloque en el sistema.
   * Si el tipo ya existe, será sobrescrito.
   * @param definition La configuración del nuevo bloque.
   */
  register(definition: BlockDefinition) {
    this.blocks.set(definition.type, definition);
    console.log(`[BlockRegistry] Bloque registrado: ${definition.type}`);
  }

  /** 
   * Obtiene la definición de un bloque mediante su identificador de tipo.
   * @param type El tipo de bloque a buscar.
   */
  get(type: string): BlockDefinition | undefined {
    return this.blocks.get(type);
  }

  /** 
   * Retorna una lista con todos los bloques registrados actualmente.
   */
  getAll(): BlockDefinition[] {
    return Array.from(this.blocks.values());
  }

  /** 
   * Genera un objeto de configuración compatible con el sistema de tipos legacy de la app.
   * Utilizado internamente para mantener retrocompatibilidad con funciones antiguas de renderizado.
   */
  getStepTypesConfig(): Record<string, { label: string; icon: string; cls: string; isContainer?: boolean }> {
    const config: Record<string, any> = {};
    this.blocks.forEach((def, type) => {
      config[type] = {
        label: def.label,
        icon: def.icon,
        cls: def.cls,
        isContainer: def.isContainer
      };
    });
    return config;
  }
}

/** Instancia única (singleton) del registro de bloques para toda la aplicación */
export const blockRegistry = new BlockRegistry();

