import type { Node, Edge } from '../../../shared/types';

const SWITCH_EDGE_TYPES = new Set(['Breaker', 'LoadBreakSwitch', 'Fuse', 'Disconnector', 'Recloser', 'ACLineSegment', 'PowerTransformer']);
const SUPPRESSED_ATTACHED_TYPES = new Set(['EnergyConsumer']);

// ── Condition evaluator (mirrors CimRuleEngine.evaluate_group) ────────────────

function getNestedValue(data: any, path: string): any {
    let current = data;
    for (const part of path.split('.')) {
        if (current == null) return null;
        if (Array.isArray(current)) {
            const idx = parseInt(part, 10);
            current = isNaN(idx) ? null : current[idx];
        } else if (typeof current === 'object') {
            current = current[part];
        } else {
            return null;
        }
    }
    return current ?? null;
}

function evalCondition(cond: any, data: any): boolean {
    if ('logical_op' in cond) return evaluateConditions(cond, data);
    const actual = getNestedValue(data, cond.path ?? '');
    const target = cond.value;
    const op: string = cond.op ?? '==';
    if (op === 'exists') return actual != null;
    if (op === 'not_exists') return actual == null;
    if (actual == null) return false;
    const a = typeof target === 'number' ? parseFloat(actual) : actual;
    switch (op) {
        case '==': return a == target;  // eslint-disable-line eqeqeq
        case '!=': return a != target;  // eslint-disable-line eqeqeq
        case '>':  return a > target;
        case '<':  return a < target;
        case '>=': return a >= target;
        case '<=': return a <= target;
        case 'contains': return String(actual).toLowerCase().includes(String(target).toLowerCase());
        default:   return false;
    }
}

