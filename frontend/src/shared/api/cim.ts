const API_BASE = '/api';

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
