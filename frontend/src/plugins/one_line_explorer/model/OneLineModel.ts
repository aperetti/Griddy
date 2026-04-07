/**
 * One-Line Diagram — data model, layout constants, and pure layout functions.
 *
 * Layout algorithm
 * ─────────────────
 * 1. BFS from centre_id to build a spanning tree (assigns each node a parent
 *    and a depth level).
 * 2. Post-order pass to compute the subtree width of each node (min = BUS_W).
 * 3. Pre-order pass to assign centre x-coordinates using the subtree widths,
 *    equivalent to a simple Reingold-Tilford tree layout.
 * 4. y = PADDING + level × (BUS_H + V_GAP).
 * 5. Edges are routed as orthogonal L-paths:
 *      vert down → horiz to child column → vert to child top
 *    Lateral edges (same level) use a U-path going below both nodes.
 */

// ── API response types ────────────────────────────────────────────

export interface AttachedEquipment {
    mrid: string;
    type: 'EnergyConsumer' | 'EnergySource' | 'Capacitor' | string;
    name: string;
    phases: string[];
    active_power_w?: number;
    reactive_power_var?: number;
    customer_count?: number;
}

export interface BusBarNode {
    id: string;
    name: string;
    node_type: 'Bus' | 'Substation';
    base_voltage_kv: number | null;
    phases: string[];
    attached_equipment: AttachedEquipment[];
    is_centre: boolean;
    node_role: 'upstream' | 'centre' | 'downstream';
}

export interface EquipmentEdge {
    id: string;
    from_node_id: string;
    to_node_id: string;
    edge_type: string;
    name: string;
    phases: string[];
    is_open: boolean;
    transformer_kva: number | null;
    length_m: number | null;
    /** Total customer count absorbed when this is a virtual collapsed edge. */
    customer_count?: number | null;
}

export interface OneLineDiagramData {
    centre_id: string;
    depth: number;
    /** Ordered list of node IDs from the upstream EnergySource to the selected node. */
    source_path: string[];
    nodes: BusBarNode[];
    edges: EquipmentEdge[];
}

// ── Layout constants ──────────────────────────────────────────────

export const BUS_W   = 220;   // bus bar width (px)
export const BUS_H   = 18;    // bus bar height (px)
export const H_GAP   = 80;    // minimum horizontal gap between adjacent bus bars
export const V_GAP   = 110;   // vertical gap between levels (bus bar bottom → next bus bar top)
export const PADDING = 52;    // canvas edge padding

// ── SVG layout types ──────────────────────────────────────────────

export interface LayoutNode {
    id: string;
    data: BusBarNode;
    cx: number;    // horizontal centre
    y: number;     // top edge of bus bar
    width: number;
    height: number;
    fill: string;
}

export interface LayoutEdge {
    id: string;
    data: EquipmentEdge;
    path: string;      // SVG path d attribute (orthogonal only)
    labelX: number;
    labelY: number;
    symbolX: number;   // centre X for ANSI equipment symbol
    symbolY: number;   // centre Y for ANSI equipment symbol
    typeLabel: string; // human-readable equipment type (e.g. "Transformer", "Fuse")
    detailLabel: string; // secondary info (kVA, length, open state)
    label: string;
    color: string;
    dashed: boolean;
    /** base_voltage_kv of the from_node (upper side in vertical layout). */
    fromKv: number | null;
    /** base_voltage_kv of the to_node (lower side in vertical layout). */
    toKv: number | null;
}

export interface DiagramLayout {
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    totalWidth: number;
    totalHeight: number;
}

// ── Colour helpers ────────────────────────────────────────────────

const SWITCH_TYPES = new Set([
    'Breaker', 'LoadBreakSwitch', 'Fuse', 'Disconnector', 'Recloser',
]);
const TRANSFORMER_TYPES = new Set([
    'PowerTransformer', 'Regulator', 'TransformerTank',
]);

function edgeColor(e: EquipmentEdge): string {
    // LoadBreakSwitch: closed = red (energised/live), open = green (de-energised/safe)
    if (e.edge_type === 'LoadBreakSwitch') return e.is_open ? '#51cf66' : '#fa5252';
    if (SWITCH_TYPES.has(e.edge_type)) return e.is_open ? '#fa5252' : '#51cf66';
    if (TRANSFORMER_TYPES.has(e.edge_type)) return '#fd7e14';
    if (e.edge_type === 'ACLineSegment') return '#868e96';
    return '#4dabf7';
}

