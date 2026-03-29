import { useState, useEffect, useCallback } from 'react';
import { 
    ensureIds, 
    updateNode, 
    removeNode,
    genId 
} from '../model/rules';
import type { 
    Condition, 
    MatchConditions 
} from '../model/rules';

export function useCimRuleBuilder(value: string | any, onChange: (value: string) => void) {
    const parseValue = (val: any): MatchConditions => {
        try {
            const parsed = typeof val === 'string' ? JSON.parse(val || '{}') : val;
            return ensureIds(parsed?.logical_op ? parsed : { ...parsed, logical_op: 'AND', conditions: parsed?.conditions || [] });
        } catch (e) {
            return { id: genId(), logical_op: 'AND', conditions: [] };
        }
    };

    const [conditions, setConditions] = useState<MatchConditions>(() => parseValue(value));

    // Synchronize local state with external value changes
    useEffect(() => {
        const nextConditions = parseValue(value);
        const currentJson = JSON.stringify(conditions);
        const incomingJson = JSON.stringify(nextConditions);
        
        if (currentJson !== incomingJson) {
            setConditions(nextConditions);
        }
    }, [value]);

    const handleUpdate = useCallback((newConditions: MatchConditions) => {
        setConditions(newConditions);
        onChange(JSON.stringify(newConditions));
    }, [onChange]);

    const setTargetClass = useCallback((className: string | null) => {
        handleUpdate({ ...conditions, target_class: className || undefined });
    }, [conditions, handleUpdate]);

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
        setTargetClass,
        setLogicalOp,
        addCondition,
        addGroup,
        updateCondition,
        removeNodeItem
    };
}
