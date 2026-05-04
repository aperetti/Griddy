/**
 * Manages the plugin registry: fetches enabled plugins from the backend,
 * initializes the frontend plugin definitions, and constructs the
 * PluginExecutionContext for running plugins.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchPluginRegistry } from '../shared/api';
import { initPluginRegistry } from '../plugins';
import type { PluginDefinition, PluginExecutionContext } from '../plugins/types';
import type { Node, Edge } from '../shared/types';

interface PluginContextDeps {
    selectedNodes: Node[];
    selectedEdgeIds: string[];
    edges: Edge[];
    setAnalysisWindows: (fn: (prev: any[]) => any[]) => void;
    bringWindowToFront: (id: string) => void;
    updateWindow: (id: string, updates: any) => void;
    dateRange: { start: string; end: string };
    systemConfig: any;
    setHighlightedNodes: (fn: (prev: Set<string>) => Set<string>) => void;
    setHighlightedEdges: (fn: (prev: Set<string>) => Set<string>) => void;
    setNodeAverages: (averages: Record<string, number> | null) => void;
    setEdgeAverages: (averages: Record<string, number> | null) => void;
    setVoltageScale: (scale: any) => void;
    selectAndNavigateToNode: (ids: string | string[], hint?: string, clearPrevious?: boolean) => Promise<void>;
}

export function usePluginRegistry() {
    const [pluginRegistry, setPluginRegistry] = useState<Map<string, PluginDefinition>>(new Map());
    const enabledPluginNamesRef = useRef<string>('');

    useEffect(() => {
        const syncRegistry = () => {
            fetchPluginRegistry()
                .then(entries => {
                    const enabled = entries.filter(e => e.enabled).map(e => e.name).sort();
                    const key = enabled.join(',');
                    if (key === enabledPluginNamesRef.current) return;
                    enabledPluginNamesRef.current = key;
                    return initPluginRegistry(enabled).then(setPluginRegistry);
                })
                .catch(err => console.error('[plugins] Failed to initialize plugin registry:', err));
        };
        syncRegistry();
    }, []);

    return pluginRegistry;
}

export function usePluginContext(deps: PluginContextDeps): PluginExecutionContext {
    return useMemo<PluginExecutionContext>(() => ({
        selectedNodes: deps.selectedNodes,
        selectedEdgeIds: deps.selectedEdgeIds,
        resolveEdgeNodesToNodeIds: (edgeIds: string[]) =>
            Array.from(new Set(
                edgeIds.map(eid =>
                    deps.edges.find(e => e.id === eid || `${e.source}-${e.target}` === eid)?.target
                ).filter(Boolean) as string[]
            )),
        setAnalysisWindows: deps.setAnalysisWindows,
        bringWindowToFront: deps.bringWindowToFront,
        updateWindow: deps.updateWindow,
        dateRange: deps.dateRange,
        systemConfig: deps.systemConfig,
        addHighlightedNodes: (ids: string[]) => deps.setHighlightedNodes(prev => {
            const next = new Set(prev);
            ids.forEach(id => next.add(id));
            return next;
        }),
        addHighlightedEdges: (ids: string[]) => deps.setHighlightedEdges(prev => {
            const next = new Set(prev);
            ids.forEach(id => next.add(id));
            return next;
        }),
        setNodeAverages: (averages: Record<string, number> | null) => deps.setNodeAverages(averages),
        setEdgeAverages: (averages: Record<string, number> | null) => deps.setEdgeAverages(averages),
        setVoltageScale: deps.setVoltageScale,
        selectAndNavigateToNode: (ids, hint) => deps.selectAndNavigateToNode(ids, hint, false),
    }), [
        deps.selectedNodes, deps.selectedEdgeIds, deps.edges,
        deps.dateRange, deps.systemConfig,
    ]);
}
