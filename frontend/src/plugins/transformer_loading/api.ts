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
    total_count: number;
    limit: number;
    offset: number;
    search: string;
    sort_field: string;
    sort_direction: string;
}

export async function fetchTransformerLoading(
    nodeIds: string[],
    limit: number = 100,
    offset: number = 0,
    search: string = "",
    sortField: string = "name",
    sortDirection: string = "asc"
): Promise<TransformerLoadingResponse> {
    const ids = nodeIds.length === 0 ? 'all' : nodeIds.join(',');
    const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        search,
        sort_field: sortField,
        sort_direction: sortDirection
    });
    
    const res = await fetch(`${API_BASE}/${ids}?${params.toString()}`);
    if (!res.ok) throw new Error(`Transformer loading fetch failed: ${res.status}`);
    return res.json();
}
