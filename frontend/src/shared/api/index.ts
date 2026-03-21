import type { Node, Edge } from "../types";

export interface TopologyResponse {
    nodes: Node[];
    edges: Edge[];
}

export interface ModelInfo {
    model_id: string;
    filename: string;
    path: string;
    size_mb: number;
    loaded: boolean;
    node_count: number;
    edge_count: number;
}

export interface ConsumptionResponse {
    start_node_id: string;
    node_count: number;
    downstream_node_ids: string[];
    downstream_edge_ids: string[];
    estimated_rows: number;
    time_series: {
        timestamp: string;
        kwh_delivered: number;
        kwh_a: number;
        kwh_b: number;
        kwh_c: number;
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
// Point to the main Python backend (port 8000) for Display Rule configuration
export const ADMIN_API_BASE = 'http://127.0.0.1:8000/api';

export interface DisplayConfig {
    id: number;
    name: string;
    description: string;
    is_default: boolean;
    is_readonly: boolean;
}

export interface DisplayRule {
    id: number;
    config_id: number;
    name: string;
    priority: number;
    match_conditions: string;
    visual_type: string;
    icon?: string;
    color_hex?: string;
}

export const fetchDisplayConfigs = async (): Promise<DisplayConfig[]> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/configs`);
    return res.json();
};

export const fetchDisplayRules = async (configId: number): Promise<DisplayRule[]> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/configs/${configId}/rules`);
    return res.json();
};

export const setDefaultDisplayConfig = async (configId: number): Promise<void> => {
    await fetch(`${ADMIN_API_BASE}/display-rules/configs/${configId}/set-default`, { method: 'POST' });
};

export const saveDisplayRule = async (rule: Partial<DisplayRule>): Promise<DisplayRule> => {
    const method = rule.id ? 'PUT' : 'POST';
    const url = rule.id 
        ? `${ADMIN_API_BASE}/display-rules/rules/${rule.id}` 
        : `${ADMIN_API_BASE}/display-rules/configs/${rule.config_id}/rules`;
    
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule)
    });
    return res.json();
};

export const deleteDisplayRule = async (ruleId: number): Promise<void> => {
    await fetch(`${ADMIN_API_BASE}/display-rules/rules/${ruleId}`, { method: 'DELETE' });
};

export const fetchTopology = async (models?: string[]): Promise<TopologyResponse> => {
    let url = `${API_BASE}/graph/topology`;
    if (models && models.length > 0) {
        url += `?models=${models.join(',')}`;
    }
    const res = await fetch(url);
    return res.json();
};

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
export const nlQuery = async (query: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/agent/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) {
        throw new Error('Query failed');
    }
    return res.json();
};

// --- Model Management ---

export const fetchModels = async (): Promise<ModelInfo[]> => {
    const res = await fetch(`${API_BASE}/models`);
    if (!res.ok) {
        throw new Error('Failed to fetch models');
    }
    return res.json();
};

export const loadModel = async (modelId: string): Promise<ModelInfo> => {
    const res = await fetch(`${API_BASE}/models/${modelId}/load`, { method: 'POST' });
    if (!res.ok) {
        throw new Error(`Failed to load model ${modelId}`);
    }
    return res.json();
};

export const unloadModel = async (modelId: string): Promise<{ status: string }> => {
    const res = await fetch(`${API_BASE}/models/${modelId}/unload`, { method: 'POST' });
    if (!res.ok) {
        throw new Error(`Failed to unload model ${modelId}`);
    }
    return res.json();
};

// --- CIM Diagnostics ---

export const fetchCimEquipment = async (mrid: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/cim/equipment/${mrid}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch CIM equipment detail for ${mrid}`);
    }
    return res.json();
};

export const fetchCimNode = async (nodeId: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/cim/node/${nodeId}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch CIM node detail for ${nodeId}`);
    }
    return res.json();
};

export const fetchCimNeighbors = async (id: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/cim/neighbors/${id}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch CIM neighbors for ${id}`);
    }
    return res.json();
};

export const searchCim = async (query: string): Promise<any[]> => {
    const response = await fetch(`${API_BASE}/cim/search?query=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('Search failed');
    return response.json();
};

export const fetchCimSchema = async (): Promise<Record<string, any>> => {
    const response = await fetch(`${API_BASE}/cim/schema`);
    if (!response.ok) throw new Error('Failed to fetch CIM schema');
    return response.json();
};
