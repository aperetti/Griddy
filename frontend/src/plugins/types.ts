/**
 * Plugin system contracts for analysis screen plugins.
 *
 * A plugin provides:
 *  - A unique type slug used as the AnalysisInstance.type discriminant
 *  - A toolbar button that appears when appliesToNodes() returns true
 *  - A handleRun() that creates an AnalysisInstance and fetches data
 *  - A renderWindow() that renders the floating analysis window
 *
 * Plugins must NOT import database clients directly. Data access goes
 * through the backend plugin endpoints (under /api/plugins/<name>)
 * which themselves use the PluginSDK service layer.
 */
import type { ReactNode } from 'react';
import type { Node } from '../shared/types';
import type { AnalysisInstance } from '../hooks/useAnalyticsState';

export interface PluginWindowCallbacks {
    onClose: () => void;
    onMinimize: () => void;
    /** Pre-bound to the instance ID — update the window without knowing its ID. */
    updateWindow: (updates: Partial<AnalysisInstance>) => void;
}

export interface PluginExecutionContext {
    /** Currently selected nodes. */
    selectedNodes: Node[];
    /** Currently selected edge IDs. */
    selectedEdgeIds: string[];
    /**
     * Resolve edge IDs to their target node IDs.
     * Use when the analysis operates on nodes but the user selected edges.
     */
    resolveEdgeNodesToNodeIds: (edgeIds: string[]) => string[];

    setAnalysisWindows: React.Dispatch<React.SetStateAction<AnalysisInstance[]>>;
    bringWindowToFront: (id: string) => void;
    updateWindow: (id: string, updates: Partial<AnalysisInstance>) => void;

    /** Global date range from the user's analysis settings. */
    dateRange: { start: string; end: string };
    /** System config overrides (e.g. analytics_threshold). */
    systemConfig: Record<string, string>;

    /** Additively highlight nodes on the map after an analysis runs. */
    addHighlightedNodes: (ids: string[]) => void;
    /** Additively highlight edges on the map after an analysis runs. */
    addHighlightedEdges: (ids: string[]) => void;
}

export interface PluginDefinition {
    /** Unique slug — becomes AnalysisInstance.type for windows this plugin owns. */
    type: string;

    /** Human-readable label shown in toolbar tooltip and minimized tray. */
    label: string;

    /** Lucide icon component (pass the component, not JSX: e.g. `Zap` not `<Zap />`). */
    icon: React.ComponentType<{ size?: number; color?: string }>;

    /** Mantine color name for toolbar button accent. */
    color: string;

    /**
     * Return true if this plugin's toolbar button should be shown for the
     * current selection. Called every time the selection changes.
     * @param nodes Currently selected nodes
     * @param edgeCount Number of currently selected edges
     */
    appliesToNodes: (nodes: Node[], edgeCount?: number) => boolean;

    /**
     * Called when the user clicks the toolbar button.
     * Should create an AnalysisInstance (loading=true), append it to the
     * window list, then fetch data and update the instance when done.
     */
    handleRun: (ctx: PluginExecutionContext) => void;

    /**
     * Render the floating window for an AnalysisInstance whose type matches
     * this plugin's `type` field.  Must return a React element that wraps
     * the shared AnalysisWindow container.
     */
    renderWindow: (instance: AnalysisInstance, callbacks: PluginWindowCallbacks) => ReactNode;
}
