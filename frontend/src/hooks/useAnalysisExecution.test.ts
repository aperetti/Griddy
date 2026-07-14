import { describe, it, expect, vi, beforeEach } from 'vitest';
import { consumptionPlugin } from '../plugins/consumption';
import { voltagePlugin } from '../plugins/voltage';
import * as consumptionApi from '../plugins/consumption/api';
import * as voltageApi from '../plugins/voltage/api';
import type { PluginExecutionContext } from '../plugins/types';
import type { Node } from '../shared/types';

vi.mock('../plugins/consumption/api', () => ({
    fetchConsumptionPlugin: vi.fn(),
    fetchConsumptionEstimatePlugin: vi.fn(),
}));

vi.mock('../plugins/voltage/api', () => ({
    fetchVoltagePlugin: vi.fn(),
    fetchVoltageEstimatePlugin: vi.fn(),
}));

function makeCtx(overrides: Partial<PluginExecutionContext> = {}): PluginExecutionContext {
    return {
        selectedNodes: [{ id: 'node1', name: 'Node 1' } as Node],
        selectedEdgeIds: [],
        resolveEdgeNodesToNodeIds: () => [],
        setAnalysisWindows: vi.fn(),
        bringWindowToFront: vi.fn(),
        updateWindow: vi.fn(),
        openAnalysisWindow: vi.fn().mockReturnValue('win1'),
        updateWindowProps: vi.fn(),
        dateRange: { start: '2024-01-01T00:00:00', end: '2024-01-07T23:59:59' },
        systemConfig: {},
        addHighlightedNodes: vi.fn(),
        addHighlightedEdges: vi.fn(),
        ...overrides,
    };
}

describe('Consumption plugin handleRun', () => {
    beforeEach(() => vi.clearAllMocks());

    it('adds a window and calls bringWindowToFront immediately', async () => {
        (consumptionApi.fetchConsumptionEstimatePlugin as any).mockResolvedValue({
            estimated_rows: 100,
            node_count: 1,
        });
        (consumptionApi.fetchConsumptionPlugin as any).mockResolvedValue({
            time_series: [],
            downstream_node_ids: [],
            downstream_edge_ids: [],
        });

        const ctx = makeCtx();
        await consumptionPlugin.handleRun(ctx);

        expect(ctx.setAnalysisWindows).toHaveBeenCalledOnce();
        const updater = (ctx.setAnalysisWindows as any).mock.calls[0][0];
        const result = updater([]);
        expect(result).toHaveLength(1);
        expect(result[0].isOpen).toBe(true);
        expect(result[0].loading).toBe(true);
        expect(result[0].type).toBe('consumption');

        expect(ctx.bringWindowToFront).toHaveBeenCalledOnce();
    });

    it('highlights nodes from estimate response', async () => {
        (consumptionApi.fetchConsumptionEstimatePlugin as any).mockResolvedValue({
            estimated_rows: 100,
            node_count: 1,
            downstream_node_ids: ['est-node1'],
            downstream_edge_ids: ['est-edge1'],
        });
        (consumptionApi.fetchConsumptionPlugin as any).mockResolvedValue({
            time_series: [],
            downstream_node_ids: [],
            downstream_edge_ids: [],
        });

        const ctx = makeCtx();
        await consumptionPlugin.handleRun(ctx);

        expect(ctx.addHighlightedNodes).toHaveBeenCalledWith(['est-node1']);
        expect(ctx.addHighlightedEdges).toHaveBeenCalledWith(['est-edge1']);
    });

    it('highlights nodes from full fetch response', async () => {
        (consumptionApi.fetchConsumptionEstimatePlugin as any).mockResolvedValue({
            estimated_rows: 100,
            node_count: 1,
        });
        (consumptionApi.fetchConsumptionPlugin as any).mockResolvedValue({
            time_series: [{ timestamp: '2024-01-01T00:00:00Z' }],
            downstream_node_ids: ['node1', 'node2'],
            downstream_edge_ids: ['edge1'],
        });

        const ctx = makeCtx();
        await consumptionPlugin.handleRun(ctx);

        expect(ctx.addHighlightedNodes).toHaveBeenCalledWith(['node1', 'node2']);
        expect(ctx.addHighlightedEdges).toHaveBeenCalledWith(['edge1']);
    });

    it('pauses the window when estimated_rows exceeds threshold', async () => {
        (consumptionApi.fetchConsumptionEstimatePlugin as any).mockResolvedValue({
            estimated_rows: 3_000_000,
            node_count: 1,
        });

        const ctx = makeCtx();
        await consumptionPlugin.handleRun(ctx);

        expect(ctx.updateWindow).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ isPaused: true, loading: false }),
        );
        expect(consumptionApi.fetchConsumptionPlugin).not.toHaveBeenCalled();
    });

    it('sets loading:false with empty data array on estimate failure', async () => {
        (consumptionApi.fetchConsumptionEstimatePlugin as any).mockRejectedValue(new Error('500'));

        const ctx = makeCtx();
        await consumptionPlugin.handleRun(ctx);

        expect(ctx.updateWindow).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ loading: false }),
        );
    });

    it('returns early when no nodes and no edges are selected', async () => {
        const ctx = makeCtx({ selectedNodes: [], selectedEdgeIds: [] });
        await consumptionPlugin.handleRun(ctx);

        expect(ctx.setAnalysisWindows).not.toHaveBeenCalled();
    });
});

describe('Voltage plugin handleRun', () => {
    beforeEach(() => vi.clearAllMocks());

    it('adds a window immediately with loading:true', async () => {
        (voltageApi.fetchVoltageEstimatePlugin as any).mockResolvedValue({
            estimated_rows: 100,
            node_count: 1,
        });
        (voltageApi.fetchVoltagePlugin as any).mockResolvedValue({
            distribution: [],
            scatter: [],
            timeseries: [],
            downstream_node_ids: [],
            downstream_edge_ids: [],
        });

        const ctx = makeCtx();
        await voltagePlugin.handleRun(ctx);

        const updater = (ctx.setAnalysisWindows as any).mock.calls[0][0];
        const result = updater([]);
        expect(result[0].isOpen).toBe(true);
        expect(result[0].loading).toBe(true);
        expect(result[0].type).toBe('voltage');
    });

    it('pauses the window when estimated_rows exceeds threshold', async () => {
        (voltageApi.fetchVoltageEstimatePlugin as any).mockResolvedValue({
            estimated_rows: 5_000_000,
            node_count: 1,
        });

        const ctx = makeCtx();
        await voltagePlugin.handleRun(ctx);

        expect(ctx.updateWindow).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ isPaused: true, loading: false }),
        );
        expect(voltageApi.fetchVoltagePlugin).not.toHaveBeenCalled();
    });
});
