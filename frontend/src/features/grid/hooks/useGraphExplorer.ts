import { useState, useCallback, useRef } from 'react';
import { fetchCimNeighbors, fetchCimEquipment, fetchCimNode } from '../../../shared/api';

export interface GNode {
    id: string;
    label: string;
    subLabel?: string;
    fill: string;
    size: number;
    data?: { cimType: string; isRoot?: boolean };
}

export interface GEdge {
    id: string;
    source: string;
    target: string;
}

function nodeColor(cimType: string, isRoot = false): string {
    if (isRoot) return '#fcc419';
    return cimType === 'ConnectivityNode' ? '#40c057' : '#4dabf7';
}

function makeNode(id: string, name: string, cimType: string, isRoot = false): GNode {
    return {
        id,
        label: name || id.slice(0, 12),
        subLabel: cimType || undefined,
        fill: nodeColor(cimType, isRoot),
        size: isRoot ? 8 : 5,
        data: { cimType, isRoot },
    };
}

async function fetchDetails(id: string): Promise<any> {
    try { return await fetchCimEquipment(id); } catch { /* fall through */ }
    try { return await fetchCimNode(id); } catch { /* not found */ }
    return null;
}

export function useGraphExplorer() {
    const [nodes, setNodes] = useState<GNode[]>([]);
    const [edges, setEdges] = useState<GEdge[]>([]);
    const [detailCache, setDetailCache] = useState<Record<string, any>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

    // Use refs for synchronous guard checks (avoids stale closure issues)
    const expandedRef = useRef(new Set<string>());
    const loadingRef = useRef(new Set<string>());
    const detailPendingRef = useRef(new Set<string>());

    const setLoading = (id: string, on: boolean) => {
        if (on) { loadingRef.current.add(id); } else { loadingRef.current.delete(id); }
        setLoadingIds(new Set(loadingRef.current));
    };

    const loadRoot = useCallback(async (id: string) => {
        // Reset all state
        setNodes([]);
        setEdges([]);
        setDetailCache({});
        setSelectedId(id);
        setLoadingIds(new Set());
        expandedRef.current = new Set();
        loadingRef.current = new Set();
        detailPendingRef.current = new Set();

        setLoading(id, true);
        try {
            const result = await fetchCimNeighbors(id);
            if (!result) return;

            const rootCimType = result.cim_class || result.type || 'Equipment';
            const rootNode = makeNode(id, result.name || id, rootCimType, true);

            const newNodes: GNode[] = [rootNode];
            const newEdges: GEdge[] = [];
            const seen = new Set<string>([id]);

            for (const nb of result.neighbors ?? []) {
                if (!nb.id || seen.has(nb.id)) continue;
                seen.add(nb.id);
                newNodes.push(makeNode(nb.id, nb.name || nb.id, nb.cim_class || nb.type || 'Equipment'));
                newEdges.push({ id: `${id}-${nb.id}`, source: id, target: nb.id, label: nb.relation });
            }

            setNodes(newNodes);
            setEdges(newEdges);
            expandedRef.current.add(id);

            // Prefetch root details
            const details = await fetchDetails(id);
            if (details) setDetailCache({ [id]: details });
        } finally {
            setLoading(id, false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const expandNode = useCallback(async (id: string) => {
        if (expandedRef.current.has(id) || loadingRef.current.has(id)) return;

        setLoading(id, true);
        try {
            const result = await fetchCimNeighbors(id);
            if (!result) return;

            setNodes(prev => {
                const existingIds = new Set(prev.map(n => n.id));
                const toAdd: GNode[] = [];
                for (const nb of result.neighbors ?? []) {
                    if (!nb.id || existingIds.has(nb.id)) continue;
                    toAdd.push(makeNode(nb.id, nb.name || nb.id, nb.cim_class || nb.type || 'Equipment'));
                }
                return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
            });

            setEdges(prev => {
                const existingIds = new Set(prev.map(e => e.id));
                const toAdd: GEdge[] = [];
                for (const nb of result.neighbors ?? []) {
                    if (!nb.id) continue;
                    const fwd = `${id}-${nb.id}`;
                    const rev = `${nb.id}-${id}`;
                    if (!existingIds.has(fwd) && !existingIds.has(rev)) {
                        toAdd.push({ id: fwd, source: id, target: nb.id, label: nb.relation });
                    }
                }
                return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
            });

            expandedRef.current.add(id);
        } finally {
            setLoading(id, false);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const selectNode = useCallback(async (id: string) => {
        setSelectedId(id);
        // Check cache / in-flight
        if (detailPendingRef.current.has(id)) return;
        setDetailCache(prev => {
            if (prev[id]) return prev;
            // Fire fetch
            detailPendingRef.current.add(id);
            fetchDetails(id).then(details => {
                detailPendingRef.current.delete(id);
                if (details) setDetailCache(p => ({ ...p, [id]: details }));
            });
            return prev;
        });
    }, []);

    const reset = useCallback(() => {
        setNodes([]);
        setEdges([]);
        setDetailCache({});
        setSelectedId(null);
        setLoadingIds(new Set());
        expandedRef.current = new Set();
        loadingRef.current = new Set();
        detailPendingRef.current = new Set();
    }, []);

    return {
        nodes,
        edges,
        expandedIds: expandedRef.current,
        detailCache,
        selectedId,
        loadingIds,
        loadRoot,
        expandNode,
        selectNode,
        reset,
    };
}
