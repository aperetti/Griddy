import type { Node } from '../shared/types';
import type { PluginExecutionContext, PluginDefinition, PluginWindowCallbacks } from './types';
import type { SdkNode, SdkPluginContext, SdkPluginDefinition, SdkAnalysisInstance, SdkPluginCallbacks } from './sdk';
import type { AnalysisInstance } from '../hooks/useAnalyticsState';

/**
 * Maps the internal application Node representation to the stable SDK Node.
 */
function adaptNode(node: Node): SdkNode {
    return {
        id: node.id,
        type: node.type,
        name: node.name,
        display_type: node.display_type,
        equipments: node.attached_equipment?.map(eq => ({
            type: eq.type,
            name: eq.name
        })) || []
    };
}

/**
 * Creates an SDK context from the internal PluginExecutionContext.
 * Provides a strong API surface for plugins to interact with the core app.
 */
function adaptContext(ctx: PluginExecutionContext): SdkPluginContext {
    return {
        selectedNodes: ctx.selectedNodes.map(adaptNode),
        selectedEdgeIds: ctx.selectedEdgeIds,
        systemConfig: ctx.systemConfig,
        dateRange: ctx.dateRange,
        
        openAnalysisWindow: (type: string, nodeName: string): string => {
            const id = `${type}-${Date.now()}`;
            // Extract IDs to populate the mandatory nodeIds field
            const nodeIds = ctx.selectedNodes.map(n => n.id);
            const edgeIds = ctx.selectedEdgeIds;
            ctx.setAnalysisWindows((prev: any[]) => [
                ...prev,
                { id, type, nodeIds, edgeIds, nodeName, loading: true, data: [], isOpen: true, isMinimized: false }
            ]);
            ctx.bringWindowToFront(id);
            return id;
        },
        
        updateAnalysisData: (id: string, data: unknown) => {
            ctx.updateWindow(id, { data: data as any[], loading: false });
        },
        
        setAnalysisLoading: (id: string, loading: boolean) => {
            ctx.updateWindow(id, { loading });
        },
        
        updateWindowProps: (id: string, updates: Partial<SdkAnalysisInstance> | Record<string, any>) => {
            ctx.updateWindow(id, updates as Partial<AnalysisInstance>);
        },
        
        addHighlightedNodes: ctx.addHighlightedNodes,
        addHighlightedEdges: ctx.addHighlightedEdges,
        resolveEdgeNodesToNodeIds: ctx.resolveEdgeNodesToNodeIds,
        
        setNodeAverages: ctx.setNodeAverages,
        setEdgeAverages: ctx.setEdgeAverages,
        setVoltageScale: ctx.setVoltageScale,
        selectAndNavigateToNode: ctx.selectAndNavigateToNode
    };
}


function adaptInstance(instance: AnalysisInstance): SdkAnalysisInstance {
    // Spread all properties to ensure custom plugin data (like scatterData) is preserved
    return {
        ...instance,
    } as unknown as SdkAnalysisInstance;
}

/**
 * Wraps an SDK Plugin Definition, returning an internal Plugin Definition that the
 * core application loader understands.
 */
export function adaptPlugin(sdkPlugin: SdkPluginDefinition): PluginDefinition {
    return {
        type: sdkPlugin.type,
        category: sdkPlugin.category,
        label: sdkPlugin.label,
        icon: sdkPlugin.icon,
        color: sdkPlugin.color,
        
        appliesToNodes: (nodes: Node[], edgeCount?: number) => {
            return sdkPlugin.appliesToNodes(nodes.map(adaptNode), edgeCount);
        },
        
        handleRun: (ctx: PluginExecutionContext) => {
            sdkPlugin.handleRun(adaptContext(ctx));
        },
        
        renderWindow: (instance: AnalysisInstance, callbacks: PluginWindowCallbacks) => {
            // Note: the window callbacks map cleanly as their signatures are identical.
            return sdkPlugin.renderWindow(adaptInstance(instance), callbacks as SdkPluginCallbacks);
        }
    };
}
