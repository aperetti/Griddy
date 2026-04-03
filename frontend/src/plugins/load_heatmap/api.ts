/**
 * API for the Network Load Heatmap plugin.
 */

const BASE_URL = '/api/plugins/load_heatmap';

export interface LoadMapEstimate {
    estimated_rows: number;
    error?: string;
}

export interface LoadMapResponse {
    edge_count: number;
    edge_loads: Record<string, number>;
    agg: string;
    error?: string;
}

/**
 * Fetches an estimate of the number of rows that will be processed.
 */
export async function fetchLoadMapEstimate(
    nodeId: string | null,
    startTime: string,
    endTime: string,
    agg: string = 'mean'
): Promise<LoadMapEstimate> {
    const params = new URLSearchParams({
        start_time: startTime,
        end_time: endTime,
        agg,
    });
    if (nodeId) params.append('node_id', nodeId);

    const resp = await fetch(`${BASE_URL}/estimate?${params.toString()}`);
    if (!resp.ok) {
        throw new Error(`Failed to fetch load map estimate: ${resp.statusText}`);
    }
    return resp.json();
}

/**
 * Fetches the actual edge load mapping.
 */
export async function fetchLoadMap(
    nodeId: string | null,
    startTime: string,
    endTime: string,
    agg: string = 'mean'
): Promise<LoadMapResponse> {
    const params = new URLSearchParams({
        start_time: startTime,
        end_time: endTime,
        agg,
    });
    if (nodeId) params.append('node_id', nodeId);

    const resp = await fetch(`${BASE_URL}/map?${params.toString()}`);
    if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || `Failed to fetch load map: ${resp.statusText}`);
    }
    return resp.json();
}
