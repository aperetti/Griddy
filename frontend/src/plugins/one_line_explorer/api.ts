import type { OneLineDiagramData } from './model/OneLineModel';

const BASE = '/api/plugins/one-line-explorer';

export async function fetchOneLineDiagram(
    nodeId: string,
    depth = 2,
): Promise<OneLineDiagramData> {
    const params = new URLSearchParams({ depth: String(depth) });
    const res = await fetch(`${BASE}/diagram/${encodeURIComponent(nodeId)}?${params}`);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`[one_line_explorer] ${res.status} ${text}`);
    }
    return res.json();
}
export async function fetchNodeAttributes(nodeId: string): Promise<any> {
    const res = await fetch(`/api/cim/node/${encodeURIComponent(nodeId)}`);
    if (!res.ok) {
        throw new Error(`[one_line_explorer] Failed to fetch node attributes: ${res.status}`);
    }
    return res.json();
}

export async function fetchEquipmentAttributes(mrid: string): Promise<any> {
    const res = await fetch(`/api/cim/equipment/${encodeURIComponent(mrid)}`);
    if (!res.ok) {
        // Fallback to generic properties if equipment detail is missing
        const propRes = await fetch(`/api/cim/properties/${encodeURIComponent(mrid)}`);
        if (propRes.ok) return propRes.json();
        
        throw new Error(`[one_line_explorer] Failed to fetch equipment attributes: ${res.status}`);
    }
    return res.json();
}
