import type { Node, Edge } from "../types";

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

const API_BASE = '/api';

export const fetchTopology = async (models?: string[]): Promise<TopologyResponse> => {
    let url = `${API_BASE}/graph/topology`;
    if (models && models.length > 0) {
        url += `?models=${models.join(',')}`;
    }
    const res = await fetch(url);
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
