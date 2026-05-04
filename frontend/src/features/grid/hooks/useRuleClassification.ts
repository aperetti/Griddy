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
