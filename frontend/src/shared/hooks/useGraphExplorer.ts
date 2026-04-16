import { useState, useCallback, useRef } from 'react';
import { fetchCimNeighbors, fetchCimEquipment, fetchCimNode, fetchCimProperties } from '../api';

export interface GNode {
    id: string;
    label: string;
    subLabel?: string;
    fill: string;
    size: number;
    /** Fixed positions for force-directed layout — set on Terminal nodes to pin them to their parent CN. */
    fx?: number;
    fy?: number;
    data?: {
        cimType: string;
        isRoot?: boolean;
        isTerminal?: boolean;
        parentId?: string;
        /** Node shape — defaults to 'sphere'. Conducting equipment uses 'box'. */
        shape?: 'sphere' | 'box';
    };
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
    fill?: string; // edge colour — set to canvas bg to hide terminal edges
}

// ── CIM package classification ──────────────────────────────────────────────

/** IEC 61970-301 Topology / Connectivity package */
const TOPOLOGY_TYPES = new Set([
    'ConnectivityNode', 'Terminal',
    'TopologicalNode', 'TopologicalIsland',
    'BusbarSection',
]);

/** IEC 61970-301 Wires / Core package — ConductingEquipment subclasses */
const CONDUCTING_EQUIPMENT = new Set([
    'ACLineSegment', 'DCLineSegment', 'Conductor',
    'PowerTransformer', 'TransformerTank', 'PowerTransformerEnd',
    'TapChanger', 'RatioTapChanger', 'PhaseTapChanger',
    'Breaker', 'LoadBreakSwitch', 'Fuse', 'Disconnector', 'Recloser',
    'GroundDisconnector', 'Jumper', 'ProtectedSwitch', 'Switch',
    'EnergyConsumer', 'EnergySource', 'ConformLoad', 'NonConformLoad', 'StationSupply',
    'LinearShuntCompensator', 'NonlinearShuntCompensator',
    'StaticVarCompensator', 'SeriesCompensator',
    'SynchronousMachine', 'AsynchronousMachine', 'ExternalNetworkInjection',
    'PowerElectronicsConnection', 'BatteryUnit', 'PhotovoltaicUnit',
    'EquivalentBranch', 'EquivalentInjection', 'EquivalentShunt', 'EquivalentSource',
    'Ground', 'PetersenCoil', 'RectifierInverter', 'ControlArea',
    'Substation', 'VoltageLevel', 'Bay',
]);

/** IEC 61968 Asset Management package */
function isAssetMgmt(cimType: string): boolean {
    return (
        cimType.endsWith('Info') || cimType.endsWith('Test') ||
        cimType === 'Asset' || cimType.startsWith('Asset') ||
        cimType === 'Manufacturer' || cimType === 'ProductAssetModel' ||
        cimType === 'AssetOrganisationRole' || cimType === 'Medium'
    );
}

/** Geographic / GML package */
function isLocation(cimType: string): boolean {
    return (
        cimType === 'Location' || cimType === 'PositionPoint' ||
        cimType === 'CoordinateSystem' || cimType.includes('Location')
    );
}

// ────────────────────────────────────────────────────────────────────────────

interface NodeStyle {
    fill: string;
    size: number;
    shape?: 'sphere' | 'box';
}

function getNodeStyle(cimType: string, isRoot: boolean): NodeStyle {
    if (isRoot) return { fill: '#fcc419', size: 2 };

    if (TOPOLOGY_TYPES.has(cimType)) {
        return { fill: '#51cf66', size: 2 };
    }
    if (CONDUCTING_EQUIPMENT.has(cimType)) {
        return { fill: '#74c0fc', size: 2, shape: 'box' };
    }
    if (isAssetMgmt(cimType)) {
        return { fill: '#cc5de8', size: 2 };
    }
    if (isLocation(cimType)) {
        return { fill: '#f76707', size: 2 };
    }
    return { fill: '#ffd43b', size: 2 };
}

