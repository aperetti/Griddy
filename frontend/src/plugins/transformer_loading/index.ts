import { Zap } from 'lucide-react';
import { createElement } from 'react';
import type { SdkPluginDefinition } from '@plugin-sdk';
import { fetchTransformerLoading } from './api';
import { TransformerLoadingWindow } from './TransformerLoadingWindow';


export const transformerLoadingPlugin: SdkPluginDefinition = {
    type: 'transformer_loading',
    category: 'system',
    label: 'Transformer Overload',
    description: 'Monitor grid-wide transformer loading and identify overloaded assets.',
    permissions: ['cim:read', 'transformer:loading'],
    icon: Zap,
    color: 'yellow',

    appliesToNodes: () => true,

    handleRun(ctx) {
        const nodeIds = ctx.selectedNodes.map(n => n.id);
        const isSystemReport = nodeIds.length === 0;
        const reportName = isSystemReport
            ? 'Global Overload Report'
            : (nodeIds.length === 1 ? (ctx.selectedNodes[0].name ?? 'Transformer') : `${nodeIds.length} Transformers`);

        const windowId = ctx.openAnalysisWindow('transformer_loading', reportName);

        fetchTransformerLoading(nodeIds)
            .then(resp => {
                ctx.updateAnalysisData(windowId, resp.transformers);
                
                // Color code the map based on loading percentage
                const averages: Record<string, number> = {};
                resp.transformers.forEach(t => {
                    if (t.loading_percent != null) {
                        // Normalize to 0-1 scale for the visualization engine
                        // 1.0 = 100% load
                        averages[t.mrid] = t.loading_percent / 100;
                    }
                });
                ctx.setNodeAverages(averages);
            })
            .catch(err => {
                console.error('[transformer_loading] report failed', err);
                ctx.setAnalysisLoading(windowId, false);
            });
    },

    renderWindow(instance, callbacks) {
        return createElement(TransformerLoadingWindow, { instance, ...callbacks });
    },
};

export default transformerLoadingPlugin;
