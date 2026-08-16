/**
 * Minimal module/plugin loader prototype.
 * Modules register themselves with metadata and lifecycle hooks.
 */

export type ModuleDescriptor = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  init?: () => Promise<void> | void;
  shutdown?: () => Promise<void> | void;
};

export class ModuleLoader {
  private modules: Map<string, ModuleDescriptor> = new Map();

  register(module: ModuleDescriptor) {
    if (this.modules.has(module.id)) return;
    this.modules.set(module.id, module);
  }

  async initAll() {
    for (const m of this.modules.values()) {
      if (m.init) await m.init();
    }
  }

  list() {
    return Array.from(this.modules.values());
  }
}

export const moduleLoader = new ModuleLoader();