function makeNode(id: string, name: string, cimType: string, isRoot = false): GNode {
    const style = getNodeStyle(cimType, isRoot);
    return {
        id,
        label: cimType || 'Object',
        subLabel: cleanName(name, id),
        fill: style.fill,
        size: style.size,
        data: {
            cimType,
            isRoot,
            ...(style.shape && { shape: style.shape }),
        },
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
    const [hoveredId, setHoveredId] = useState<string | null>(null);

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
                const cimType = nb.cim_class || nb.type || 'Equipment';
                const isTerminal = cimType === 'Terminal';
                if (isTerminal) {
                    toAdd.push({
                        ...makeNode(nb.id, nb.name || nb.id, 'Terminal'),
                        size: 2,
                        fill: '#51cf66',
                        data: { cimType: 'Terminal', isTerminal: true, parentId: id },
                    });
                } else {
                    toAdd.push(makeNode(nb.id, nb.name || nb.id, cimType));
                }
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
                    const isTerminal = (nb.cim_class || nb.type || '') === 'Terminal';
                    toAdd.push({ id: fwd, source: id, target: nb.id, rel: nb.relation, fill: isTerminal ? '#0d0d0d' : undefined });
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

            // When expanding a ConnectivityNode, also expand each Terminal
            // neighbour so the equipment they connect to becomes visible.
            const expandedCimType = result.cim_class || result.type || '';
            if (expandedCimType === 'ConnectivityNode') {
                const terminals = (result.neighbors ?? []).filter(
                    (nb: any) => nb.id && (nb.cim_class || nb.type || '') === 'Terminal'
                );
                terminals.forEach((nb: any) => expandNode(nb.id));
            }
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

    /**
     * Pin Terminal nodes close to their parent ConnectivityNode by fixing their
     * force-layout position.  Call this after the simulation has had time to run
     * (typically ~700 ms) and pass a getter that returns the current x/y of any
     * node id (read from the reagraph graphology instance).
     */
    const pinTerminals = useCallback(
        (getPos: (id: string) => { x: number; y: number } | null) => {
            setNodes(prev => {
                const unpinned = prev.filter(
                    n => n.data?.isTerminal && n.data?.parentId && n.fx === undefined,
                );
                if (!unpinned.length) return prev;

                const byParent = new Map<string, GNode[]>();
                for (const t of unpinned) {
                    const pid = t.data!.parentId!;
                    if (!byParent.has(pid)) byParent.set(pid, []);
                    byParent.get(pid)!.push(t);
                }

                const updates = new Map<string, { fx: number; fy: number }>();
                for (const [parentId, terminals] of byParent) {
                    const pos = getPos(parentId);
                    if (!pos) continue;
                    terminals.forEach((t, i) => {
                        const angle = (i / terminals.length) * Math.PI * 2;
                        updates.set(t.id, {
                            fx: pos.x + Math.cos(angle) * 8,
                            fy: pos.y + Math.sin(angle) * 8,
                        });
                    });
                }

                if (!updates.size) return prev;
                return prev.map(n => {
                    const u = updates.get(n.id);
                    return u ? { ...n, ...u } : n;
                });
            });
        },
        [],
    );

    const hoverNode = useCallback((id: string) => {
        setHoveredId(id);
        // Prefetch details on hover so they're ready when needed
        setDetailCache(prev => {
            if (prev[id] || detailPendingRef.current.has(id)) return prev;
            detailPendingRef.current.add(id);
            fetchDetails(id).then(details => {
                detailPendingRef.current.delete(id);
                if (details) setDetailCache(p => ({ ...p, [id]: details }));
            });
            return prev;
        });
    }, []);

    const unhoverNode = useCallback(() => setHoveredId(null), []);

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
        hoveredId,
        loadingIds,
        pendingExpansion,
        loadRoot,
        expandNode,
        selectNode,
        pinTerminals,
        hoverNode,
        unhoverNode,
        reset,
        getPathTo,
    };
}
