import { Map as MapIcon } from 'lucide-react';
import { createElement } from 'react';
import type { SdkPluginDefinition, SdkNode, SdkPluginContext } from '../sdk';
import { fetchVoltageMap, fetchVoltageMapEstimate } from './api';
import { VoltageHeatMapModal } from './VoltageHeatMapModal';

const DEFAULT_THRESHOLD = 5_000_000;

async function _performFetch(
    windowId: string,
    nodeId: string | null,
    start: string,
    end: string,
    ctx: SdkPluginContext
) {
    ctx.updateWindowProps(windowId, { loading: true, isPaused: false } as any);
    try {
        const resp = await fetchVoltageMap(nodeId, start, end, 'avg', true);
        ctx.updateAnalysisData(windowId, resp);

        // Apply results to the map
        ctx.setNodeAverages(resp.node_voltages);

        // Ensure the map is aware of our base voltage
        ctx.setVoltageScale({
            criticalHigh: 1.1,
            highWarning: 1.06,
            lowWarning: 0.94,
            criticalLow: 0.9,
            baseVoltage: 230.0,
        });

    } catch (e) {
        console.error('[voltage_heatmap] fetch failed', e);
        ctx.setAnalysisLoading(windowId, false);
    }
}

export const voltageHeatMapPlugin: SdkPluginDefinition = {
    type: 'voltage_heatmap',
    category: 'system',
    label: 'Voltage Heat Map',
    description: 'Visualize average voltage distributions across the entire map or a selected branch.',
    permissions: ['analytics:voltage', 'topology:read'],
    icon: MapIcon,
    color: 'orange',

    appliesToNodes: (_nodes: SdkNode[], _edgeCount = 0) =>
        true, // Heatmap can run with no selection (entire grid)

    async handleRun(ctx) {
        const nodeIds = ctx.selectedNodes.map(n => n.id);
        const nodeId = nodeIds.length === 1 ? nodeIds[0] : null;

        const nodeName = nodeId
            ? (ctx.selectedNodes[0]?.name ?? 'Branch')
            : 'Entire Grid';

        const windowId = ctx.openAnalysisWindow('voltage_heatmap', nodeName);

        const { start, end } = ctx.dateRange;
        if (!start || !end) {
            console.error('[voltage_heatmap] Cannot run analysis: simulation time range is missing.');
            return;
        }
        try {
            const est = await fetchVoltageMapEstimate(nodeId, start, end);
            const threshold = Number(ctx.systemConfig['analytics_threshold'] || DEFAULT_THRESHOLD);

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
            console.error('[voltage_heatmap] estimate failed', err);
            ctx.setAnalysisLoading(windowId, false);
        }
    },

    renderWindow(instance: any, callbacks: any) {
        const req = instance.pendingRequest ?? { nodeId: instance.nodeId, start: '', end: '' };

        const onConfirm = () => {
             // Use pre-bound updateWindow if available, or ctx through callbacks
             callbacks.updateWindow?.({ loading: true, isPaused: false });
             
             // Accessing context via a clever closure or just re-using the API
             fetchVoltageMap(req.nodeId, req.start, req.end, 'avg', true)
                .then(resp => {
                    callbacks.updateWindow?.({ data: resp, loading: false });
                    callbacks.setNodeAverages?.(resp.node_voltages);
                    callbacks.setVoltageScale?.({
                        criticalHigh: 1.1,
                        highWarning: 1.06,
                        lowWarning: 0.94,
                        criticalLow: 0.9,
                        baseVoltage: 230.0,
                    });
                });
        };

        return createElement(VoltageHeatMapModal, {
            isOpen: instance.isOpen,
            onClose: () => {
                // Clear node averages when closing the heatmap
                // This is a bit tricky since we don't have ctx here.
                // We'll handle this in App.tsx by watching active window types.
                callbacks.onClose();
            },
            onMinimize: callbacks.onMinimize,
            loading: instance.loading,
            data: instance.data,
            estimatedRows: instance.estimatedRows,
            nodeName: instance.nodeName,
            isMinimized: instance.isMinimized,
            isPaused: instance.isPaused,
            zIndex: instance.zIndex ?? 1000,
            onConfirm,
            onFocus: callbacks.onFocus,
        });
    },
};

export default voltageHeatMapPlugin;
