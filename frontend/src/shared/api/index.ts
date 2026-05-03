import type { Node, Edge } from "../types";
import { buildPathQuery } from '../../features/grid/model/ruleQueryBuilder';

export interface TopologyResponse {
    nodes: Node[];
    edges: Edge[];
}

export interface ModelInfo {
    feeder_id: string;
    feeder_uri: string;
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
// Use relative path for LAN compatibility (proxied via Vite on port 3001)
export const ADMIN_API_BASE = API_BASE;

export interface DisplayConfig {
    id: number;
    name: string;
    description: string;
    is_default: boolean;
    is_readonly: boolean;
}

export interface RuleConfig {
    visual_type: string;
    icon?: string;
    color_hex?: string;
    size?: number;
    label?: string;
    radial_offset?: number;
    cluster_enabled?: boolean;
    cluster_radius?: number;
    cluster_max_zoom?: number;
    cluster_min_points?: number;
    min_zoom?: number;
    max_zoom?: number;
    svg_overrides?: Array<{
        conditions: any;
        visual_type?: string;
        icon?: string;
        svg?: string;
        color_hex?: string;
        size?: number;
        mode: 'replace' | 'add';
        tooltip_config?: any;
        line_weight?: number;
        line_style?: 'solid' | 'dashed' | 'dotted';
        center_icon_enabled?: boolean;
        center_icon_size?: number;
        center_icon_rotate?: boolean;
    }>;
    rotate_to_edge?: boolean;
    tooltip_config?: any;
    // Edge-specific styling
    line_weight?: number;
    line_style?: 'solid' | 'dashed' | 'dotted';
    center_icon_enabled?: boolean;
    center_icon_size?: number;
    center_icon_rotate?: boolean;
}

export interface DisplayRule {
    id: number;
    config_id: number;
    name: string;
    priority: number;
    match_conditions: any; // Can be string (from inputs) or object (from API)
    enabled: boolean;
    config: RuleConfig;
}

const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('adminAuth');
    if (token) {
        return { 'Authorization': `Basic ${token}` };
    }
    return {};
};

/** Public — no auth required. Returns enabled rules for the default display config. */
export const fetchActiveDisplayRules = async (): Promise<Array<{ id: number; priority: number; match_conditions: any; config: RuleConfig }>> => {
    const res = await fetch(`${API_BASE}/display-rules/active`);
    if (!res.ok) return [];
    return res.json();
};

export const fetchDisplayConfigs = async (): Promise<DisplayConfig[]> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/configs`, {
        headers: { ...getAuthHeaders() }
    });
    if (res.status === 401) throw new Error('Unauthorized');
    return res.json();
};

export const fetchDisplayRules = async (configId: number): Promise<DisplayRule[]> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/configs/${configId}/rules`, {
        headers: { ...getAuthHeaders() }
    });
    if (res.status === 401) throw new Error('Unauthorized');
    return res.json();
};

export const createDisplayConfig = async (name: string, description: string = ""): Promise<DisplayConfig> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/configs`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify({ name, description })
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
};

export const updateDisplayConfig = async (configId: number, name: string, description: string = ""): Promise<DisplayConfig> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/configs/${configId}`, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify({ name, description })
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
};

export const deleteDisplayConfig = async (configId: number): Promise<void> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/configs/${configId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error(await res.text());
};

export const setDefaultDisplayConfig = async (configId: number): Promise<void> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/configs/${configId}/set-default`, { 
        method: 'PUT',
        headers: { ...getAuthHeaders() }
    });
    if (res.status === 401) throw new Error('Unauthorized');
};

export const saveDisplayRule = async (rule: Partial<DisplayRule>): Promise<DisplayRule> => {
    const payload = { ...rule };
    // Ensure match_conditions is an object for the backend (FastAPI expects Dict)
    if (typeof payload.match_conditions === 'string') {
        try {
            payload.match_conditions = JSON.parse(payload.match_conditions);
        } catch (e) {
            console.error('Invalid match_conditions JSON in saveDisplayRule', e);
        }
    }

    const method = payload.id ? 'PUT' : 'POST';
    const url = payload.id 
        ? `${ADMIN_API_BASE}/display-rules/rules/${payload.id}` 
        : `${ADMIN_API_BASE}/display-rules/configs/${payload.config_id}/rules`;
    
    const res = await fetch(url, {
        method,
        headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify(payload)
    });
    
    if (res.status === 401) throw new Error('Unauthorized');

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API Error ${res.status}: ${text.slice(0, 100)}`);
    }

    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return res.json();
    }
    return res.text() as any;
};

export const deleteDisplayRule = async (ruleId: number): Promise<void> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/rules/${ruleId}`, { 
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
    });
    if (res.status === 401) throw new Error('Unauthorized');
};

export const duplicateDisplayRule = async (ruleId: number): Promise<{id: number, name: string}> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/rules/${ruleId}/duplicate`, { 
        method: 'POST',
        headers: { ...getAuthHeaders() }
    });
    if (res.status === 401) throw new Error('Unauthorized');
    return res.json();
};