function nodeColor(n: BusBarNode): string {
    if (n.is_centre) return '#ffd43b';
    if (n.node_role === 'upstream') return '#15aabf';   // teal — path to source
    if (n.node_type === 'Substation') return '#f59f00';
    return '#4c6ef5';
}

const TYPE_LABELS: Record<string, string> = {
    PowerTransformer:  'Transformer',
    Regulator:         'Regulator',
    TransformerTank:   'Transformer',
    Breaker:           'Breaker',
    CircuitBreaker:    'Breaker',
    Recloser:          'Recloser',
    Fuse:              'Fuse',
    Disconnector:      'Disconnector',
    LoadBreakSwitch:   'Load Break Switch',
    ACLineSegment:     'Line Segment',
};

function edgeTypeLabel(e: EquipmentEdge): string {
    return TYPE_LABELS[e.edge_type] ?? e.edge_type;
}

function edgeDetailLabel(e: EquipmentEdge): string {
    const parts: string[] = [];
    if (e.transformer_kva != null) parts.push(`${e.transformer_kva} kVA`);
    if (e.customer_count != null && e.customer_count > 0) parts.push(`${e.customer_count} cust`);
    if (e.length_m != null) parts.push(`${Math.round(e.length_m)} m`);
    if (e.is_open) parts.push('OPEN');
    return parts.join(' · ');
}

function edgeShortLabel(e: EquipmentEdge): string {
    const detail = edgeDetailLabel(e);
    const type   = edgeTypeLabel(e);
    return detail ? `${type} ${detail}` : type;
}

// ── Pass-through bus collapse ─────────────────────────────────────
//
// A bus is "pass-through" (collapsible) if:
//   · not the centre bus, not a Substation
//   · no structurally-significant direct equipment (EnergySource, Capacitor)
//     — EnergyConsumers (plain loads) are fine; they get rolled up into the
//       virtual edge's customer_count
//   · exactly 2 ACLineSegment neighbours (the through-chain)
//   · every other edge is either a transformer offshoot to a dead-end leaf OR
//     absent (switch edges break the chain to keep switching points visible)
//
// Chains of such buses are replaced by a single virtual ACLineSegment whose
// length, kVA, and customer count are the sums across the collapsed chain.

// TR_ABSORBABLE: transformer offshoots to dead-end leaves may be absorbed into virtual edges.
// Regulator is intentionally excluded — regulators always remain as their own visible nodes.
const TR_ABSORBABLE = new Set(['PowerTransformer', 'TransformerTank']);

