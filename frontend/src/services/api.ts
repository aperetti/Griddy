const API_BASE = "/api";

export interface Node {
    id: string;
    type: string;  // "Bus" | "Substation"
    name: string;
    position: [number, number];
    circuit_id?: string;
    phases?: string[];
    base_voltage_kv?: number;
    attached_equipment?: Array<{
        mrid: string;
        type: 'EnergyConsumer' | 'EnergySource' | 'Capacitor';
        name: string;
        phases?: string[];
        [key: string]: unknown;
    }>;
}

export interface Edge {
    id?: string;
    name?: string;
    source: string;
    target: string;
    sourcePosition: [number, number];
    targetPosition: [number, number];
    circuit_id?: string;
    phases?: string[];
    edge_type?: string;
    is_open?: boolean;
    transformer_kva?: number;
    length_m?: number;
}

export interface Topology {
    nodes: Node[];
    edges: Edge[];
}

export async function fetchTopology(): Promise<Topology> {
    const response = await fetch(`${API_BASE}/graph/topology`);
    return response.json();
}

export async function runPhaseAnalytics(nodeId: string, start: string, end: string) {
    const response = await fetch(`${API_BASE}/analytics/phase-balance/${nodeId}?start_time=${start}&end_time=${end}`);
    return response.json();
}

export async function fetchConsumption(nodeId: string, start: string, end: string) {
    const response = await fetch(`${API_BASE}/analytics/consumption/${nodeId}?start_time=${start}&end_time=${end}`);
    return response.json();
}

export async function fetchVoltageDistribution(nodeId: string, start: string, end: string) {
    const response = await fetch(`${API_BASE}/analytics/voltage/${nodeId}?start_time=${start}&end_time=${end}`);
    return response.json();
}

export async function nlQuery(query: string) {
    const response = await fetch(`${API_BASE}/agent/query?query=${encodeURIComponent(query)}`, {
        method: 'POST'
    });
    return response.json();
}
