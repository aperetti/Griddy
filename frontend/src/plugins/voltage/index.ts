import { Activity } from 'lucide-react';
import { createElement } from 'react';
import type { PluginDefinition } from '../types';
import type { Node } from '../../shared/types';
import type { AnalysisInstance } from '../../hooks/useAnalyticsState';
import { fetchVoltagePlugin, fetchVoltageEstimatePlugin } from './api';
import { VoltageDistributionModal } from '../../features/analytics/components/VoltageDistributionModal';

const DEFAULT_THRESHOLD = 2_000_000;
const DEFAULT_DEGREES = 5;

async function _performFetch(
    windowId: string,
    nodeIds: string[],
    start: string,
    end: string,
    degrees: number | null | undefined,
    updateWindow: (id: string, updates: Partial<AnalysisInstance>) => void,
    addHighlightedNodes: (ids: string[]) => void,
    addHighlightedEdges: (ids: string[]) => void,
) {
    updateWindow(windowId, { loading: true, isPaused: false });
    try {
        const resp = await fetchVoltagePlugin(nodeIds, start, end, degrees);
        updateWindow(windowId, {
            data: resp.distribution || [],
            scatterData: resp.scatter || [],
            timeSeriesData: resp.timeseries || [],
            loading: false,
        });
        if (resp.downstream_node_ids?.length) addHighlightedNodes(resp.downstream_node_ids);
        if (resp.downstream_edge_ids?.length) addHighlightedEdges(resp.downstream_edge_ids);
    } catch (e) {
        console.error('[voltage] fetch failed', e);
        updateWindow(windowId, { loading: false });
    }
}

export const voltagePlugin: PluginDefinition = {
    type: 'voltage',
    label: 'Voltage Distribution',
    icon: Activity,
    color: 'cyan',

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

        const degrees = DEFAULT_DEGREES;
        const id = `voltage-${Date.now()}`;
        ctx.setAnalysisWindows(prev => [...prev, {
            id,
            type: 'voltage',
            nodeIds,
            nodeName,
            isOpen: true,
            isMinimized: false,
            loading: true,
            data: [],
            degrees,
            zIndex: 1000,
        }]);
        ctx.bringWindowToFront(id);

        const { start, end } = ctx.dateRange;
        try {
            const est = await fetchVoltageEstimatePlugin(nodeIds, start, end, degrees);
            if (est.downstream_node_ids?.length) ctx.addHighlightedNodes(est.downstream_node_ids);
            if (est.downstream_edge_ids?.length) ctx.addHighlightedEdges(est.downstream_edge_ids);

            const threshold = Number(ctx.systemConfig['analytics_threshold'] || DEFAULT_THRESHOLD);
            if (est.estimated_rows > threshold) {
                ctx.updateWindow(id, {
                    loading: false,
                    isPaused: true,
                    estimatedRows: est.estimated_rows,
                    pendingRequest: { nodeIds, start, end, degrees },
                });
            } else {
                await _performFetch(id, nodeIds, start, end, degrees, ctx.updateWindow, ctx.addHighlightedNodes, ctx.addHighlightedEdges);
            }
        } catch (err) {
            console.error('[voltage] estimate failed', err);
            ctx.updateWindow(id, { loading: false });
        }
    },

    renderWindow(instance, callbacks) {
        // pendingRequest is always set by handleRun and preserved so renderWindow
        // can always read start/end for degree changes.
        const req = instance.pendingRequest ?? {
            nodeIds: instance.nodeIds,
            start: '',
            end: '',
            degrees: instance.degrees ?? DEFAULT_DEGREES,
        };

        const onConfirm = () => {
            const d = req.degrees ?? DEFAULT_DEGREES;
            callbacks.updateWindow({ loading: true, isPaused: false });
            fetchVoltagePlugin(req.nodeIds, req.start, req.end, d)
                .then(resp => callbacks.updateWindow({
                    data: resp.distribution || [],
                    scatterData: resp.scatter || [],
                    timeSeriesData: resp.timeseries || [],
                    loading: false,
                }))
                .catch(() => callbacks.updateWindow({ loading: false }));
        };

        const onDegreesChange = (newDegrees: number | null) => {
            const d = newDegrees ?? DEFAULT_DEGREES;
            callbacks.updateWindow({ loading: true, degrees: d });
            fetchVoltagePlugin(req.nodeIds, req.start, req.end, d)
                .then(resp => callbacks.updateWindow({
                    data: resp.distribution || [],
                    scatterData: resp.scatter || [],
                    timeSeriesData: resp.timeseries || [],
                    loading: false,
                    pendingRequest: { ...req, degrees: d },
                }))
                .catch(() => callbacks.updateWindow({ loading: false }));
        };

        return createElement(VoltageDistributionModal, {
            isOpen: instance.isOpen,
            onClose: callbacks.onClose,
            onMinimize: callbacks.onMinimize,
            loading: instance.loading,
            data: instance.data,
            scatterData: instance.scatterData || [],
            timeSeriesData: instance.timeSeriesData || [],
            estimatedRows: instance.estimatedRows,
            nodeName: instance.nodeName,
            degrees: instance.degrees ?? DEFAULT_DEGREES,
            onDegreesChange,
            isMinimized: instance.isMinimized,
            isPaused: instance.isPaused,
            zIndex: instance.zIndex ?? 1000,
            layoutMode: 'floating',
            onConfirm,
        });
    },
};
