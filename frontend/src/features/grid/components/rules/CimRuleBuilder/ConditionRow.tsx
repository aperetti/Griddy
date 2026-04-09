import { memo, useState, useEffect, useMemo } from 'react';
import { Group, ActionIcon, Select as MantineSelect, Tooltip, Autocomplete, TextInput, Stack } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Trash2, GitBranch } from 'lucide-react';
import type { Condition } from '../../../model/rules';
import { CIM_OPERATORS } from '../../../model/rules';

interface ConditionRowProps {
    condition: Condition;
    handleUpdateCondition: (id: string, updates: Partial<Condition>) => void;
    handleRemove: (id: string) => void;
    targetClass?: string;
    schema?: Record<string, any>;
}

export const ConditionRow = memo(({
    condition,
    handleUpdateCondition,
    handleRemove,
    targetClass,
    schema,
}: ConditionRowProps) => {
    const [localValue, setLocalValue] = useState(condition.value);
    const isMobile = useMediaQuery('(max-width: 768px)');

    useEffect(() => {
        setLocalValue(condition.value || '');
    }, [condition.value]);

    const isUnary = condition.op === 'exists' || condition.op === 'not_exists';

    const pathSuggestions = useMemo(() => {
        if (!targetClass || !schema) return [];
        const classSchema = schema[targetClass];
        if (!classSchema?.attributes) return [];
        return (classSchema.attributes as { name: string }[])
            .filter(a => a.name)
            .map(a => `${targetClass}.${a.name}`);
    }, [targetClass, schema]);

    const hasGraphPath = condition.graph_path && condition.graph_path.length > 0;

    const graphPathBadge = hasGraphPath ? (
        <Tooltip
            label={`Traversal path captured (${condition.graph_path!.length} hop${condition.graph_path!.length !== 1 ? 's' : ''}) — query uses exact relationship types`}
            withArrow
            position="top"
        >
            <ActionIcon variant="subtle" color="blue" size="sm" style={{ cursor: 'default' }}>
                <GitBranch size={12} />
            </ActionIcon>
        </Tooltip>
    ) : null;

    const deleteButton = (
        <ActionIcon
            variant="subtle"
            color="red"
            size="sm"
            onClick={() => handleRemove(condition.id)}
        >
            <Trash2 size={14} />
        </ActionIcon>
    );

    if (isMobile) {
        return (
            <Stack gap={4} mb="sm" p="xs" style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                <Autocomplete
                    placeholder="Attribute path (e.g. ratedS)"
                    value={condition.path}
                    size="xs"
                    data={pathSuggestions}
                    onChange={(val) => handleUpdateCondition(condition.id, { path: val })}
                    comboboxProps={{ zIndex: 2000, withinPortal: true }}
                />
                <Group gap="xs" wrap="nowrap">
                    <MantineSelect
                        data={CIM_OPERATORS}
                        value={condition.op}
                        size="xs"
                        style={{ flex: 1 }}
                        onChange={(val) => handleUpdateCondition(condition.id, { op: val || '==' })}
                        comboboxProps={{ zIndex: 2000, withinPortal: true }}
                    />
                    {graphPathBadge}
                    {deleteButton}
                </Group>
                {!isUnary && (
                    <TextInput
                        placeholder="Value"
                        value={localValue}
                        size="xs"
                        onChange={(e) => setLocalValue(e.currentTarget.value)}
                        onBlur={() => handleUpdateCondition(condition.id, { value: localValue })}
                    />
                )}
            </Stack>
        );
    }

    return (
        <Group gap="xs" wrap="nowrap" mb="xs">
            <Autocomplete
                placeholder="Attribute path (e.g. ratedS)"
                value={condition.path}
                size="xs"
                style={{ flex: 1 }}
                data={pathSuggestions}
                onChange={(val) => handleUpdateCondition(condition.id, { path: val })}
                comboboxProps={{ zIndex: 2000, withinPortal: true }}
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
                    onChange={(e) => setLocalValue(e.currentTarget.value)}
                    onBlur={() => handleUpdateCondition(condition.id, { value: localValue })}
                />
            )}
            {graphPathBadge}
            {deleteButton}
        </Group>
    );
});
