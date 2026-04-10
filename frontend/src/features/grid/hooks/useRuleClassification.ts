/**
 * Classifies topology nodes and edges against active display rules.
 *
 * Each enabled rule is queried independently in parallel, scoped to the
 * equipment mRIDs already present in the active topology.  This means:
 *   - Topology loads immediately (no server-side classify_all blocking it)
 *   - Display styling is applied progressively as each rule query returns
 *   - EXISTS traversal queries are fast because the IN $activeMrids filter
 *     lets Neo4j use the mRID index before evaluating expensive subqueries
 *   - Rules are independent — one slow rule doesn't block the others
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Node, Edge } from '../../../shared/types';
import type { RuleConfig } from '../../../shared/api';
import { fetchActiveDisplayRules } from '../../../shared/api';
import { buildPathQuery } from '../model/ruleQueryBuilder';

interface RuleMatch {
    ruleId: number;
    priority: number;
    config: RuleConfig;
    matchingMrids: Set<string>;
    /** Per-mRID projected tooltip attribute values (keyed by alias, stripped of `tp_` prefix) */
    tooltipData: Map<string, Record<string, any>>;
}

function buildDisplayProps(config: RuleConfig, ruleId: number, tooltipData?: Record<string, any>) {
    return {
        display_type: config.visual_type,
        display_icon: `rule_${ruleId}`,
        display_color: config.color_hex ?? undefined,
        display_size: config.size ?? 1.0,
        display_label: config.label ?? '',
        cluster_enabled: config.cluster_enabled ?? false,
        cluster_radius: config.cluster_radius ?? 40.0,
        cluster_max_zoom: config.cluster_max_zoom ?? 20.0,
        cluster_min_points: config.cluster_min_points ?? 2,
        display_min_zoom: config.min_zoom ?? 0.0,
        display_max_zoom: config.max_zoom ?? 24.0,
        display_rotate_to_edge: config.rotate_to_edge ?? false,
        display_tooltip: config.tooltip_config ?? undefined,
        display_tooltip_data: tooltipData && Object.keys(tooltipData).length > 0 ? tooltipData : undefined,
        display_line_weight: config.line_weight ?? undefined,
        display_line_style: config.line_style ?? undefined,
    };
}

export function useRuleClassification(rawNodes: Node[], rawEdges: Edge[]) {
    const [ruleMatches, setRuleMatches] = useState<RuleMatch[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshVersion, setRefreshVersion] = useState(0);

    const refresh = useCallback(() => setRefreshVersion(v => v + 1), []);

    // Collect all equipment mRIDs present in the active topology, plus topology
    // node IDs (ConnectivityNode mRIDs).  Node IDs are needed so that rules using
    // resolve_via_connectivity_node can scope their IN $activeMrids filter to the
    // active topology without a full-graph scan.
    const activeMridsKey = useMemo(() => {
        const mrids = new Set<string>();
        for (const n of rawNodes) {
            mrids.add(n.id);  // ConnectivityNode mRID — needed for CN-targeting rules
            for (const eq of n.attached_equipment || []) {
                if (eq.mrid) mrids.add(eq.mrid);
            }
        }
        for (const e of rawEdges) {
            if (e.id) mrids.add(e.id);
        }
        return Array.from(mrids).sort().join(',');
    }, [rawNodes, rawEdges]);

    useEffect(() => {
        if (!activeMridsKey) {
            setRuleMatches([]);
            return;
        }

        const activeMrids = activeMridsKey.split(',');
        let cancelled = false;

        const run = async () => {
            setLoading(true);
            try {
                const rules = await fetchActiveDisplayRules();
                if (cancelled || rules.length === 0) return;

                const results = await Promise.all(
                    rules.map(async (rule): Promise<RuleMatch | null> => {
                        try {
                            const conditions = typeof rule.match_conditions === 'string'
                                ? JSON.parse(rule.match_conditions)
                                : rule.match_conditions;

                            const built = buildPathQuery(conditions, { activeMrids });
                            if (!built) return null;

                            const res = await fetch('/api/cim/query', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ cypher: built.cypher, params: built.params }),
                            });
                            if (!res.ok || cancelled) return null;

                            const data = await res.json();
                            const matchingMrids = new Set<string>();
                            const tooltipData = new Map<string, Record<string, any>>();
                            for (const row of (data.rows || []) as any[]) {
                                if (!row.mrid) continue;
                                matchingMrids.add(row.mrid);
                                const extras: Record<string, any> = {};
                                for (const [k, v] of Object.entries(row)) {
                                    if (k !== 'mrid' && k.startsWith('tp_') && v != null) {
                                        extras[k.slice(3)] = v;
                                    }
                                }
                                if (Object.keys(extras).length > 0) tooltipData.set(row.mrid, extras);
                            }
                            if (matchingMrids.size === 0) return null;

                            return { ruleId: rule.id, priority: rule.priority, config: rule.config, matchingMrids, tooltipData };
                        } catch {
                            return null;
                        }
                    }),
                );

                if (!cancelled) {
                    setRuleMatches(
                        (results.filter((r): r is RuleMatch => r !== null))
                            .sort((a, b) => b.priority - a.priority),
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        run();
        return () => { cancelled = true; };
    }, [activeMridsKey, refreshVersion]);

    // Apply rule display props to nodes.  First matching rule wins (sorted by priority DESC).
    // Matches on either attached_equipment mRIDs (standard rules) or directly on node.id
    // (rules that use resolve_via_connectivity_node to return ConnectivityNode mRIDs).
    const classifiedNodes = useMemo((): Node[] => {
        if (ruleMatches.length === 0) return rawNodes;

        return rawNodes.map(node => {
            const equipMrids = (node.attached_equipment || []).map(eq => eq.mrid);
            for (const rule of ruleMatches) {
                const matchMrid = rule.matchingMrids.has(node.id)
                    ? node.id
                    : equipMrids.find(mrid => rule.matchingMrids.has(mrid));
                if (matchMrid) {
                    return { ...node, ...buildDisplayProps(rule.config, rule.ruleId, rule.tooltipData.get(matchMrid)) };
                }
            }
            return node;
        });
    }, [rawNodes, ruleMatches]);

    // Apply rule display props to edges.  Edge id should equal the CIM equipment mRID.
    const classifiedEdges = useMemo((): Edge[] => {
        if (ruleMatches.length === 0) return rawEdges;

        return rawEdges.map(edge => {
            if (!edge.id) return edge;
            for (const rule of ruleMatches) {
                if (rule.matchingMrids.has(edge.id)) {
                    const { cluster_enabled, cluster_radius, cluster_max_zoom, cluster_min_points, ...edgeProps } =
                        buildDisplayProps(rule.config, rule.ruleId, rule.tooltipData.get(edge.id));
                    return { ...edge, ...edgeProps };
                }
            }
            return edge;
        });
    }, [rawEdges, ruleMatches]);

    return { classifiedNodes, classifiedEdges, loading, refresh };
}
