import { useState, useEffect, useCallback } from 'react';
import {
    ensureIds,
    updateNode,
    removeNode,
    genId
} from '../model/rules';
import type {
    Condition,
    GraphPathStep,
    MatchConditions,
    PathStep,
} from '../model/rules';

export function useCimRuleBuilder(value: string | any, onChange: (value: string) => void) {
    const parseValue = (val: any): MatchConditions => {
        try {
            const parsed = typeof val === 'string' ? JSON.parse(val || '{}') : val;
            let migrated = ensureIds(parsed?.logical_op ? parsed : { ...parsed, logical_op: 'AND', conditions: parsed?.conditions || [] });

            // Migrate path_steps to ensure they have IDs and parent_ids
            if (migrated.path_steps && Array.isArray(migrated.path_steps)) {
                migrated.path_steps = migrated.path_steps.map((step: any, index: number, arr: any[]) => {
                    const newStep = { ...step, id: step.id || genId() };
                    // Apply ID to the original array element so subsequent steps can reference it
                    arr[index] = newStep; 
                    if (!newStep.parent_id && index > 0 && migrated.path_steps.length > index) {
                        newStep.parent_id = arr[index - 1].id;
                    }
                    return newStep;
                });
            }

            return migrated;
        } catch (e) {
            const base = { id: genId(), logical_op: 'AND', conditions: [] };
            return base;
        }
    };

    const [conditions, setConditions] = useState<MatchConditions>(() => parseValue(value));

    const handleUpdate = useCallback((next: MatchConditions) => {
        setConditions(next);
        onChange(JSON.stringify(next));
    }, [onChange]);

    useEffect(() => {
        setConditions(parseValue(value));
    }, [value]);

    // ── Entity type + rule mode ──────────────────────────────────────────────

    const setEntityType = useCallback((type: 'node' | 'edge') => {
        const update: Partial<MatchConditions> = { entity_type: type };
        // Initialise mode if not set
        update.rule_mode = conditions.rule_mode || 'guided';
        
        if (type === 'node') {
            update.target_class = undefined;
            // Node rules default to node geometry
            update.geometry_type = 'node';
        } else {
            // Switch to guided edge mode
            if (!conditions.path_steps?.length) {
                // Initialize with current target_class if available, else default
                const edgeClass = conditions.target_class || 'ACLineSegment';
                update.path_steps = [{ id: genId(), class: edgeClass, fixed: false }];
            }
            update.custom_cypher = undefined;
            // Edge rules default to edge geometry
            update.geometry_type = 'edge';
        }
        handleUpdate({ ...conditions, ...update });
    }, [conditions, handleUpdate]);

    const setGeometryType = useCallback((type: 'any' | 'node' | 'edge') => {
        // Keep entity_type in sync so the query builder anchors correctly.
        // 'edge' geometry → edge-anchored query; anything else → node-anchored.
        handleUpdate({ ...conditions, geometry_type: type, entity_type: type === 'edge' ? 'edge' : 'node' });
    }, [conditions, handleUpdate]);

    const setRuleMode = useCallback((mode: 'guided' | 'custom_cypher') => {
        const update: Partial<MatchConditions> = { rule_mode: mode };
        if (mode === 'guided') {
            if (conditions.entity_type === 'edge' && !conditions.path_steps?.length) {
                const edgeClass = conditions.target_class || 'ACLineSegment';
                update.path_steps = [{ id: genId(), class: edgeClass, fixed: false }];
            }
        }
        handleUpdate({ ...conditions, ...update });
    }, [conditions, handleUpdate]);

    const setCustomCypher = useCallback((cypher: string) => {
        handleUpdate({ ...conditions, custom_cypher: cypher });
    }, [conditions, handleUpdate]);

    // ── Path management ──────────────────────────────────────────────────────

    const addPathStep = useCallback((className: string, parentId?: string) => {
        const current = conditions.path_steps || [];
        const pId = parentId || (current.length > 0 ? current[current.length - 1].id : undefined);
        handleUpdate({ ...conditions, path_steps: [...current, { id: genId(), parent_id: pId, class: className }] });
    }, [conditions, handleUpdate]);

    /**
     * Starts a node-rule path by injecting the required ConnectivityNode → Terminal
     * fixed anchors and then appending the chosen equipment class.
     * Only called from "Start path" in node-mode UI; addPathStep remains injection-free.
     */
    const initNodePath = useCallback((equipmentClass: string) => {
        const cnId = genId();
        const tId = genId();
        handleUpdate({
            ...conditions,
            path_steps: [
                { id: cnId, class: 'ConnectivityNode', fixed: true },
                { id: tId, class: 'Terminal', fixed: true, parent_id: cnId },
                { id: genId(), class: equipmentClass, fixed: false, parent_id: tId },
            ],
        });
    }, [conditions, handleUpdate]);

    const updatePathStep = useCallback((index: number, className: string) => {
        const current = [...(conditions.path_steps || [])];
        current[index] = { ...current[index], class: className };
        handleUpdate({ ...conditions, path_steps: current });
    }, [conditions, handleUpdate]);

    const updatePathStepAttrs = useCallback((index: number, attrs: Array<{ attr: string; alias: string }>) => {
        const current = [...(conditions.path_steps || [])];
        current[index] = { ...current[index], tooltip_attributes: attrs };
        handleUpdate({ ...conditions, path_steps: current });
    }, [conditions, handleUpdate]);

    const removePathStep = useCallback((index: number) => {
        const current = conditions.path_steps || [];
        if (current[index]?.fixed) return; // cannot remove fixed steps
        const stepId = current[index].id;
        
        // Find descendants
        const toRemove = new Set<string>([stepId]);
        let changed = true;
        while (changed) {
            changed = false;
            for (const step of current) {
                if (step.parent_id && toRemove.has(step.parent_id) && !toRemove.has(step.id)) {
                    toRemove.add(step.id);
                    changed = true;
                }
            }
        }
        
        handleUpdate({ ...conditions, path_steps: current.filter((s) => !toRemove.has(s.id)) });
    }, [conditions, handleUpdate]);

    // ── Legacy: target_class + resolve_via_connectivity_node ─────────────────

    const setTargetClass = useCallback((className: string | null) => {
        handleUpdate({ ...conditions, target_class: className || undefined });
    }, [conditions, handleUpdate]);

    // ── Condition group operations ────────────────────────────────────────────

    const setLogicalOp = useCallback((id: string, op: 'AND' | 'OR') => {
        const next = updateNode(conditions, id, (n) => ({ ...n, logical_op: op }));
        handleUpdate(next as MatchConditions);
    }, [conditions, handleUpdate]);

    const addCondition = useCallback((groupId: string) => {
        const next = updateNode(conditions, groupId, (n) => ({
            ...n,
            conditions: [...n.conditions, { id: genId(), path: '', op: '==', value: '' }]
        }));
        handleUpdate(next as MatchConditions);
    }, [conditions, handleUpdate]);

    const addConditionForClass = useCallback((className: string, stepId?: string) => {
        const newCond: Condition = { id: genId(), path: `${className}.`, op: '==', value: '', step_id: stepId };
        const next = updateNode(conditions, conditions.id, (n) => ({
            ...n,
            conditions: [...n.conditions, newCond]
        }));
        handleUpdate(next as MatchConditions);
    }, [conditions, handleUpdate]);

    const addFilledCondition = useCallback((groupId: string, path: string, value: any, op: string, graphPath?: GraphPathStep[], stepId?: string) => {
        const newCond: Condition = { id: genId(), path, op, value: value ?? '', step_id: stepId };
        if (graphPath && graphPath.length > 0) newCond.graph_path = graphPath;
        const next = updateNode(conditions, groupId, (n) => ({
            ...n,
            conditions: [...n.conditions, newCond]
        }));
        handleUpdate(next as MatchConditions);
    }, [conditions, handleUpdate]);

    const addGroup = useCallback((groupId: string) => {
        const next = updateNode(conditions, groupId, (n) => ({
            ...n,
            conditions: [...n.conditions, { id: genId(), logical_op: 'AND', conditions: [] }]
        }));
        handleUpdate(next as MatchConditions);
    }, [conditions, handleUpdate]);

    const updateCondition = useCallback((id: string, updates: Partial<Condition>) => {
        const next = updateNode(conditions, id, (n) => ({ ...n, ...updates }));
        handleUpdate(next as MatchConditions);
    }, [conditions, handleUpdate]);

    const removeNodeItem = useCallback((id: string) => {
        const next = removeNode(conditions, id);
        handleUpdate(next as MatchConditions);
    }, [conditions, handleUpdate]);

    return {
        conditions,
        /** Direct full-conditions update — use sparingly (e.g. to apply explorer-derived path) */
        handleUpdate,
        // New operations
        setEntityType,
        setGeometryType,
        setRuleMode,
        setCustomCypher,
        addPathStep,
        initNodePath,
        updatePathStep,
        updatePathStepAttrs,
        removePathStep,
        // Legacy: target_class for edge mode
        setTargetClass,
        // Condition operations
        setLogicalOp,
        addCondition,
        addConditionForClass,
        addFilledCondition,
        addGroup,
        updateCondition,
        removeNodeItem,
    };
}
