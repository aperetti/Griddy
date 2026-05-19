/**
 * Plugin registry — dynamically loads plugin code at runtime from the backend.
 *
 * Supports both built-in plugins and dynamically uploaded extensions.
 * Plugins must be pre-compiled into standard ES Modules.
 *
 * Usage (called once at app startup):
 *   import { initPluginRegistry } from './plugins';
 *   const registry = await initPluginRegistry(['consumption', 'voltage']);
 */
import type { PluginDefinition } from './types';
import { adaptPlugin } from './adapter';

/**
 * Load only the plugins whose names appear in `enabledNames`.
 * Each plugin is fetched as a standalone ES module from the backend's static route.
 */
export async function initPluginRegistry(
    enabledNames: string[],
): Promise<Map<string, PluginDefinition>> {
    const registry = new Map<string, PluginDefinition>();

    await Promise.all(
        enabledNames.map(async (name) => {
            try {
                // Dynamic import with vite-ignore to allow runtime resolution
                // The unified assets route serves both built-in and external plugins
                const mod = await import(/* @vite-ignore */ `/api/plugins/assets/${name}/ui/index.js`);
                
                if (mod.default?.type) {
                    registry.set(mod.default.type, adaptPlugin(mod.default));
                    console.info(`[plugins] Loaded extension: ${name}`);
                }
            } catch (err) {
                console.error(`[plugins] Failed to load plugin '${name}':`, err);
            }
        }),
    );

    return registry;
}

export type { PluginDefinition } from './types';
export type { PluginExecutionContext, PluginWindowCallbacks } from './types';