function collapsePassThroughBuses(data: OneLineDiagramData): OneLineDiagramData {
    const { nodes, edges, centre_id, source_path } = data;
    if (nodes.length <= 3) return data;

    // Undirected adjacency (only consider nodes present in the subgraph)
    const nodeSet = new Set(nodes.map(n => n.id));
    const adj = new Map<string, Set<string>>(nodes.map(n => [n.id, new Set()]));
    for (const e of edges) {
        if (!nodeSet.has(e.from_node_id) || !nodeSet.has(e.to_node_id)) continue;
        adj.get(e.from_node_id)!.add(e.to_node_id);
        adj.get(e.to_node_id)!.add(e.from_node_id);
    }

    const nodeById = new Map<string, BusBarNode>(nodes.map(n => [n.id, n]));

    // O(1) edge lookup by node pair
    const edgeByPair = new Map<string, EquipmentEdge>();
    for (const e of edges) {
        edgeByPair.set(`${e.from_node_id}|${e.to_node_id}`, e);
        edgeByPair.set(`${e.to_node_id}|${e.from_node_id}`, e);
    }

    // Transformer offshoots: transformer edges from `id` whose far end is a
    // dead-end leaf (degree 1 — only connected back to `id`).
    const getTransformerOffshoots = (id: string): Array<{ edge: EquipmentEdge; leafId: string }> => {
        const result: Array<{ edge: EquipmentEdge; leafId: string }> = [];
        for (const nb of adj.get(id) ?? []) {
            const e = edgeByPair.get(`${id}|${nb}`);
            if (!e || !TR_ABSORBABLE.has(e.edge_type)) continue;
            if ((adj.get(nb)?.size ?? 0) === 1) {           // nb is a leaf
                result.push({ edge: e, leafId: nb });
            }
        }
        return result;
    };

    // Structural direct-equipment types — buses hosting these must be shown.
    // EnergyConsumers (plain loads) are NOT structural; they get absorbed.
    const STRUCTURAL_EQ = new Set(['EnergySource', 'Capacitor']);

    const isPassThrough = (id: string): boolean => {
        const n = nodeById.get(id);
        if (!n) return false;
        if (n.is_centre) return false;
        if (n.node_type === 'Substation') return false;
        if (n.attached_equipment.some(eq => STRUCTURAL_EQ.has(eq.type))) return false;

        let lineCount = 0;
        for (const nb of adj.get(id) ?? []) {
            const e = edgeByPair.get(`${id}|${nb}`);
            if (e?.edge_type === 'ACLineSegment') { lineCount++; continue; }
            // Switch edge (Breaker, Recloser, Fuse…): keep this bus visible
            if (!e || SWITCH_TYPES.has(e.edge_type)) return false;
            // Regulator: always keep visible — never absorb into a virtual edge
            if (e.edge_type === 'Regulator') return false;
            // PowerTransformer/TransformerTank to a dead-end leaf: absorb into virtual edge
            if (TR_ABSORBABLE.has(e.edge_type) && (adj.get(nb)?.size ?? 0) === 1) continue;
            // Transformer to a non-leaf, or unknown edge type: keep
            return false;
        }
        return lineCount === 2;
    };

    // Sum of customer_count from EnergyConsumers directly on a bus node.
    const busCustomers = (id: string): number => {
        const n = nodeById.get(id);
        if (!n) return 0;
        return n.attached_equipment.reduce((s, eq) => s + (eq.customer_count ?? 0), 0);
    };

    const removedNodes = new Set<string>();
    const removedEdges = new Set<string>();
    const addedEdges: EquipmentEdge[] = [];
    const processed = new Set<string>(); // pass-through nodes already absorbed

    for (const anchor of nodes) {
        if (isPassThrough(anchor.id)) continue; // only start chains from anchor nodes

        for (const firstPT of adj.get(anchor.id) ?? []) {
            if (!isPassThrough(firstPT)) continue;
            if (processed.has(firstPT)) continue;

            // Require the first edge to be an ACLineSegment
            const firstEdge = edgeByPair.get(`${anchor.id}|${firstPT}`);
            if (!firstEdge || firstEdge.edge_type !== 'ACLineSegment') continue;

            const chainNodes: string[] = [];
            const chainEdges: EquipmentEdge[] = [firstEdge];
            const offshoots: Array<{ edge: EquipmentEdge; leafId: string }> = [];
            let valid = true;
            let prev = anchor.id;
            let cur = firstPT;
            let totalCustomers = 0;

            while (isPassThrough(cur)) {
                // Collect transformer offshoots and direct loads on this bus
                offshoots.push(...getTransformerOffshoots(cur));
                totalCustomers += busCustomers(cur);

                const lineNeighbors = [...(adj.get(cur) ?? [])].filter(nb => {
                    const e = edgeByPair.get(`${cur}|${nb}`);
                    return e?.edge_type === 'ACLineSegment';
                });
                const next = lineNeighbors.find(nb => nb !== prev);
                if (!next) { valid = false; break; }

                const nextEdge = edgeByPair.get(`${cur}|${next}`)!;
                // Stop if the outgoing line edge is absent (shouldn't happen, but safe)
                if (!nextEdge) break;

                chainNodes.push(cur);
                processed.add(cur);
                chainEdges.push(nextEdge);
                prev = cur;
                cur = next;
            }

            if (!valid || chainNodes.length === 0) continue;

            const farAnchor = cur;
            if (edgeByPair.has(`${anchor.id}|${farAnchor}`)) continue;

            for (const nid of chainNodes) removedNodes.add(nid);
            for (const e of chainEdges)  removedEdges.add(e.id);
            for (const { edge, leafId } of offshoots) {
                removedEdges.add(edge.id);
                removedNodes.add(leafId);
            }

            const totalLen = chainEdges.reduce((s, e) => s + (e.length_m ?? 0), 0);
            const totalKva = offshoots.reduce((s, { edge }) => s + (edge.transformer_kva ?? 0), 0);

            addedEdges.push({
                id:              `virt_${anchor.id}_${farAnchor}`,
                from_node_id:    anchor.id,
                to_node_id:      farAnchor,
                edge_type:       'ACLineSegment',
                name:            chainEdges[0]?.name ?? '',
                phases:          chainEdges[0]?.phases ?? ['A', 'B', 'C'],
                is_open:         chainEdges.some(e => e.is_open),
                transformer_kva: totalKva > 0 ? Math.round(totalKva) : null,
                length_m:        totalLen > 0 ? Math.round(totalLen) : null,
                customer_count:  totalCustomers > 0 ? totalCustomers : null,
            });
        }
    }

    if (removedNodes.size === 0) return data;

    const newSourcePath = source_path.filter(id => !removedNodes.has(id));
    return {
        ...data,
        source_path: newSourcePath.length > 0 ? newSourcePath : [centre_id],
        nodes: nodes.filter(n => !removedNodes.has(n.id)),
        edges: [
            ...edges.filter(e => !removedEdges.has(e.id)),
            ...addedEdges,
        ],
    };
}

