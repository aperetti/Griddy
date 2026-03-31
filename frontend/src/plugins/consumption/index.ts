import { BarChart3 } from 'lucide-react';
import { createElement } from 'react';
import type { PluginDefinition } from '../types';
import type { Node } from '../../shared/types';
import type { AnalysisInstance } from '../../hooks/useAnalyticsState';
import { fetchConsumptionPlugin, fetchConsumptionEstimatePlugin } from './api';
import { ConsumptionTimeSeriesModal } from '../../features/analytics/components/ConsumptionTimeSeriesModal';

const DEFAULT_THRESHOLD = 2_000_000;

async function _performFetch(
    windowId: string,
    nodeIds: string[],
    start: string,
    end: string,
    updateWindow: (id: string, updates: Partial<AnalysisInstance>) => void,
    addHighlightedNodes: (ids: string[]) => void,
    addHighlightedEdges: (ids: string[]) => void,
) {
    updateWindow(windowId, { loading: true, isPaused: false });
    try {
        const resp = await fetchConsumptionPlugin(nodeIds, start, end);
        updateWindow(windowId, { data: resp.time_series, loading: false });
        if (resp.downstream_node_ids?.length) addHighlightedNodes(resp.downstream_node_ids);
        if (resp.downstream_edge_ids?.length) addHighlightedEdges(resp.downstream_edge_ids);
    } catch (e) {
        console.error('[consumption] fetch failed', e);
        updateWindow(windowId, { loading: false });
    }
}

export const consumptionPlugin: PluginDefinition = {
    type: 'consumption',
    label: 'Consumption Analysis',
    icon: BarChart3,
    color: 'blue',

    appliesToNodes: (_nodes: Node[], edgeCount = 0) =>
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

        const id = `consumption-${Date.now()}`;
        ctx.setAnalysisWindows(prev => [...prev, {
            id,
            type: 'consumption',
            nodeIds,
            nodeName,
            isOpen: true,
            isMinimized: false,
            loading: true,
            data: [],
            zIndex: 1000,
        }]);
        ctx.bringWindowToFront(id);

        const { start, end } = ctx.dateRange;
        try {
            const est = await fetchConsumptionEstimatePlugin(nodeIds, start, end);
            if (est.downstream_node_ids?.length) ctx.addHighlightedNodes(est.downstream_node_ids);
            if (est.downstream_edge_ids?.length) ctx.addHighlightedEdges(est.downstream_edge_ids);

            const threshold = Number(ctx.systemConfig['analytics_threshold'] || DEFAULT_THRESHOLD);
            if (est.estimated_rows > threshold) {
                ctx.updateWindow(id, {
                    loading: false,
                    isPaused: true,
                    estimatedRows: est.estimated_rows,
                    pendingRequest: { nodeIds, start, end },
                });
            } else {
                await _performFetch(id, nodeIds, start, end, ctx.updateWindow, ctx.addHighlightedNodes, ctx.addHighlightedEdges);
            }
        } catch (err) {
            console.error('[consumption] estimate failed', err);
            ctx.updateWindow(id, { loading: false });
        }
    },

    renderWindow(instance, callbacks) {
        const req = instance.pendingRequest ?? { nodeIds: instance.nodeIds, start: '', end: '' };

        const onConfirm = () => {
            callbacks.updateWindow({ loading: true, isPaused: false });
            fetchConsumptionPlugin(req.nodeIds, req.start, req.end)
                .then(resp => callbacks.updateWindow({ data: resp.time_series, loading: false }))
                .catch(() => callbacks.updateWindow({ loading: false }));
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
        });
    },
};
