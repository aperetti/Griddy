import type { ReactNode, ComponentType } from 'react';

/**
 * A pristine representation of a node passed to plugins.
 * Guaranteed stable across core application refactors.
 */
export interface SdkNode {
    id: string;
    type: string;
    name: string;
    display_type?: string;
    equipments: Array<{ type: string; name: string }>;
}

/**
 * A stable representation of an active analysis instance.
 */
export interface SdkAnalysisInstance extends Record<string, any> {
    id: string;
    nodeName: string;
    loading: boolean;
    data: unknown;
    isMinimized?: boolean;
    zIndex?: number;
    isOpen: boolean;
}

/**
 * The API surface area exposed to plugins for interacting with the core application.
 */
export interface SdkPluginContext {
    selectedNodes: SdkNode[];
    selectedEdgeIds: string[];
    
    /** Open a new analysis window of the specified plugin type */
    openAnalysisWindow: (pluginType: string, nodeName: string) => string;
    
    /** Update standard loading/data state of the window */
    updateAnalysisData: (id: string, data: unknown) => void;
    setAnalysisLoading: (id: string, loading: boolean) => void;
    
    /** Custom window state updates if needed */
    updateWindowProps: (id: string, updates: Partial<SdkAnalysisInstance> | Record<string, any>) => void;
    
    /** System configuration */
    systemConfig: Record<string, string>;
    dateRange: { start: string; end: string };

    /** Map interactions */
    addHighlightedNodes: (ids: string[]) => void;
    addHighlightedEdges: (ids: string[]) => void;
    resolveEdgeNodesToNodeIds: (edgeIds: string[]) => string[];

    /** Map-wide node averages (for heatmap visualization) */
    setNodeAverages: (averages: Record<string, number> | null) => void;
    /** Voltage scale ranges for coloring and UI widgets */
    setVoltageScale: (scale: {
        criticalHigh: number;
        highWarning: number;
        lowWarning: number;
        criticalLow: number;
        baseVoltage: number;
    }) => void;
}


export interface SdkPluginCallbacks {
    onClose: () => void;
    onMinimize: () => void;
    /** Update map-wide node colors/averages */
    setNodeAverages?: (averages: Record<string, number> | null) => void;
    /** Update global voltage scale */
    setVoltageScale?: (scale: any) => void;
    /** For standard plugins to update their own data */
    updateWindow?: (updates: Partial<SdkAnalysisInstance>) => void;
}


/**
 * The formal contract every plugin must implement and export as default.
 */
export interface SdkPluginDefinition {
    type: string;
    /** Categorization: 'node' (contextual) or 'system' (global) */
    category: 'node' | 'system';
    label: string;
    description?: string;
    permissions?: string[];
    icon: ComponentType<{ size?: number; color?: string }>;
    color: string;

    appliesToNodes: (nodes: SdkNode[], edgeCount?: number) => boolean;
    handleRun: (ctx: SdkPluginContext) => void;
    renderWindow: (instance: SdkAnalysisInstance, callbacks: SdkPluginCallbacks) => ReactNode;
}
