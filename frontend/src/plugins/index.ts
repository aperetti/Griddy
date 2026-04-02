/**
 * Plugin registry — discovers plugins at build time but downloads code only
 * for plugins that are explicitly enabled in the backend.
 *
 * Vite code-splits each plugin into its own JS chunk via the lazy glob.
 * Disabled plugin chunks are never fetched by the browser.
 *
 * Usage (called once at app startup):
 *   import { initPluginRegistry } from './plugins';
 *   const registry = await initPluginRegistry(['consumption', 'voltage']);
 */
import type { PluginDefinition } from './types';
import type { SdkPluginDefinition } from './sdk';
import { adaptPlugin } from './adapter';

/**
 * Lazy import map — keys are relative paths, values are async loaders.
 * Vite emits each entry as a separate JS chunk but does NOT fetch them
 * until the loader function is called.
 */
const _loaders = import.meta.glob<{ default: SdkPluginDefinition }>(
    './*/index.ts',
    { eager: false },
);

/** Extract the plugin name from a glob path like './consumption/index.ts'. */
function _nameFromPath(path: string): string {
    return path.replace('./', '').replace('/index.ts', '');
}

/**
 * Load only the plugins whose names appear in `enabledNames`.
 * Returns a new Map ready for use as the plugin registry.
 */
export async function initPluginRegistry(
    enabledNames: string[],
): Promise<Map<string, PluginDefinition>> {
    const enabled = new Set(enabledNames);
    const registry = new Map<string, PluginDefinition>();

    await Promise.all(
        Object.entries(_loaders)
            .filter(([path]) => enabled.has(_nameFromPath(path)))
            .map(async ([path, load]) => {
                try {
                    const mod = await load();
                    if (mod.default?.type) {
                        registry.set(mod.default.type, adaptPlugin(mod.default));
                    }
                } catch (err) {
                    console.error(`[plugins] Failed to load plugin at ${path}:`, err);
                }
            }),
    );

    return registry;
}

export type { PluginDefinition } from './types';
export type { PluginExecutionContext, PluginWindowCallbacks } from './types';
