import { GitFork } from 'lucide-react';
import { createElement } from 'react';
import type { SdkPluginDefinition, SdkNode } from '../sdk';
import { OneLineDiagramWindow } from './components/OneLineDiagramWindow';

export const oneLineExplorerPlugin: SdkPluginDefinition = {
    type: 'one_line_explorer',
    category: 'node',
    label: 'One-Line Diagram',
    description: 'Render a one-line connectivity diagram for the selected node or edge endpoint (2-depth neighbourhood, ConnectivityNodes as bus bars).',
    icon: GitFork,
    color: 'teal',

    // Show when exactly 1 node is selected, or when exactly 1 edge is selected (no nodes)
    appliesToNodes: (nodes: SdkNode[], edgeCount = 0) =>
        nodes.length === 1 || (nodes.length === 0 && edgeCount === 1),

    handleRun(ctx) {
        let nodeId: string | null = null;
        let label = 'Unknown';

        if (ctx.selectedNodes.length === 1) {
            // Node selected — use it directly
            const node = ctx.selectedNodes[0];
            nodeId = node.id;
            label = node.name || node.id;
        } else if (ctx.selectedEdgeIds.length > 0) {
            // Edge selected — resolve to its target connectivity node
            const resolved = ctx.resolveEdgeNodesToNodeIds([ctx.selectedEdgeIds[0]]);
            nodeId = resolved[0] ?? null;
            const shortId = ctx.selectedEdgeIds[0].length > 12
                ? `${ctx.selectedEdgeIds[0].slice(0, 8)}…`
                : ctx.selectedEdgeIds[0];
            label = `Edge ${shortId}`;
        }

        const windowId = ctx.openAnalysisWindow(
            'one_line_explorer',
            `One-Line: ${label}`,
        );

        // openAnalysisWindow sets nodeIds from selectedNodes; for edge selection we
        // override it with the resolved node so the window knows what to fetch.
        ctx.updateWindowProps(windowId, {
            nodeIds: nodeId ? [nodeId] : [],
            loading: false,
        });
    },

    renderWindow(instance, callbacks) {
        return createElement(OneLineDiagramWindow, {
            instance: instance as any,
            onClose: callbacks.onClose,
            onMinimize: callbacks.onMinimize,
            onFocus: callbacks.onFocus,
        });
    },
};

export default oneLineExplorerPlugin;
