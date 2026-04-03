/** API client for Voltage Heat Map plugin. */

export interface VoltageMapResponse {
    start_node_id: string | null;
    node_count: number;
    node_voltages: Record<string, number>;
    node_currents: Record<string, { a: number; b: number; c: number }>;
    estimated_rows: number;
    agg: string;
}

export interface VoltageMapEstimateResponse {
    estimated_rows: number;
    node_count: number;
}

export async function fetchVoltageMap(
    nodeId: string | null,
    start: string,
    end: string,
    agg: string = 'avg',
    force: boolean = false
): Promise<VoltageMapResponse> {
    const nodePart = nodeId ? `/${nodeId}` : '';
    const forcePart = force ? '&force=true' : '';
    const resp = await fetch(
        `/api/plugins/voltage_heatmap${nodePart}?start_time=${start}&end_time=${end}&agg=${agg}${forcePart}`
    );
    if (!resp.ok) {
        const error = await resp.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Failed to fetch voltage map');
    }
    return resp.json();
}

export async function fetchVoltageMapEstimate(
    nodeId: string | null,
    start: string,
    end: string,
    agg: string = 'avg'
): Promise<VoltageMapEstimateResponse> {
    const nodePart = nodeId ? `/${nodeId}` : '';
    const resp = await fetch(
        `/api/plugins/voltage_heatmap${nodePart}/estimate?start_time=${start}&end_time=${end}&agg=${agg}`
    );
    if (!resp.ok) {
        throw new Error('Failed to fetch estimate');
    }
    return resp.json();
}
