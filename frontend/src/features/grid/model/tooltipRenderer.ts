import type { Node, Edge } from '../../../shared/types';

const SWITCH_EDGE_TYPES = new Set(['Breaker', 'LoadBreakSwitch', 'Fuse', 'Disconnector', 'Recloser']);

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

function renderTooltipConfig(cfg: any, merged: any): string | null {
    const resolve = (field: string): string => {
        const parts = field.split('.');
        let val: any = merged;
        for (const p of parts) val = val?.[p];
        if (Array.isArray(val)) return val.join(', ');
        if (val == null || val === '') return '';
        if (typeof val === 'number') return val % 1 === 0 ? String(val) : val.toFixed(2);
        return String(val);
    };

    if (cfg.mode === 'advanced') {
        if (!cfg.html_template) return null;
        return cfg.html_template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_: string, f: string) => resolve(f));
    }

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

    const merged = cimData ? { ...obj, ...cimData } : obj;

    // Check per-override tooltip configs first — use the first whose conditions match
    const overrides: Array<{ conditions: any; tooltip_config: any }> = obj.display_tooltip_overrides ?? [];
    for (const ov of overrides) {
        if (ov.tooltip_config && evaluateConditions(ov.conditions, merged)) {
            return renderTooltipConfig(ov.tooltip_config, merged);
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

        let attachedInfo = '';
        if (node.attached_equipment && node.attached_equipment.length > 0) {
            attachedInfo = `<div style="margin-top: 8px; border-top: 1px solid #373A40; padding-top: 5px;">`;
            node.attached_equipment.forEach(eq => {
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
