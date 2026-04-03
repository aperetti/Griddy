const API_BASE = '/api/plugins/transformer-loading';

export interface TransformerEnd {
    end_number: number | null;
    rated_s_kva: number | null;
    rated_u_v: number | null;
    resistance_ohm: number | null;
    reactance_ohm: number | null;
    short_term_s_kva: number | null;
    emergency_s_kva: number | null;
}

export interface TransformerRecord {
    mrid: string;
    name: string | null;
    loading_percent: number | null;
    ends: TransformerEnd[];
}

export interface TransformerLoadingResponse {
    transformers: TransformerRecord[];
    count: number;
}

export async function fetchTransformerLoading(
    nodeIds: string[],
): Promise<TransformerLoadingResponse> {
    const selector = nodeIds.length > 0 ? nodeIds.join(',') : 'all';
    const res = await fetch(`${API_BASE}/${selector}`);
    if (!res.ok) throw new Error(`Transformer loading fetch failed: ${res.status}`);
    return res.json();
}
