import { Zap } from 'lucide-react';
import { createElement } from 'react';
import type { SdkPluginDefinition, SdkNode } from '@plugin-sdk';
import { fetchTransformerLoading } from './api';
import { TransformerLoadingWindow } from './TransformerLoadingWindow';

function isTransformerNode(node: SdkNode): boolean {
    // Nodes can carry attached_equipment with PowerTransformer entries
    if ((node.equipments || []).some(eq => eq.type === 'PowerTransformer')) return true;
    // display_type is set by the display rule engine when rules match
    if (node.display_type === 'PowerTransformer') return true;
    // Fallback: node type directly named
    if (node.type === 'PowerTransformer') return true;
    return false;
}

export const transformerLoadingPlugin: SdkPluginDefinition = {
    type: 'transformer_loading',
    label: 'Transformer Loading',
    description: 'Calculate average and peak loads specifically for Distribution transformers.',
    permissions: ['cim:read', 'transformer:loading'],
    icon: Zap,
    color: 'yellow',

    appliesToNodes: (nodes: SdkNode[]) => nodes.some(isTransformerNode),

    handleRun(ctx) {
        const nodeIds = ctx.selectedNodes.map(n => n.id);
        const nodeName = nodeIds.length === 1
            ? (ctx.selectedNodes[0].name ?? 'Transformer')
            : `${nodeIds.length} Transformers`;

        // 1. Open the window and capture its ID (status is implicitly loading via SDK)
        const windowId = ctx.openAnalysisWindow('transformer_loading', nodeName);

        // 2. Fetch the data remotely
        fetchTransformerLoading(nodeIds)
            .then(resp => {
                // 3. Update the analysis window with the fetched data
                ctx.updateAnalysisData(windowId, resp.transformers);
            })
            .catch(err => {
                console.error('[transformer_loading] fetch failed', err);
                ctx.setAnalysisLoading(windowId, false);
            });
    },

    renderWindow(instance, callbacks) {
        return createElement(TransformerLoadingWindow, { instance, ...callbacks });
    },
};

export default transformerLoadingPlugin;
