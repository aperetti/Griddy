const API_BASE = '/api/plugins/consumption';

export interface ConsumptionRecord {
    timestamp: string;
    kwh_delivered: number;
    kwh_received: number;
    net_consumption: number;
    kwh_a: number;
    kwh_b: number;
    kwh_c: number;
    temperature: number;
}

export interface ConsumptionResponse {
    start_node_ids: string[];
    node_count: number;
    downstream_node_ids: string[];
    downstream_edge_ids: string[];
    estimated_rows: number;
    time_series: ConsumptionRecord[];
}

export interface ConsumptionEstimateResponse {
    estimated_rows: number;
    node_count: number;
    downstream_node_ids?: string[];
    downstream_edge_ids?: string[];
}

function buildQuery(start: string, end: string, force = false): string {
    const params = new URLSearchParams({ start_time: start, end_time: end });
    if (force) params.set('force', 'true');
    return params.toString();
}

export async function fetchConsumptionPlugin(
    nodeIds: string[],
    start: string,
    end: string,
    force = false,
): Promise<ConsumptionResponse> {
    const res = await fetch(`${API_BASE}/${nodeIds.join(',')}?${buildQuery(start, end, force)}`);
    if (!res.ok) throw new Error(`Consumption fetch failed: ${res.status}`);
    return res.json();
}

export async function fetchConsumptionEstimatePlugin(
    nodeIds: string[],
    start: string,
    end: string,
): Promise<ConsumptionEstimateResponse> {
    const res = await fetch(`${API_BASE}/${nodeIds.join(',')}/estimate?${buildQuery(start, end)}`);
    if (!res.ok) throw new Error(`Consumption estimate failed: ${res.status}`);
    return res.json();
}