// ── Layout computation ────────────────────────────────────────────

export function computeLayout(data: OneLineDiagramData): DiagramLayout {
    const collapsed = collapsePassThroughBuses(data);
    const { nodes, edges, centre_id, source_path } = collapsed;
    if (nodes.length === 0) {
        return { nodes: [], edges: [], totalWidth: 0, totalHeight: 0 };
    }

    // Root the spanning tree at the upstream source so the diagram reads
    // top-to-bottom: source → upstream chain → selected node → downstream.
    const bfsRoot = (source_path && source_path.length > 1) ? source_path[0] : centre_id;

    // Adjacency list
    const adj = new Map<string, string[]>(nodes.map(n => [n.id, []]));
    for (const e of edges) {
        adj.get(e.from_node_id)?.push(e.to_node_id);
        adj.get(e.to_node_id)?.push(e.from_node_id);
    }

    // ── Spanning tree via BFS ──────────────────────────────────────
    const parent   = new Map<string, string | null>([[bfsRoot, null]]);
    const children = new Map<string, string[]>(nodes.map(n => [n.id, []]));
    const levelMap = new Map<string, number>([[bfsRoot, 0]]);
    const bfsOrder: string[] = [bfsRoot];

    for (let i = 0; i < bfsOrder.length; i++) {
        const nid = bfsOrder[i];
        for (const nb of adj.get(nid) ?? []) {
            if (!parent.has(nb)) {
                parent.set(nb, nid);
                levelMap.set(nb, levelMap.get(nid)! + 1);
                children.get(nid)!.push(nb);
                bfsOrder.push(nb);
            }
        }
    }

    // ── Subtree widths (post-order) ────────────────────────────────
    const subtreeW = new Map<string, number>();
    for (let i = bfsOrder.length - 1; i >= 0; i--) {
        const nid  = bfsOrder[i];
        const kids = children.get(nid)!;
        if (kids.length === 0) {
            subtreeW.set(nid, BUS_W);
        } else {
            const w = kids.reduce((acc, k) => acc + subtreeW.get(k)!, 0)
                    + H_GAP * (kids.length - 1);
            subtreeW.set(nid, Math.max(w, BUS_W));
        }
    }

    // ── Horizontal positions (pre-order) ──────────────────────────
    const cx = new Map<string, number>();
    cx.set(bfsRoot, PADDING + subtreeW.get(bfsRoot)! / 2);

    for (const nid of bfsOrder) {
        const kids = children.get(nid)!;
        if (kids.length === 0) continue;

        const parentCx   = cx.get(nid)!;
        const totalKidsW = kids.reduce((a, k) => a + subtreeW.get(k)!, 0)
                         + H_GAP * (kids.length - 1);
        let leftEdge = parentCx - totalKidsW / 2;

        for (const kid of kids) {
            const kw = subtreeW.get(kid)!;
            cx.set(kid, leftEdge + kw / 2);
            leftEdge += kw + H_GAP;
        }
    }

    // ── Vertical positions ─────────────────────────────────────────
    const yTop = new Map<string, number>();
    for (const n of nodes) {
        yTop.set(n.id, PADDING + (levelMap.get(n.id) ?? 0) * (BUS_H + V_GAP));
    }

    // ── Canvas size ────────────────────────────────────────────────
    const totalWidth  = Math.max(...nodes.map(n => cx.get(n.id)!  + BUS_W / 2)) + PADDING;
    const totalHeight = Math.max(...nodes.map(n => yTop.get(n.id)! + BUS_H))    + PADDING + 40;

    // ── Build layout nodes ─────────────────────────────────────────
    const layoutNodes: LayoutNode[] = nodes.map(n => ({
        id:     n.id,
        data:   n,
        cx:     cx.get(n.id)!,
        y:      yTop.get(n.id)!,
        width:  BUS_W,
        height: BUS_H,
        fill:   nodeColor(n),
    }));

    // ── Build layout edges ─────────────────────────────────────────
    const layoutEdges: LayoutEdge[] = [];
    const seen = new Set<string>();

    for (const e of edges) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);

        const ax = cx.get(e.from_node_id) ?? 0;
        const ay = yTop.get(e.from_node_id) ?? 0;
        const bx = cx.get(e.to_node_id) ?? 0;
        const by = yTop.get(e.to_node_id) ?? 0;

        let path: string;
        let labelX: number;
        let labelY: number;
        let symbolX: number;
        let symbolY: number;

        if (Math.abs(ay - by) < 1) {
            // Same level — U-shape below both nodes
            const below = ay + BUS_H + 36;
            path = [
                `M ${ax} ${ay + BUS_H}`,
                `V ${below}`,
                `H ${bx}`,
                `V ${by + BUS_H}`,
            ].join(' ');
            symbolX = (ax + bx) / 2;
            symbolY = below;
            labelX = symbolX + 24;
            labelY = below;
        } else {
            // Different levels — tap horizontal off upper bus bar, then straight
            // vertical drop to lower bus bar (ANSI standard routing).
            let topX = ax, topY = ay, botX = bx, botY = by;
            if (ay > by) { [topX, topY, botX, botY] = [bx, by, ax, ay]; }

            const wireStart = topY + BUS_H;   // bottom of upper bus bar
            const wireEnd   = botY;            // top of lower bus bar

            path = [
                `M ${topX} ${wireStart}`,
                `H ${botX}`,
                `V ${wireEnd}`,
            ].join(' ');

            symbolX = botX;
            symbolY = (wireStart + wireEnd) / 2;
            labelX  = botX + 24;
            labelY  = symbolY;
        }

        const fromNode = nodes.find(n => n.id === e.from_node_id);
        const toNode   = nodes.find(n => n.id === e.to_node_id);

        layoutEdges.push({
            id:          e.id,
            data:        e,
            path,
            labelX,
            labelY,
            symbolX,
            symbolY,
            typeLabel:   edgeTypeLabel(e),
            detailLabel: edgeDetailLabel(e),
            label:       edgeShortLabel(e),
            color:       edgeColor(e),
            dashed:      e.is_open,
            fromKv:      fromNode?.base_voltage_kv ?? null,
            toKv:        toNode?.base_voltage_kv ?? null,
        });
    }

    return { nodes: layoutNodes, edges: layoutEdges, totalWidth, totalHeight };
}

// ── Reagraph adapter types ────────────────────────────────────────

export interface OneLineGraphNode {
    id: string;
    label: string;
    subLabel?: string;
    data: BusBarNode;
    fill?: string;
    size?: number;
}

export interface OneLineGraphEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    fill?: string;
    dashed?: boolean;
}

// ── Reagraph adapter functions ────────────────────────────────────

export function toReagraphNodes(nodes: BusBarNode[]): OneLineGraphNode[] {
    return nodes.map(n => ({
        id: n.id,
        label: n.name || n.id,
        subLabel: n.base_voltage_kv != null ? `${n.base_voltage_kv} kV` : n.node_type,
        data: n,
        fill: nodeColor(n),
        size: n.is_centre ? 8 : 6,
    }));
}

export function toReagraphEdges(edges: EquipmentEdge[]): OneLineGraphEdge[] {
    return edges.map(e => ({
        id: e.id,
        source: e.from_node_id,
        target: e.to_node_id,
        label: edgeShortLabel(e),
        fill: edgeColor(e),
        dashed: e.is_open,
    }));
}
