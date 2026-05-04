import { buildPathQuery } from '../../features/grid/model/ruleQueryBuilder';

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

export interface RuleTestResponse {
    query: string;
    params: Record<string, any>;
    match_count: number;
    mrids?: string[];
    warnings: string[];
}

const API_BASE = '/api';
export const ADMIN_API_BASE = '/admin-api';

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
