import { Activity } from 'lucide-react';
import { createElement } from 'react';
import type { SdkPluginDefinition, SdkNode, SdkPluginContext } from '@plugin-sdk';
import { fetchVoltagePlugin, fetchVoltageEstimatePlugin } from './api';
import { VoltageDistributionModal } from './VoltageDistributionModal';

const DEFAULT_THRESHOLD = 2_000_000;
const DEFAULT_DEGREES = 5;

async function _performFetch(
    windowId: string,
    nodeIds: string[],
    start: string,
    end: string,
    degrees: number | null | undefined,
    ctx: SdkPluginContext
) {
    ctx.updateWindowProps(windowId, { loading: true, isPaused: false } as any);
    try {
        const resp = await fetchVoltagePlugin(nodeIds, start, end, degrees);
        // Note: SDK requires 'data' but our scatter and timeseries data goes directly
        // via 'updateWindowProps' to bypass the standard SDK data container for performance.
        ctx.updateWindowProps(windowId, {
            data: resp.distribution ?? [],
            scatterData: resp.scatter ?? [],
            timeSeriesData: resp.timeseries ?? [],
            loading: false,
        } as any);
        if (resp.downstream_node_ids?.length) {
            ctx.addHighlightedNodes(resp.downstream_node_ids);
            ctx.selectAndNavigateToNode([...nodeIds, ...resp.downstream_node_ids]);
        }
        if (resp.downstream_edge_ids?.length) ctx.addHighlightedEdges(resp.downstream_edge_ids);
    } catch (e) {
        console.error('[voltage] fetch failed', e);
        ctx.setAnalysisLoading(windowId, false);
    }
}

export const voltagePlugin: SdkPluginDefinition = {
    type: 'voltage',
    category: 'node',
    label: 'Voltage Distribution',
    description: 'Display voltage distributions and timeseries line charts for nodes.',
    permissions: ['cim:read', 'topology:read', 'analytics:voltage'],
    icon: Activity,
    color: 'cyan',

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

        const degrees = DEFAULT_DEGREES;
        
        // Use SDK to open window
        const { start, end } = ctx.dateRange;
        const windowId = ctx.openAnalysisWindow('voltage', nodeName);
        ctx.updateWindowProps(windowId, { degrees, nodeIds, start, end } as any);
        try {
            const est = await fetchVoltageEstimatePlugin(nodeIds, start, end, degrees);
            if (est.downstream_node_ids?.length) ctx.addHighlightedNodes(est.downstream_node_ids);
            if (est.downstream_edge_ids?.length) ctx.addHighlightedEdges(est.downstream_edge_ids);

            const threshold = Number(ctx.systemConfig['analytics_threshold'] || DEFAULT_THRESHOLD);
            if (est.estimated_rows > threshold) {
                ctx.updateWindowProps(windowId, {
                    loading: false,
                    isPaused: true,
                    estimatedRows: est.estimated_rows,
                    pendingRequest: { nodeIds, start, end, degrees },
                } as any);
            } else {
                await _performFetch(windowId, nodeIds, start, end, degrees, ctx);
            }
        } catch (err) {
            console.error('[voltage] estimate failed', err);
            ctx.setAnalysisLoading(windowId, false);
        }
    },

    renderWindow(instance: any, callbacks: any) {
        // We cast parameters and state locally to handle custom plugin data struct 
        // without polluting the strict base SDK interface.

        const onConfirm = () => {
            const d = instance.degrees ?? DEFAULT_DEGREES;
            const nodeIds = instance.nodeIds || [];
            const start = instance.start || '';
            const end = instance.end || '';

            if (callbacks.updateWindow) {
                callbacks.updateWindow({ loading: true, isPaused: false });
                fetchVoltagePlugin(nodeIds, start, end, d, true)
                    .then(resp => callbacks.updateWindow({
                        data: resp.distribution || [],
                        scatterData: resp.scatter || [],
                        timeSeriesData: resp.timeseries || [],
                        loading: false,
                        pendingRequest: { nodeIds, start, end, degrees: d }
                    }))
                    .catch(() => callbacks.updateWindow({ loading: false }));
            }
        };

        const onDegreesChange = (newDegrees: number | null) => {
            const d = newDegrees ?? DEFAULT_DEGREES;
            const nodeIds = instance.nodeIds || [];
            const start = instance.start || '';
            const end = instance.end || '';

            if (callbacks.updateWindow) {
                callbacks.updateWindow({ loading: true, degrees: d });
                fetchVoltagePlugin(nodeIds, start, end, d)
                    .then(resp => callbacks.updateWindow({
                        data: resp.distribution || [],
                        scatterData: resp.scatter || [],
                        timeSeriesData: resp.timeseries || [],
                        loading: false,
                        pendingRequest: { nodeIds, start, end, degrees: d },
                    }))
                    .catch(() => callbacks.updateWindow({ loading: false }));
            }
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
            onFocus: callbacks.onFocus,
        });
    },
};

export default voltagePlugin;
