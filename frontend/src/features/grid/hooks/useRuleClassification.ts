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
    entityType: 'node' | 'edge';
    config: RuleConfig;
    matchingMrids: Set<string>;
    /** Per-mRID projected tooltip attribute values (keyed by alias, stripped of `tp_` prefix) */
    tooltipData: Map<string, Record<string, any>>;
    /** Array mapping override indices to their matching MRIDs */
    overridesData?: Array<{ index: number; mrids: Set<string> }>;
}

/** DJB2 hash function to match backend SpriteGenerator (using stable delimited string) */
function calculateOverrideHash(overrides: Array<{ svg?: string; icon?: string; mode: string }>): string {
    if (overrides.length === 0) return '';
    
    // 1. Normalize and Sort
    const normalized = overrides.map(o => {
        const content = o.svg || o.icon || '';
        const mode = o.mode || 'add';
        return `${content}|${mode}`;
    });
    normalized.sort();
    
    // 2. DJB2 Hash
    const combinedStr = normalized.join('||');
    let hash = 5381;
    for (let i = 0; i < combinedStr.length; i++) {
        hash = ((hash << 5) + hash) + combinedStr.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildDisplayProps(config: RuleConfig, ruleId: number, tooltipData?: Record<string, any>, activeOverrides?: any[]) {
    let iconId = `rule_${ruleId}`;
    if (activeOverrides && activeOverrides.length > 0) {
        const hash = calculateOverrideHash(activeOverrides);
        if (hash) iconId = `rule_${ruleId}_${hash}`;
    }

    return {
        display_type: config.visual_type,
        display_icon: iconId,
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
        display_center_icon_enabled: config.center_icon_enabled ?? false,
        display_center_icon_size: config.center_icon_size ?? 1.0,
        display_center_icon_rotate: config.center_icon_rotate ?? false,
        display_tooltip: config.tooltip_config ?? undefined,
        display_tooltip_overrides: config.svg_overrides ?? undefined,
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

    // Apply rule display props to nodes. Allows multiple matching rules per node by cloning
    // the node and applying a radial pixel offset.
    const classifiedNodes = useMemo((): Node[] => {
        if (ruleMatches.length === 0) return rawNodes;

        const result: Node[] = [];
        for (const node of rawNodes) {
            const equipMrids = (node.attached_equipment || []).map(eq => eq.mrid);
            const matches: Array<{ rule: RuleMatch; mrid: string }> = [];

            // 1. Gather all matching rules for this node or its attached equipment
            for (const rule of ruleMatches) {
                // Node rules only match in Node list
                if (rule.entityType !== 'node') continue;

                if (rule.matchingMrids.has(node.id)) {
                    matches.push({ rule, mrid: node.id });
                } else {
                    const matchMrid = equipMrids.find(mrid => rule.matchingMrids.has(mrid));
                    if (matchMrid) {
                        matches.push({ rule, mrid: matchMrid });
                    }
                }
            }

            if (matches.length === 0) {
                result.push(node);
                continue;
            }

            // 2. Generate one Node object per matching rule
            matches.forEach((match, index) => {
                const { rule, mrid: matchMrid } = match;
                let finalConfig = { ...rule.config };
                const activeOverrides: any[] = [];
                
                if (rule.overridesData && finalConfig.svg_overrides) {
                    for (const over of rule.overridesData) {
                        if (over.mrids.has(matchMrid) && finalConfig.svg_overrides) {
                            const ovData = finalConfig.svg_overrides[over.index];
                            activeOverrides.push(ovData);
                            
                            finalConfig = {
                                ...finalConfig,
                                ...(ovData.mode === 'replace' ? {
                                    visual_type: ovData.visual_type ?? finalConfig.visual_type,
                                    color_hex: ovData.color_hex ?? finalConfig.color_hex,
                                    size: ovData.size ?? finalConfig.size,
                                    icon: (ovData.icon || ovData.svg) ?? finalConfig.icon,
                                    line_weight: ovData.line_weight ?? finalConfig.line_weight,
                                    line_style: ovData.line_style ?? finalConfig.line_style,
                                    center_icon_enabled: ovData.center_icon_enabled ?? finalConfig.center_icon_enabled,
                                    center_icon_size: ovData.center_icon_size ?? finalConfig.center_icon_size,
                                    center_icon_rotate: ovData.center_icon_rotate ?? finalConfig.center_icon_rotate,
                                } : {}),
                            };
                            if (ovData.tooltip_config) {
                                finalConfig.tooltip_config = ovData.tooltip_config;
                            }
                            if (ovData.mode === 'replace') break;
                        }
                    }
                }

                // Calculate radial offset if there are multiple icons
                let pixelOffset: [number, number] | undefined = undefined;
                if (matches.length > 1) {
                    const radius = 18; // pixels
                    const angle = (index / matches.length) * 2 * Math.PI - Math.PI / 2;
                    pixelOffset = [Math.cos(angle) * radius, Math.sin(angle) * radius];
                }

                result.push({ 
                    ...node,
                    // Ensure unique ID for deck.gl if we have multiple icons for one physical node
                    id: index === 0 ? node.id : `${node.id}_v${index}`,
                    ...buildDisplayProps(
                        finalConfig, 
                        rule.ruleId, 
                        rule.tooltipData.get(matchMrid),
                        activeOverrides
                    ),
                    display_pixel_offset: pixelOffset,
                    is_rule_clone: index > 0,
                });
            });
        }
        return result;
    }, [rawNodes, ruleMatches]);

    // Apply rule display props to edges. Allows multiple matching rules per edge by cloning
    // the edge and applying a radial pixel offset for icons.
    const classifiedEdges = useMemo((): Edge[] => {
        if (ruleMatches.length === 0) return rawEdges;

        const result: Edge[] = [];
        for (const edge of rawEdges) {
            if (!edge.id) {
                result.push(edge);
                continue;
            }

            const matches: Array<{ rule: RuleMatch }> = [];
            for (const rule of ruleMatches) {
                // Edge rules only match in Edge list
                if (rule.entityType !== 'edge') continue;

                if (rule.matchingMrids.has(edge.id)) {
                    matches.push({ rule });
                }
            }

            if (matches.length === 0) {
                result.push(edge);
                continue;
            }

            // Generate one Edge object per matching rule
            matches.forEach((match, index) => {
                const { rule } = match;
                const matchMrid = edge.id!;
                let finalConfig = { ...rule.config };
                const activeOverrides: any[] = [];
                
                if (rule.overridesData && finalConfig.svg_overrides) {
                    for (const over of rule.overridesData) {
                        if (over.mrids.has(matchMrid) && finalConfig.svg_overrides) {
                            const ovData = finalConfig.svg_overrides[over.index];
                            activeOverrides.push(ovData);
                            
                            finalConfig = {
                                ...finalConfig,
                                ...(ovData.mode === 'replace' ? {
                                    visual_type: ovData.visual_type ?? finalConfig.visual_type,
                                    color_hex: ovData.color_hex ?? finalConfig.color_hex,
                                    size: ovData.size ?? finalConfig.size,
                                    icon: (ovData.icon || ovData.svg) ?? finalConfig.icon,
                                    line_weight: ovData.line_weight ?? finalConfig.line_weight,
                                    line_style: ovData.line_style ?? finalConfig.line_style,
                                    center_icon_enabled: ovData.center_icon_enabled ?? finalConfig.center_icon_enabled,
                                    center_icon_size: ovData.center_icon_size ?? finalConfig.center_icon_size,
                                    center_icon_rotate: ovData.center_icon_rotate ?? finalConfig.center_icon_rotate,
                                } : {}),
                            };
                            if (ovData.tooltip_config) {
                                finalConfig.tooltip_config = ovData.tooltip_config;
                            }
                            if (ovData.mode === 'replace') break;
                        }
                    }
                }

                const { cluster_enabled, cluster_radius, cluster_max_zoom, cluster_min_points, ...edgeProps } =
                    buildDisplayProps(finalConfig, rule.ruleId, rule.tooltipData.get(matchMrid), activeOverrides);

                // Calculate radial offset if there are multiple icons
                let pixelOffset: [number, number] | undefined = undefined;
                if (matches.length > 1) {
                    const radius = 15; // pixels (slightly smaller radius for edge midpoints)
                    const angle = (index / matches.length) * 2 * Math.PI - Math.PI / 2;
                    pixelOffset = [Math.cos(angle) * radius, Math.sin(angle) * radius];
                }

                result.push({ 
                    ...edge,
                    // Ensure unique ID for deck.gl
                    id: index === 0 ? edge.id : `${edge.id}_v${index}`,
                    ...edgeProps,
                    display_pixel_offset: pixelOffset,
                    is_rule_clone: index > 0,
                });
            });
        }
        return result;
    }, [rawEdges, ruleMatches]);

    return { classifiedNodes, classifiedEdges, loading, refresh };
}
