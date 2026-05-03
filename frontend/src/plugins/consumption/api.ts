import { perf } from '@plugin-sdk';

const API_BASE = '/api/plugins/consumption';

export interface ConsumptionRecord {
    timestamp: string;
    kwh_delivered: number;
    kwh_received: number;
    net_consumption: number;
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

async function fetchAndParse<T>(label: string, url: string): Promise<T> {
    const res = await perf.measureAsync(`${label}:fetch`, () => fetch(url));
    perf.recordServerTiming(res.headers.get('Server-Timing'));
    if (!res.ok) throw new Error(`${label} failed: ${res.status}`);
    return perf.measureAsync(`${label}:parse`, () => res.json() as Promise<T>);
}

export async function fetchConsumptionPlugin(
    nodeIds: string[],
    start: string,
    end: string,
    force = false,
): Promise<ConsumptionResponse> {
    const url = `${API_BASE}/${nodeIds.join(',')}?${buildQuery(start, end, force)}`;
    return fetchAndParse<ConsumptionResponse>('consumption', url);
}

export async function fetchConsumptionEstimatePlugin(
    nodeIds: string[],
    start: string,
    end: string,
): Promise<ConsumptionEstimateResponse> {
    const url = `${API_BASE}/${nodeIds.join(',')}/estimate?${buildQuery(start, end)}`;
    return fetchAndParse<ConsumptionEstimateResponse>('consumption_estimate', url);
}
