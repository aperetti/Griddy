const API_BASE = '/api/plugins/voltage';

export interface VoltageDistributionPoint {
    voltage: number;
    phase_a: number;
    phase_b: number;
    phase_c: number;
}

export interface VoltageScatterPoint {
    voltage: number;
    loading: number;
    count: number;
}

export interface VoltageTimeseriesPoint {
    date: string;
    p10: number;
    p50: number;
    p90: number;
}

export interface VoltageResponse {
    start_node_ids: string[];
    node_count: number;
    downstream_node_ids: string[];
    downstream_edge_ids: string[];
    estimated_rows: number;
    distribution: VoltageDistributionPoint[];
    scatter: VoltageScatterPoint[];
    timeseries: VoltageTimeseriesPoint[];
    mean_voltage?: number;
    median_voltage?: number;
}

export interface VoltageEstimateResponse {
    estimated_rows: number;
    node_count: number;
    downstream_node_ids?: string[];
    downstream_edge_ids?: string[];
}

function buildQuery(start: string, end: string, degrees?: number | null): string {
    const params = new URLSearchParams({
        start_time: start,
        end_time: end,
    });
    if (degrees != null) params.set('degrees', String(degrees));
    return params.toString();
}

export async function fetchVoltagePlugin(
    nodeIds: string[],
    start: string,
    end: string,
    degrees?: number | null,
): Promise<VoltageResponse> {
    const res = await fetch(`${API_BASE}/${nodeIds.join(',')}?${buildQuery(start, end, degrees)}`);
    if (!res.ok) throw new Error(`Voltage fetch failed: ${res.status}`);
    return res.json();
}

export async function fetchVoltageEstimatePlugin(
    nodeIds: string[],
    start: string,
    end: string,
    degrees?: number | null,
): Promise<VoltageEstimateResponse> {
    const res = await fetch(`${API_BASE}/${nodeIds.join(',')}/estimate?${buildQuery(start, end, degrees)}`);
    if (!res.ok) throw new Error(`Voltage estimate failed: ${res.status}`);
    return res.json();
}