export const exportDisplayConfig = async (configId: number): Promise<any> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/configs/${configId}/export`, {
        headers: { ...getAuthHeaders() }
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
};

export const importDisplayConfig = async (data: any): Promise<DisplayConfig> => {
    const res = await fetch(`${ADMIN_API_BASE}/display-rules/configs/import`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            ...getAuthHeaders()
        },
        body: JSON.stringify(data)
    });
    if (res.status === 401) throw new Error('Unauthorized');
    if (!res.ok) throw new Error(await res.text());
    return res.json();
};

export interface RuleTestResponse {
    query: string;
    params: Record<string, any>;
    match_count: number;
    mrids?: string[];
    warnings: string[];
}

export const testDisplayRule = async (match_conditions: any, target_class: string): Promise<RuleTestResponse> => {
    let conditions = match_conditions;
    if (typeof conditions === 'string') {
        try {
            conditions = JSON.parse(conditions);
        } catch (e) {
            return { query: '', params: {}, match_count: 0, warnings: ['Invalid JSON in match conditions'] };
        }
    }

    // Build Cypher client-side — use buildPathQuery so path_steps / custom_cypher rules work.
    // For legacy rules that need target_class, merge it in; path-based rules already have path_steps.
    const builtConditions = conditions.path_steps || conditions.rule_mode === 'custom_cypher'
        ? conditions
        : { ...conditions, target_class };
    const built = buildPathQuery(builtConditions);
    if (!built) {
        return { query: '', params: {}, match_count: 0, warnings: ['No target class, path steps, or Cypher defined'] };
    }

    const res = await fetch(`${API_BASE}/cim/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cypher: built.cypher, params: built.params }),
    });

    if (!res.ok) {
        const text = await res.text();
        return { query: built.cypher, params: built.params as Record<string, any>, match_count: 0, warnings: [text] };
    }

    const data = await res.json();
    return {
        query: built.cypher,
        params: built.params as Record<string, any>,
        match_count: data.count ?? 0,
        mrids: data.mrids || [],
        warnings: [],
    };
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

// --- Feeder Management ---

export const fetchModels = async (): Promise<ModelInfo[]> => {
    const res = await fetch(`${API_BASE}/feeders`);
    if (!res.ok) {
        throw new Error('Failed to fetch feeders');
    }
    return res.json();
};

export const loadModel = async (feederId: string): Promise<ModelInfo> => {
    const res = await fetch(`${API_BASE}/feeders/${feederId}/load`, { method: 'POST' });
    if (!res.ok) {
        throw new Error(`Failed to load feeder ${feederId}`);
    }
    return res.json();
};

export const unloadModel = async (feederId: string): Promise<{ status: string }> => {
    const res = await fetch(`${API_BASE}/feeders/${feederId}/unload`, { method: 'POST' });
    if (!res.ok) {
        throw new Error(`Failed to unload feeder ${feederId}`);
    }
    return res.json();
};

export const resolveNodeModel = async (nodeId: string): Promise<{ mrid: string, name: string, feeder_id: string }> => {
    const res = await fetch(`${API_BASE}/feeders/resolve-node/${nodeId}`);
    if (!res.ok) {
        throw new Error(`Failed to resolve node ${nodeId}`);
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

export const fetchCimProperties = async (mrid: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/cim/properties/${mrid}`);
    if (!res.ok) throw new Error(`Failed to fetch CIM properties for ${mrid}`);
    return res.json();
};

export const fetchCimNeighbors = async (id: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/cim/neighbors/${id}`);
    if (!res.ok) {
        throw new Error(`Failed to fetch CIM neighbors for ${id}`);
    }
    return res.json();
};

export const searchCim = async (query: string, className?: string, globalSearch?: boolean): Promise<any[]> => {
    let url = `${API_BASE}/cim/search?query=${encodeURIComponent(query)}`;
    if (className) {
        url += `&class_name=${encodeURIComponent(className)}`;
    }
    if (globalSearch) {
        url += `&global_search=true`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Search failed');
    return response.json();
};

export const fetchCimSchema = async (): Promise<Record<string, any>> => {
    const response = await fetch(`${API_BASE}/cim/schema`);
    if (!response.ok) throw new Error('Failed to fetch CIM schema');
    return response.json();
};

export const fetchConductingEquipmentClasses = async (): Promise<string[]> => {
    const response = await fetch(`${API_BASE}/cim/conducting-equipment`);
    if (!response.ok) throw new Error('Failed to fetch conducting equipment classes');
    const data = await response.json();
    return data.classes as string[];
};

export const fetchRootableClasses = async (): Promise<string[]> => {
    const response = await fetch(`${API_BASE}/cim/rootable-classes`);
    if (!response.ok) throw new Error('Failed to fetch rootable classes');
    const data = await response.json();
    return data.classes as string[];
};

export const fetchAdjacentClasses = async (className: string): Promise<Array<{ name: string; category: string }>> => {
    const response = await fetch(`${API_BASE}/cim/adjacent-classes/${encodeURIComponent(className)}`);
    if (!response.ok) throw new Error(`Failed to fetch adjacent classes for ${className}`);
    const data = await response.json();
    return data.adjacent as Array<{ name: string; category: string }>;
};

export const fetchCimEquipmentExpanded = async (mrid: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/cim/equipment/${encodeURIComponent(mrid)}/expanded`);
    if (!res.ok) throw new Error(`Failed to fetch expanded CIM detail for ${mrid}`);
    return res.json();
};

export const fetchCimConnections = async (className: string): Promise<string[]> => {
    const response = await fetch(`${API_BASE}/cim/connections/${encodeURIComponent(className)}`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.connected_classes ?? [];
};

export const fetchPluginRegistry = async (): Promise<Array<{name: string, enabled: boolean}>> => {
    const response = await fetch(`${API_BASE}/plugins/registry`);
    if (!response.ok) throw new Error('Failed to fetch plugin registry');
    return response.json();
};

export const fetchConfigOverrides = async (): Promise<Array<{key: string, value: string}>> => {
    const response = await fetch(`${API_BASE}/cim/config`);
    if (!response.ok) throw new Error('Failed to fetch configuration overrides');
    return response.json();
};
