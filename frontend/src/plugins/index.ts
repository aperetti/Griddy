/**
 * Plugin registry — add one line per installed plugin.
 *
 * To install a new plugin:
 *   1. Drop its directory under frontend/src/plugins/<name>/
 *   2. Import its PluginDefinition below and add it to the Map
 */
import type { PluginDefinition } from './types';
import { transformerLoadingPlugin } from './transformer_loading';
import { consumptionPlugin } from './consumption';
import { voltagePlugin } from './voltage';

export const pluginRegistry = new Map<string, PluginDefinition>([
    [consumptionPlugin.type, consumptionPlugin],
    [voltagePlugin.type, voltagePlugin],
    [transformerLoadingPlugin.type, transformerLoadingPlugin],
]);

export type { PluginDefinition } from './types';
export type { PluginExecutionContext, PluginWindowCallbacks } from './types';
