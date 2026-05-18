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
import { fetchActiveDisplayRules } from '../../../shared/api';
import { buildPathQuery } from '../model/ruleQueryBuilder';
import { classifyNodes, classifyEdges, type RuleMatch } from '../model/ruleClassifier';

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

    // Step 1: Extract pre-classified rule matches from the raw topology data.
    // This allows immediate rendering without waiting for Neo4j round-trips.
    const initialRuleMatches = useMemo(() => {
        const matches: Record<number, RuleMatch> = {};
        
        const processEntity = (entity: any, type: 'node' | 'edge') => {
            if (entity.style && entity.style.rule_id) {
                const rid = entity.style.rule_id;
                if (!matches[rid]) {
                    matches[rid] = {
                        ruleId: rid,
                        priority: entity.style.priority || 0,
                        entityType: type,
                        config: {
                            visual_type: entity.style.visual_type,
                            color_hex: entity.style.color_hex,
                            size: entity.style.size,
                            icon: entity.style.icon,
                            label: entity.style.label,
                            radial_offset: entity.style.radial_offset,
                            cluster_enabled: entity.style.cluster_enabled,
                            cluster_radius: entity.style.cluster_radius,
                            cluster_max_zoom: entity.style.cluster_max_zoom,
                            cluster_min_points: entity.style.cluster_min_points,
                            min_zoom: entity.style.min_zoom,
                            max_zoom: entity.style.max_zoom,
                            rotate_to_edge: entity.style.rotate_to_edge,
                            center_icon_enabled: entity.style.center_icon_enabled,
                            center_icon_size: entity.style.center_icon_size,
                            center_icon_rotate: entity.style.center_icon_rotate,
                            line_weight: entity.style.line_weight,
                            line_style: entity.style.line_style,
                            svg_overrides: entity.style.svg_overrides || [],
                        },
                        matchingMrids: new Set<string>(),
                        tooltipData: new Map<string, Record<string, any>>(),
                        overridesData: []
                    };
                }
                matches[rid].matchingMrids.add(entity.id);
            }
        };

        rawNodes.forEach(n => processEntity(n, 'node'));
        rawEdges.forEach(e => processEntity(e, 'edge'));

        return Object.values(matches).sort((a, b) => b.priority - a.priority);
    }, [rawNodes, rawEdges]);

    useEffect(() => {
        if (!activeMridsKey) {
            setRuleMatches([]);
            return;
        }
        
        // If we already have pre-classified matches, seed the state with them
        if (initialRuleMatches.length > 0) {
            setRuleMatches(initialRuleMatches);
        }

        const baseMrids = activeMridsKey.split(',');
        // For Neo4j indexing, we provide BOTH the raw mRID (unprefixed) AND 
        // the standard prefixed version (urn:uuid:...). This ensures Neo4j can 
        // use the mRID index for a simple 'IN' check without slow string manipulation.
        const activeMrids = [];
        for (const mrid of baseMrids) {
            activeMrids.push(mrid);
            activeMrids.push(`urn:uuid:${mrid}`);
        }

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
                            // DEBUG: always log for edge geometry rules so we can diagnose mRID matching
                            if (conditions.geometry_type === 'edge') {
                                const sampleEdgeIds = rawEdges.slice(0, 5).map(e => e.id);
                                console.debug('[rule-classify] edge rule query result', {
                                    ruleId: rule.id,
                                    returnedCount: data.count,
                                    returnedMrids: data.mrids?.slice(0, 5),
                                    activeMridsSample: activeMrids.slice(0, 5),
                                    sampleEdgeIdsFromTopology: sampleEdgeIds,
                                    cypher: built.cypher,
                                });
                            }
                            const matchingMrids = new Set<string>();
                            const tooltipData = new Map<string, Record<string, any>>();
                            for (const row of (data.rows || []) as any[]) {
                                if (!row.mrid) continue;
                                
                                // Normalize mRID: strip 'urn:uuid:' and uppercase to match frontend state
                                const rawMrid = String(row.mrid);
                                const normalizedMrid = rawMrid.replace(/^urn:uuid:/i, '').toUpperCase();
                                
                                matchingMrids.add(normalizedMrid);
                                const extras: Record<string, any> = {};
                                for (const [k, v] of Object.entries(row)) {
                                    if (k !== 'mrid' && k.startsWith('tp_') && v != null) {
                                        extras[k.slice(3)] = v;
                                    }
                                }
                                if (Object.keys(extras).length > 0) tooltipData.set(normalizedMrid, extras);
                            }
                            if (matchingMrids.size === 0) return null;

                            const overridesData: Array<{ index: number; mrids: Set<string> }> = [];
                            if (rule.config.svg_overrides && rule.config.svg_overrides.length > 0) {
                                await Promise.all(rule.config.svg_overrides.map(async (override: any, idx: number) => {
                                    if (!override.conditions) return;
                                    try {
                                        const parsedConds = typeof override.conditions === 'string'
                                            ? JSON.parse(override.conditions)
                                            : override.conditions;
                                        
                                        const oConditions = (parsedConds?.path_steps?.length > 0)
                                            ? parsedConds
                                            : {
                                                ...(rule.match_conditions || {}),
                                                logical_op: 'AND',
                                                conditions: [
                                                    ...(rule.match_conditions?.conditions || []),
                                                    ...(parsedConds?.conditions || [])
                                                ]
                                            };
                                        
                                        const oBuilt = buildPathQuery(oConditions, { activeMrids: Array.from(matchingMrids) });
                                        if (!oBuilt) return;

                                        const oRes = await fetch('/api/cim/query', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ cypher: oBuilt.cypher, params: oBuilt.params }),
                                        });

                                        if (oRes.ok) {
                                            const oData = await oRes.json();
                                            const oMrids = new Set<string>();
                                            for (const oRow of (oData.rows || []) as any[]) {
                                                if (oRow.mrid) oMrids.add(oRow.mrid);
                                            }
                                            if (oMrids.size > 0) {
                                                overridesData.push({ index: idx, mrids: oMrids });
                                            }
                                        }
                                    } catch (err) {
                                        console.warn(`Failed evaluating override ${idx} for rule ${rule.id}`, err);
                                    }
                                }));
                            }

                            return { 
                                ruleId: rule.id, 
                                priority: rule.priority, 
                                entityType: conditions.entity_type || 'node',
                                config: rule.config, 
                                matchingMrids, 
                                tooltipData, 
                                overridesData 
                            };
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

    // Delegate classification to pure model functions
    const classifiedNodes = useMemo(
        () => classifyNodes(rawNodes, ruleMatches), 
        [rawNodes, ruleMatches]
    );

    const classifiedEdges = useMemo(
        () => classifyEdges(rawEdges, ruleMatches),
        [rawEdges, ruleMatches]
    );

    return { classifiedNodes, classifiedEdges, loading, refresh };
}
