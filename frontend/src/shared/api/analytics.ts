export interface ConsumptionResponse {
    start_node_id: string;
    node_count: number;
    downstream_node_ids: string[];
    downstream_edge_ids: string[];
    estimated_rows: number;
    time_series: {
        timestamp: string;
        kwh_delivered: number;
        temperature: number;
    }[];
}

export interface VoltageDistributionResponse {
    start_node_id: string;
    node_count: number;
    downstream_node_ids: string[];
    downstream_edge_ids: string[];
    estimated_rows: number;
    distribution: any[];
    scatter: any[];
    timeseries: any[];
    node_averages?: Record<string, number>;
}

export interface MapVoltageResponse {
    node_voltages: Record<string, number>;
    node_currents?: Record<string, { a: number, b: number, c: number }>;
    estimated_rows: number;
}

export interface Alarm {
    alarm_id: string;
    node_id: string;
    timestamp: string;
    alarm_code: string;
    severity: string;
    message: string;
    is_active: boolean;
}

export interface PhaseBalanceResponse {
    median_current_a: number;
    median_current_b: number;
    median_current_c: number;
    total_kwh_delivered: number;
    imbalance_delta: number;
    peak_kwh_time: string | null;
    peak_kwh: number;
    peak_current_a: number;
    peak_current_b: number;
    peak_current_c: number;
    start_node_id: string;
    node_count: number;
    downstream_node_ids: string[];
    downstream_edge_ids: string[];
    estimated_rows: number;
}

const API_BASE = '/api';

export const runPhaseAnalytics = async (nodeId: string, startDate?: string, endDate?: string): Promise<PhaseBalanceResponse> => {
    let url = `${API_BASE}/analytics/phase-balance/${nodeId}?`;
    if (startDate) url += `start_time=${startDate}&`;
    if (endDate) url += `end_time=${endDate}`;
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error('Analytics failed');
    }
    return res.json();
};

export const fetchConsumption = async (node_id: string | string[], start: string, end: string): Promise<ConsumptionResponse> => {
    const id = Array.isArray(node_id) ? node_id.join(',') : node_id;
    const params = new URLSearchParams({ start_time: start, end_time: end });
    const res = await fetch(`${API_BASE}/analytics/consumption/${id}?${params.toString()}`);
    if (!res.ok) {
        throw new Error('Failed to fetch consumption');
    }
    return res.json();
};

export const fetchConsumptionEstimate = async (node_id: string | string[], start: string, end: string): Promise<ConsumptionResponse> => {
    const id = Array.isArray(node_id) ? node_id.join(',') : node_id;
    const params = new URLSearchParams({ start_time: start, end_time: end });
    const res = await fetch(`${API_BASE}/analytics/consumption/${id}/estimate?${params.toString()}`);
    if (!res.ok) {
        throw new Error('Failed to fetch consumption estimate');
    }
    return res.json();
};

export const fetchVoltageDistribution = async (node_id: string | string[], start: string, end: string, degrees?: number | null): Promise<VoltageDistributionResponse> => {
    const id = Array.isArray(node_id) ? node_id.join(',') : node_id;
    const params = new URLSearchParams({ start_time: start, end_time: end });
    if (degrees !== undefined && degrees !== null) params.append('degrees', degrees.toString());
    const res = await fetch(`${API_BASE}/analytics/voltage/${id}?${params.toString()}`);
    if (!res.ok) {
        throw new Error('Failed to fetch voltage limits');
    }
    return res.json();
};

export const fetchVoltageEstimate = async (node_id: string | string[], start: string, end: string, degrees?: number | null): Promise<VoltageDistributionResponse> => {
    const id = Array.isArray(node_id) ? node_id.join(',') : node_id;
    const params = new URLSearchParams({ start_time: start, end_time: end });
    if (degrees !== undefined && degrees !== null) params.append('degrees', degrees.toString());
    const res = await fetch(`${API_BASE}/analytics/voltage/${id}/estimate?${params.toString()}`);
    if (!res.ok) {
        throw new Error('Failed to fetch voltage estimate');
    }
    return res.json();
};

export const fetchMapVoltage = async (start: string, end: string, agg: string = 'median', node_id?: string | null): Promise<MapVoltageResponse> => {
    const params = new URLSearchParams({ start_time: start, end_time: end, agg });
    if (node_id) params.append('node_id', node_id);
    const res = await fetch(`${API_BASE}/analytics/map-voltage?${params.toString()}`);
    if (!res.ok) {
        throw new Error('Failed to fetch map voltage overlay');
    }
    return res.json();
};

export const fetchMapVoltageEstimate = async (start: string, end: string, agg: string = 'median', node_id?: string | null): Promise<MapVoltageResponse> => {
    const params = new URLSearchParams({ start_time: start, end_time: end, agg });
    if (node_id) params.append('node_id', node_id);
    const res = await fetch(`${API_BASE}/analytics/map-voltage/estimate?${params.toString()}`);
    if (!res.ok) {
        throw new Error('Failed to fetch map voltage estimate overlay');
    }
    return res.json();
};

export const fetchAlarms = async (nodeId: string, includeDownstream: boolean = true): Promise<Alarm[]> => {
    const res = await fetch(`${API_BASE}/discovery/alarms/${nodeId}?include_downstream=${includeDownstream}`);
    if (!res.ok) {
        throw new Error('Failed to fetch alarms');
    }
    return res.json();
};
