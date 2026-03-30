import { memo, useState, useEffect } from 'react';
import { Group, ActionIcon, TextInput, Select as MantineSelect } from '@mantine/core';
import { Trash2 } from 'lucide-react';
import type { Condition } from '../../../model/rules';
import { CIM_OPERATORS } from '../../../model/rules';

interface ConditionRowProps {
    condition: Condition;
    handleUpdateCondition: (id: string, updates: Partial<Condition>) => void;
    handleRemove: (id: string) => void;
}

export const ConditionRow = memo(({ 
    condition, 
    handleUpdateCondition, 
    handleRemove
}: ConditionRowProps) => {
    // Local state for the value to prevent focus loss during rapid typing
    const [localValue, setLocalValue] = useState(condition.value);

    // Sync local value when external value changes (e.g. from Assistant)
    useEffect(() => {
        setLocalValue(condition.value || '');
    }, [condition.value]);

    const isUnary = condition.op === 'exists' || condition.op === 'not_exists';

    return (
        <Group gap="xs" wrap="nowrap" mb="xs">
            <TextInput
                placeholder="Attribute path (e.g. ratedS)"
                value={condition.path}
                size="xs"
                style={{ flex: 1 }}
                onChange={(e) => handleUpdateCondition(condition.id, { path: e.currentTarget.value })}
            />
            
            <MantineSelect
                data={CIM_OPERATORS}
                value={condition.op}
                size="xs"
                style={{ width: 120 }}
                onChange={(val) => handleUpdateCondition(condition.id, { op: val || '==' })}
                comboboxProps={{ zIndex: 2000, withinPortal: true }}
            />

            {!isUnary && (
                <TextInput
                    placeholder="Value"
                    value={localValue}
                    size="xs"
                    style={{ flex: 1 }}
                    onChange={(e) => {
                        const val = e.currentTarget.value;
                        setLocalValue(val);
                    }}
                    onBlur={() => handleUpdateCondition(condition.id, { value: localValue })}
                />
            )}

            <ActionIcon 
                variant="subtle" 
                color="red" 
                size="sm" 
                onClick={() => handleRemove(condition.id)}
            >
                <Trash2 size={14} />
            </ActionIcon>
        </Group>
    );
});
