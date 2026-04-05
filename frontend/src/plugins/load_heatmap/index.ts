import { Zap } from 'lucide-react';
import { createElement } from 'react';
import type { SdkPluginDefinition, SdkNode, SdkPluginContext } from '../sdk';
import { fetchLoadMap, fetchLoadMapEstimate } from './api';
import { LoadHeatMapModal } from './LoadHeatMapModal';

const DEFAULT_THRESHOLD = 5_000_000;

async function _performFetch(
    windowId: string,
    nodeId: string | null,
    start: string,
    end: string,
    ctx: SdkPluginContext
) {
    ctx.setAnalysisLoading(windowId, true);
    try {
        const resp = await fetchLoadMap(nodeId, start, end, 'mean');
        ctx.updateAnalysisData(windowId, resp);

        // Update the map load averages
        ctx.setEdgeAverages(resp.edge_loads);
        ctx.setAnalysisLoading(windowId, false);

    } catch (e) {
        console.error('[load_heatmap] fetch failed', e);
        ctx.setAnalysisLoading(windowId, false);
    }
}

export const loadHeatMapPlugin: SdkPluginDefinition = {
    type: 'load_heatmap',
    category: 'system',
    label: 'Network Load Heatmap',
    description: 'Visualize average power load/current distributions across the network edges.',
    permissions: ['analytics:load', 'topology:read'],
    icon: Zap,
    color: 'indigo',

    appliesToNodes: (_nodes: SdkNode[], _edgeCount = 0) =>
        true, // Load heatmap can run for entire grid or selection

    async handleRun(ctx) {
        const nodeIds = ctx.selectedNodes.map(n => n.id);
        const nodeId = nodeIds.length === 1 ? nodeIds[0] : null;

        const nodeName = nodeId
            ? (ctx.selectedNodes[0]?.name ?? 'Branch')
            : 'Entire Grid';

        const windowId = ctx.openAnalysisWindow('load_heatmap', nodeName);

        const { start, end } = ctx.dateRange;
        try {
            const est = await fetchLoadMapEstimate(nodeId, start, end);
            const threshold = Number(ctx.systemConfig['analytics_threshold'] || DEFAULT_THRESHOLD);

            ctx.updateWindowProps(windowId, {
                startTime: start,
                endTime: end,
            } as any);

            if (est.estimated_rows > threshold) {
                ctx.updateWindowProps(windowId, {
                    loading: false,
                    isPaused: true,
                    estimatedRows: est.estimated_rows,
                    pendingRequest: { nodeId, start, end },
                } as any);
            } else {
                await _performFetch(windowId, nodeId, start, end, ctx);
            }
        } catch (err) {
            console.error('[load_heatmap] estimate failed', err);
            ctx.setAnalysisLoading(windowId, false);
        }
    },

    renderWindow(instance: any, callbacks: any) {
        const onConfirm = () => {
             // In the current SDK, we don't pass ctx to renderWindow.
             // We use the api directly and rely on callbacks to update the state.
             callbacks.updateWindow?.({ loading: true, isPaused: false });
             
             const req = instance.pendingRequest ?? { nodeId: instance.nodeId, start: instance.startTime, end: instance.endTime };
             
             fetchLoadMap(req.nodeId, req.start, req.end, 'mean')
                .then(resp => {
                    callbacks.updateWindow?.({ data: resp, loading: false });
                    // NOTE: To update the map from here, we need ctx.setEdgeAverages.
                    // This is handled automatically by the handleRun initial call,
                    // but for refreshes, we'd need more powerful callbacks.
                    // For now, we'll suggest closing and re-running for map updates.
                });
        };

        return createElement(LoadHeatMapModal, {
            isOpen: instance.isOpen,
            onClose: callbacks.onClose,
            onMinimize: callbacks.onMinimize,
            loading: instance.loading,
            data: instance.data,
            estimatedRows: instance.estimatedRows,
            nodeName: instance.nodeName,
            isMinimized: instance.isMinimized,
            isPaused: instance.isPaused,
            zIndex: instance.zIndex ?? 1000,
            onConfirm,
            startTime: instance.startTime,
            endTime: instance.endTime,
        });
    },
};

export default loadHeatMapPlugin;
