import { perf } from '@plugin-sdk';

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

function buildQuery(start: string, end: string, degrees?: number | null, force = false): string {
    const params = new URLSearchParams({ start_time: start, end_time: end });
    if (degrees != null) params.set('degrees', String(degrees));
    if (force) params.set('force', 'true');
    return params.toString();
}

async function fetchAndParse<T>(label: string, url: string): Promise<T> {
    const res = await perf.measureAsync(`${label}:fetch`, () => fetch(url));
    perf.recordServerTiming(res.headers.get('Server-Timing'));
    if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
    return perf.measureAsync(`${label}:parse`, () => res.json() as Promise<T>);
}

export async function fetchVoltagePlugin(
    nodeIds: string[],
    start: string,
    end: string,
    degrees?: number | null,
    force = false,
): Promise<VoltageResponse> {
    const url = `${API_BASE}/${nodeIds.join(',')}?${buildQuery(start, end, degrees, force)}`;
    return fetchAndParse<VoltageResponse>('voltage', url);
}

export async function fetchVoltageEstimatePlugin(
    nodeIds: string[],
    start: string,
    end: string,
    degrees?: number | null,
): Promise<VoltageEstimateResponse> {
    const url = `${API_BASE}/${nodeIds.join(',')}/estimate?${buildQuery(start, end, degrees)}`;
    return fetchAndParse<VoltageEstimateResponse>('voltage_estimate', url);
}