export function evaluateConditions(group: any, data: any): boolean {
    if (!group) return false;
    const conds: any[] = group.conditions ?? [];
    if (!conds.length) return true;
    const results = conds.map(c => evalCondition(c, data));
    return (group.logical_op ?? 'AND') === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

// ── Tooltip config renderer ───────────────────────────────────────────────────

function coerceValue(v: any): string {
    if (v == null || v === '') return '';
    if (Array.isArray(v)) return v.map(coerceValue).filter(Boolean).join(', ');
    if (typeof v === 'number') return v % 1 === 0 ? String(v) : v.toFixed(2);
    return String(v);
}

function resolvePath(merged: any, path: string): string {
    // 1. Try exact flat key ("IdentifiedObject.name" stored as a single property key in n10s)
    if (Object.prototype.hasOwnProperty.call(merged, path) && merged[path] != null) {
        return coerceValue(merged[path]);
    }

    // 2. Nested dot traversal ("container.name" → merged.container.name)
    const parts = path.split('.');
    let val: any = merged;
    for (const p of parts) {
        if (val == null) break;
        val = Array.isArray(val) ? val[parseInt(p, 10)] : val[p];
    }
    if (val != null && val !== '') return coerceValue(val);

    // 3. Strip CIM class prefix — API returns unqualified property names
    //    ("IdentifiedObject.name" → try "name"; "PowerTransformer.ratedS" → try "ratedS")
    if (parts.length >= 2) {
        const unqualified = parts.slice(1).join('.');
        if (Object.prototype.hasOwnProperty.call(merged, unqualified) && merged[unqualified] != null) {
            return coerceValue(merged[unqualified]);
        }
        // Also traverse unqualified as a nested path
        let uval: any = merged;
        for (const p of parts.slice(1)) {
            if (uval == null) break;
            uval = Array.isArray(uval) ? uval[parseInt(p, 10)] : uval[p];
        }
        if (uval != null && uval !== '') return coerceValue(uval);
    }

    return '';
}

function renderEasyRows(attrs: Array<{ alias: string; path: string; label?: string }>, merged: any): string | null {
    if (!attrs.length) return null;
    const rows = attrs
        .filter(a => a.path && !a.path.endsWith('.'))
        .map(a => {
            const val = resolvePath(merged, a.path);
            if (!val) return '';
            const displayLabel = a.label || a.alias || a.path.split('.').pop() || a.path;
            return `<div style="font-size:12px;margin-bottom:2px;"><strong>${displayLabel}:</strong> ${val}</div>`;
        })
        .filter(Boolean)
        .join('');
    if (!rows) return null;
    return `<div class="grid-map-tooltip" style="padding:10px;background:#1A1B1E;border:1px solid #373A40;border-radius:8px;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,0.5);min-width:150px;pointer-events:auto;">${rows}</div>`;
}

function renderTooltipConfig(cfg: any, merged: any): string | null {
    // Build alias→path map from new attributes array
    const attrMap: Record<string, string> = {};
    for (const a of (cfg.attributes ?? [])) {
        if (a.alias && a.path) attrMap[a.alias] = a.path;
    }

    const resolve = (token: string): string => {
        const path = attrMap[token] ?? token;
        return resolvePath(merged, path);
    };

    // Determine effective mode:
    //   explicit tooltip_mode takes priority;
    //   legacy fallback: html_template present → html, fields present → legacy, attributes present → easy
    const explicitMode: string | undefined = cfg.tooltip_mode;
    const effectiveMode = explicitMode ?? (cfg.html_template ? 'html' : cfg.fields?.length ? 'legacy' : 'easy');

    if (effectiveMode === 'easy') {
        return renderEasyRows(cfg.attributes ?? [], merged);
    }

    if (effectiveMode === 'html' || cfg.html_template) {
        if (!cfg.html_template) return null;
        return cfg.html_template.replace(/\{\{([\w.]+)\}\}/g, (_: string, f: string) => resolve(f));
    }

    // Legacy basic-mode fallback (fields array)
    const fields: Array<{ id: string; label: string; field: string }> = cfg.fields || [];
    if (!fields.length) return null;
    const rows = fields
        .filter(f => f.field)
        .map(f => {
            const val = resolve(f.field);
            if (!val) return '';
            return `<div style="font-size:12px;margin-bottom:2px;"><strong>${f.label || f.field}:</strong> ${val}</div>`;
        })
        .filter(Boolean)
        .join('');
    if (!rows) return null;
    return `<div class="grid-map-tooltip" style="padding:10px;background:#1A1B1E;border:1px solid #373A40;border-radius:8px;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,0.5);min-width:150px;pointer-events:auto;">${rows}</div>`;
}

const TOOLTIP_STYLE = { backgroundColor: 'transparent', fontSize: '12px' };

export interface TooltipContext {
    nodeAverages?: Record<string, number> | null;
    nodeCurrents?: Record<string, { a: number; b: number; c: number }> | null;
}

export type DeckTooltip = { html: string; style: object };

export function renderRuleTooltip(obj: any, cimData?: any): string | null {
    const cfg = obj.display_tooltip;
    if (!cfg) return null;

    // display_tooltip_data holds pre-projected values from the rule's path traversal
    // (e.g. TransformerTankEndInfo.ratedS fetched at rule-match time).
    // It takes highest priority so aliased tokens always resolve.
    const merged = {
        ...obj,
        ...(cimData ?? {}),
        ...(obj.display_tooltip_data ?? {}),
    };

    // Check per-override tooltip configs first — use the first whose conditions match
    const overrides: Array<{ conditions: any; tooltip_config: any }> = obj.display_tooltip_overrides ?? [];
    for (const ov of overrides) {
        if (evaluateConditions(ov.conditions, merged)) {
            // Use override config if provided, otherwise fall back to base rule config
            return renderTooltipConfig(ov.tooltip_config || cfg, merged);
        }
    }

    return renderTooltipConfig(cfg, merged);
}

export function getTooltipContent(object: any, ctx: TooltipContext): DeckTooltip | null {
    if (!object) return null;

    if (object.pointCount) {
        return {
            html: `
            <div class="grid-map-tooltip" style="padding: 10px; background: #1A1B1E; border: 1px solid #373A40; border-radius: 8px; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.5); min-width: 150px; pointer-events: auto;">
                <div style="font-size: 14px; font-weight: 700; margin-bottom: 5px; color: #4dabf7;">Cluster</div>
                <div style="font-size: 13px;"><span><strong>Aggregated nodes:</strong> ${object.pointCount}</span></div>
                <div style="margin-top: 8px; font-size: 11px; opacity: 0.6;">Click to expand</div>
            </div>`,
            style: TOOLTIP_STYLE,
        };
    }

    // Node
    if ('position' in object && !('source' in object)) {
        const node = object as Node;
        const ruleHtml = renderRuleTooltip(node);
        if (ruleHtml) return { html: ruleHtml, style: TOOLTIP_STYLE };

        // Suppress default tooltip for ConnectivityNodes that have no non-suppressed equipment
        const isConnectivityNode = !node.type || node.type === 'ConnectivityNode';
        const attached = node.attached_equipment ?? [];
        const hasRelevantEquipment = attached.some(eq => !SUPPRESSED_ATTACHED_TYPES.has(eq.type));
        
        if (isConnectivityNode && !hasRelevantEquipment) {
            return null;
        }

        let attachedInfo = '';
        if (attached.length > 0) {
            attachedInfo = `<div style="margin-top: 8px; border-top: 1px solid #373A40; padding-top: 5px;">`;
            attached.forEach(eq => {
                // Skip rendering suppressed types in the default tooltip too
                if (SUPPRESSED_ATTACHED_TYPES.has(eq.type)) return;

                attachedInfo += `<div style="margin-top: 2px;">• <strong>${eq.type}:</strong> ${eq.name}`;
                if (eq.active_power_w != null) {
                    attachedInfo += `<br/>&nbsp;&nbsp;Rating: ${(eq.active_power_w / 1000).toFixed(1)} kVA`;
                }
                if (eq.phases) {
                    attachedInfo += `<br/>&nbsp;&nbsp;Phases: ${eq.phases.join('')}`;
                }
                attachedInfo += `</div>`;
            });
            attachedInfo += `</div>`;
        }

        return {
            html: `
            <div class="grid-map-tooltip" style="padding: 10px; background: #1A1B1E; border: 1px solid #373A40; border-radius: 8px; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.5); min-width: 150px; pointer-events: auto;">
                <div style="font-size: 14px; font-weight: 700; margin-bottom: 5px; color: #4dabf7;">${node.name || 'Unnamed Node'}</div>
                <div style="opacity: 0.8; font-size: 12px; margin-bottom: 8px;">${node.id}</div>
                <div style="display: flex; gap: 10px; font-size: 13px;">
                    <span><strong>Type:</strong> ${node.type || 'ConnectivityNode'}</span>
                    <span><strong>Phases:</strong> ${Array.isArray(node.phases) ? node.phases.join('') : (node.phases || 'ABC')}</span>
                </div>
                ${attachedInfo}
            </div>`,
            style: TOOLTIP_STYLE,
        };
    }

    // Edge
    const edgeRuleHtml = renderRuleTooltip(object);
    if (edgeRuleHtml) return { html: edgeRuleHtml, style: TOOLTIP_STYLE };

    const edgeObj = object as Edge;
    
    // Disable default tooltip for switches — only show if a rule specifies one
    if (edgeObj.edge_type && SWITCH_EDGE_TYPES.has(edgeObj.edge_type)) {
        return null;
    }

    const phaseData = Array.isArray(edgeObj.phases) ? edgeObj.phases.join('') : (edgeObj.phases || 'ABC');

    let details = '';
    if (edgeObj.transformer_kva && edgeObj.transformer_kva > 0) {
        details = `<div style="margin-top: 5px; color: #ffd43b;"><strong>Rating:</strong> ${edgeObj.transformer_kva.toFixed(1)} kVA</div>`;
    } else if (edgeObj.is_open !== undefined && edgeObj.edge_type && SWITCH_EDGE_TYPES.has(edgeObj.edge_type)) {
        details = `<div style="margin-top: 5px; color: ${edgeObj.is_open ? '#ff6b6b' : '#69db7c'};"><strong>State:</strong> ${edgeObj.is_open ? 'OPEN' : 'CLOSED'}</div>`;
    } else if (edgeObj.length_m) {
        details = `<div style="margin-top: 5px;"><strong>Length:</strong> ${edgeObj.length_m.toFixed(1)} m</div>`;
    }

    let powerStats = '';
    const { nodeCurrents, nodeAverages } = ctx;
    if ((edgeObj.edge_type === 'PowerTransformer' || edgeObj.is_regulator) && nodeCurrents?.[edgeObj.target] && nodeAverages?.[edgeObj.target]) {
        const currents = nodeCurrents[edgeObj.target];
        const voltage = nodeAverages[edgeObj.target];
        const totalS = (voltage * (currents.a + currents.b + currents.c)) / 1000.0;
        powerStats = `<div style="margin-top: 8px; border-top: 1px solid #373A40; padding-top: 5px; color: #91a7ff;"><strong>Apparent Power:</strong> ${totalS.toFixed(1)} kVA</div>`;
    }

    return {
        html: `
        <div class="grid-map-tooltip" style="padding: 10px; background: #1A1B1E; border: 1px solid #373A40; border-radius: 8px; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.5); min-width: 150px; pointer-events: auto;">
            <div style="font-size: 14px; font-weight: 700; margin-bottom: 5px; color: #4dabf7;">${edgeObj.name || (edgeObj.edge_type ?? 'Edge')}</div>
            <div style="opacity: 0.8; font-size: 12px; margin-bottom: 8px;">${edgeObj.id || `${edgeObj.source} → ${edgeObj.target}`}</div>
            <div style="display: flex; gap: 10px; font-size: 13px;">
                <span><strong>Type:</strong> ${edgeObj.edge_type || 'Line'}</span>
                <span><strong>Phases:</strong> ${phaseData}</span>
            </div>
            ${details}
            ${powerStats}
        </div>`,
        style: TOOLTIP_STYLE,
    };
}
