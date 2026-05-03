import { BarChart3 } from 'lucide-react';
import { createElement } from 'react';
import type { SdkPluginDefinition, SdkNode, SdkPluginContext } from '@plugin-sdk';
import { fetchConsumptionPlugin, fetchConsumptionEstimatePlugin } from './api';
import { ConsumptionTimeSeriesModal } from './ConsumptionTimeSeriesModal';

const DEFAULT_THRESHOLD = 2_000_000;

async function _performFetch(
    windowId: string,
    nodeIds: string[],
    start: string,
    end: string,
    ctx: SdkPluginContext
) {
    ctx.updateWindowProps(windowId, { loading: true, isPaused: false } as any);
    try {
        const resp = await fetchConsumptionPlugin(nodeIds, start, end);
        ctx.updateAnalysisData(windowId, resp.time_series ?? []);
        if (resp.downstream_node_ids?.length) {
            ctx.addHighlightedNodes(resp.downstream_node_ids);
            ctx.selectAndNavigateToNode([...nodeIds, ...resp.downstream_node_ids]);
        }
        if (resp.downstream_edge_ids?.length) ctx.addHighlightedEdges(resp.downstream_edge_ids);
    } catch (e) {
        console.error('[consumption] fetch failed', e);
        ctx.setAnalysisLoading(windowId, false);
    }
}

export const consumptionPlugin: SdkPluginDefinition = {
    type: 'consumption',
    category: 'node',
    label: 'Consumption History',
    description: 'Analyze aggregate smart meter consumption data for downstream grid assets.',
    permissions: ['cim:read', 'topology:read', 'analytics:consumption'],
    icon: BarChart3,
    color: 'blue',

    appliesToNodes: (_nodes: SdkNode[], edgeCount = 0) =>
        _nodes.length > 0 || edgeCount > 0,

    async handleRun(ctx) {
        let nodeIds = ctx.selectedNodes.map(n => n.id);
        if (nodeIds.length === 0 && ctx.selectedEdgeIds.length > 0) {
            nodeIds = ctx.resolveEdgeNodesToNodeIds(ctx.selectedEdgeIds);
        }
        if (nodeIds.length === 0) return;

        const nodeName = nodeIds.length === 1
            ? (ctx.selectedNodes[0]?.name ?? 'Selected Asset')
            : `${nodeIds.length} Assets`;

        const windowId = ctx.openAnalysisWindow('consumption', nodeName);

        const { start, end } = ctx.dateRange;
        ctx.updateWindowProps(windowId, { nodeIds, start, end } as any);

        if (!start || !end) {
            console.error('[consumption] Cannot run analysis: simulation time range is missing.');
            return;
        }
        try {
            const est = await fetchConsumptionEstimatePlugin(nodeIds, start, end);
            if (est.downstream_node_ids?.length) ctx.addHighlightedNodes(est.downstream_node_ids);
            if (est.downstream_edge_ids?.length) ctx.addHighlightedEdges(est.downstream_edge_ids);

            const threshold = Number(ctx.systemConfig['analytics_threshold'] || DEFAULT_THRESHOLD);
            if (est.estimated_rows > threshold) {
                ctx.updateWindowProps(windowId, {
                    loading: false,
                    isPaused: true,
                    estimatedRows: est.estimated_rows,
                    pendingRequest: { nodeIds, start, end },
                } as any);
            } else {
                await _performFetch(windowId, nodeIds, start, end, ctx);
            }
        } catch (err) {
            console.error('[consumption] estimate failed', err);
            ctx.setAnalysisLoading(windowId, false);
        }
    },

    renderWindow(instance: any, callbacks: any) {
        const req = instance.pendingRequest ?? { nodeIds: instance.nodeIds, start: '', end: '' };

        const onConfirm = () => {
            if (callbacks.updateWindow) {
                callbacks.updateWindow({ loading: true, isPaused: false });
                fetchConsumptionPlugin(req.nodeIds, req.start, req.end, true)
                    .then(resp => {
                        callbacks.updateWindow({ data: resp.time_series ?? [], loading: false });
                        if (resp.downstream_node_ids?.length && callbacks.selectAndNavigateToNode) {
                            callbacks.selectAndNavigateToNode([...req.nodeIds, ...resp.downstream_node_ids]);
                        }
                    })
                    .catch(() => callbacks.updateWindow({ loading: false }));
            }
        };

        return createElement(ConsumptionTimeSeriesModal, {
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
            layoutMode: 'floating',
            onConfirm,
            onFocus: callbacks.onFocus,
        });
    },
};

export default consumptionPlugin;
