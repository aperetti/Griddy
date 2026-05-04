/**
 * Pure functions for classifying topology nodes and edges against display rule matches.
 * Extracted from useRuleClassification to enable independent testing and keep the hook lean.
 */
import type { Node, Edge } from '../../../shared/types';
import type { RuleConfig } from '../../../shared/api';

export interface RuleMatch {
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
export function calculateOverrideHash(overrides: Array<{ svg?: string; icon?: string; mode: string }>): string {
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

export function buildDisplayProps(config: RuleConfig, ruleId: number, tooltipData?: Record<string, any>, activeOverrides?: any[]) {
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

/** Resolves override chain for a matched mRID and returns the final config + active overrides list. */
function resolveOverrides(
    config: RuleConfig, 
    matchMrid: string, 
    overridesData?: Array<{ index: number; mrids: Set<string> }>
): { finalConfig: RuleConfig; activeOverrides: any[] } {
    let finalConfig = { ...config };
    const activeOverrides: any[] = [];
    
    if (overridesData && finalConfig.svg_overrides) {
        for (const over of overridesData) {
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
    
    return { finalConfig, activeOverrides };
}

/** Apply rule display props to nodes. Uses map-based O(1) lookup per mRID. */
export function classifyNodes(rawNodes: Node[], ruleMatches: RuleMatch[]): Node[] {
    if (ruleMatches.length === 0) return rawNodes;

    // Pre-index rule matches by MRID for O(1) lookup
    const mridToMatches = new Map<string, Array<{ rule: RuleMatch; mrid: string }>>();
    
    for (const rule of ruleMatches) {
        if (rule.entityType !== 'node') continue;
        for (const mrid of rule.matchingMrids) {
            if (!mridToMatches.has(mrid)) mridToMatches.set(mrid, []);
            mridToMatches.get(mrid)!.push({ rule, mrid });
        }
    }

    const result: Node[] = [];
    for (const node of rawNodes) {
        const matches: Array<{ rule: RuleMatch; mrid: string }> = [];

        // Check node itself
        const nodeMatches = mridToMatches.get(node.id);
        if (nodeMatches) matches.push(...nodeMatches);

        // Check attached equipment
        for (const eq of node.attached_equipment || []) {
            if (eq.mrid) {
                const eqMatches = mridToMatches.get(eq.mrid);
                if (eqMatches) matches.push(...eqMatches);
            }
        }

        if (matches.length === 0) {
            result.push(node);
            continue;
        }

        // Deduplicate rules (one node might match the same rule via different equipment)
        const uniqueRules = new Map<number, { rule: RuleMatch; mrid: string }>();
        for (const m of matches) {
            if (!uniqueRules.has(m.rule.ruleId)) uniqueRules.set(m.rule.ruleId, m);
        }
        const finalMatches = Array.from(uniqueRules.values());

        // Generate one Node object per matching rule
        finalMatches.forEach((match, index) => {
            const { rule, mrid: matchMrid } = match;
            const { finalConfig, activeOverrides } = resolveOverrides(rule.config, matchMrid, rule.overridesData);

            // Calculate radial offset if there are multiple icons
            let pixelOffset: [number, number] | undefined = undefined;
            if (finalMatches.length > 1) {
                const radius = 18; // pixels
                const angle = (index / finalMatches.length) * 2 * Math.PI - Math.PI / 2;
                pixelOffset = [Math.cos(angle) * radius, Math.sin(angle) * radius];
            }

            result.push({ 
                ...node,
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
}

/** Apply rule display props to edges. Uses map-based O(1) lookup per mRID. */
export function classifyEdges(rawEdges: Edge[], ruleMatches: RuleMatch[]): Edge[] {
    if (ruleMatches.length === 0) return rawEdges;

    // Pre-index rule matches by MRID for O(1) lookup
    const mridToMatches = new Map<string, RuleMatch[]>();
    for (const rule of ruleMatches) {
        if (rule.entityType !== 'edge') continue;
        for (const mrid of rule.matchingMrids) {
            if (!mridToMatches.has(mrid)) mridToMatches.set(mrid, []);
            mridToMatches.get(mrid)!.push(rule);
        }
    }

    const result: Edge[] = [];
    for (const edge of rawEdges) {
        if (!edge.id) {
            result.push(edge);
            continue;
        }

        const matches = mridToMatches.get(edge.id);
        if (!matches || matches.length === 0) {
            result.push(edge);
            continue;
        }

        // Generate one Edge object per matching rule
        matches.forEach((rule, index) => {
            const matchMrid = edge.id!;
            const { finalConfig, activeOverrides } = resolveOverrides(rule.config, matchMrid, rule.overridesData);

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
                id: index === 0 ? edge.id : `${edge.id}_v${index}`,
                ...edgeProps,
                display_pixel_offset: pixelOffset,
                is_rule_clone: index > 0,
            });
        });
    }
    return result;
}
