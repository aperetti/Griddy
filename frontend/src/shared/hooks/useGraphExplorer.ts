import { useState, useCallback, useRef } from 'react';
import { fetchCimNeighbors, fetchCimEquipment, fetchCimNode, fetchCimProperties } from '../api';

export interface GNode {
    id: string;
    label: string;
    subLabel?: string;
    fill: string;
    size: number;
    data?: { cimType: string; isRoot?: boolean };
}

// Detect UUID-format or long hex strings — show truncated, not the full MRID
function cleanName(name: string, id: string): string {
    const s = name || id;
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/.test(s)) return s.slice(0, 8); // UUID → first 8
    if (/^[0-9a-fA-F]{16,}$/.test(s)) return s.slice(0, 10);              // long hex
    return s.length > 14 ? `${s.slice(0, 12)}…` : s;
}

export interface GEdge {
    id: string;
    source: string;
    target: string;
    rel?: string;  // relationship type from Neo4j (e.g. "TransformerTank.PowerTransformer")
}

function nodeColor(cimType: string, isRoot = false): string {
    if (isRoot) return '#fcc419';
    return cimType === 'ConnectivityNode' ? '#40c057' : '#4dabf7';
}

function makeNode(id: string, name: string, cimType: string, isRoot = false): GNode {
    return {
        id,
        label: cimType || 'Object',        // class shown closest to node circle
        subLabel: cleanName(name, id),     // human-readable name shown below
        fill: nodeColor(cimType, isRoot),
        size: isRoot ? 8 : 5,
        data: { cimType, isRoot },
    };
}

async function fetchDetails(id: string): Promise<any> {
    // Try Neo4j direct lookup first — works for all CIM types regardless of in-memory index
    try { return await fetchCimProperties(id); } catch { /* fall through */ }
    // Fallback to in-memory enriched endpoints for known equipment/node types
    try { return await fetchCimEquipment(id); } catch { /* fall through */ }
    try { return await fetchCimNode(id); } catch { /* not found */ }
    return null;
}

const EXPAND_WARN_THRESHOLD = 10;

export interface PendingExpansion {
    id: string;
    neighborCount: number;
    /** Call to proceed with the expansion */
    confirm: () => void;
    /** Call to abort */
    cancel: () => void;
}

export interface GraphPathStep {
    rel: string;    // Neo4j relationship type, e.g. "TransformerTank.PowerTransformer"
    label: string;  // CIM class of the node at the end of this hop, e.g. "TransformerTank"
}

/**
 * BFS from rootId to targetId over the loaded graph edges.
 * Returns the sequence of (relationship, node-label) hops, or null if unreachable.
 */
function findGraphPath(
    nodes: GNode[],
    edges: GEdge[],
    rootId: string,
    targetId: string,
): GraphPathStep[] | null {
    if (rootId === targetId) return [];

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Build undirected adjacency: nodeId -> [{neighborId, rel}]
    const adj = new Map<string, { id: string; rel: string }[]>();
    for (const edge of edges) {
        if (!adj.has(edge.source)) adj.set(edge.source, []);
        if (!adj.has(edge.target)) adj.set(edge.target, []);
        adj.get(edge.source)!.push({ id: edge.target, rel: edge.rel ?? '' });
        adj.get(edge.target)!.push({ id: edge.source, rel: edge.rel ?? '' });
    }

    // BFS tracking the path taken
    const visited = new Set<string>([rootId]);
    const queue: { id: string; path: { id: string; rel: string }[] }[] = [{ id: rootId, path: [] }];

    while (queue.length > 0) {
        const { id, path } = queue.shift()!;
        for (const { id: neighborId, rel } of adj.get(id) ?? []) {
            if (visited.has(neighborId)) continue;
            const newPath = [...path, { id: neighborId, rel }];
            if (neighborId === targetId) {
                return newPath.map(step => ({
                    rel: step.rel,
                    label: nodeMap.get(step.id)?.label ?? '',
                }));
            }
            visited.add(neighborId);
            queue.push({ id: neighborId, path: newPath });
        }
    }
    return null;
}

export function useGraphExplorer() {
    const [nodes, setNodes] = useState<GNode[]>([]);
    const [edges, setEdges] = useState<GEdge[]>([]);
    const [detailCache, setDetailCache] = useState<Record<string, any>>({});
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
    const [pendingExpansion, setPendingExpansion] = useState<PendingExpansion | null>(null);

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
                newEdges.push({ id: `${id}-${nb.id}`, source: id, target: nb.id, rel: nb.relation });
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

    const _commitExpansion = useCallback((id: string, result: any) => {
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
                    toAdd.push({ id: fwd, source: id, target: nb.id, rel: nb.relation });
                }
            }
            return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });

        expandedRef.current.add(id);
        setPendingExpansion(null);
    }, []);

    const expandNode = useCallback(async (id: string) => {
        if (expandedRef.current.has(id) || loadingRef.current.has(id)) return;

        setLoading(id, true);
        let deferred = false;
        try {
            const result = await fetchCimNeighbors(id);
            if (!result) return;

            const neighborCount = (result.neighbors ?? []).length;

            if (neighborCount > EXPAND_WARN_THRESHOLD) {
                // Surface warning — loading stays on until user confirms or cancels
                deferred = true;
                setPendingExpansion({
                    id,
                    neighborCount,
                    confirm: () => { _commitExpansion(id, result); setLoading(id, false); },
                    cancel: () => { setPendingExpansion(null); setLoading(id, false); },
                });
                return;
            }

            _commitExpansion(id, result);
        } finally {
            if (!deferred) setLoading(id, false);
        }
    }, [_commitExpansion]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const getPathTo = useCallback((targetId: string): GraphPathStep[] | null => {
        const rootNode = nodes.find(n => n.data?.isRoot);
        if (!rootNode || rootNode.id === targetId) return null;
        return findGraphPath(nodes, edges, rootNode.id, targetId);
    }, [nodes, edges]);

    return {
        nodes,
        edges,
        expandedIds: expandedRef.current,
        detailCache,
        selectedId,
        loadingIds,
        pendingExpansion,
        loadRoot,
        expandNode,
        selectNode,
        reset,
        getPathTo,
    };
}
