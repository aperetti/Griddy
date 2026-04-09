import { memo, useState, useEffect, useMemo } from 'react';
import { Group, ActionIcon, Select as MantineSelect, Tooltip, TextInput, Stack, Badge, Text, Loader } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Trash2, GitBranch } from 'lucide-react';
import type { Condition } from '../../../model/rules';
import { CIM_OPERATORS } from '../../../model/rules';

const API_BASE = '/api';

interface ConditionRowProps {
    condition: Condition;
    handleUpdateCondition: (id: string, updates: Partial<Condition>) => void;
    handleRemove: (id: string) => void;
    targetClass?: string;
    schema?: Record<string, any>;
}

function useAttributeExamples(path: string) {
    const [examples, setExamples] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const parts = path.split('.');
        if (parts.length < 2 || !parts[1]) { setExamples([]); return; }
        const [cls, ...rest] = parts;
        const attr = rest.join('.');
        if (!cls || !attr) { setExamples([]); return; }

        let cancelled = false;
        setLoading(true);

        const cypher = `MATCH (n:\`${cls}\`) WHERE n.\`${path}\` IS NOT NULL RETURN DISTINCT n.\`${path}\` AS value ORDER BY value LIMIT 8`;

        fetch(`${API_BASE}/cim/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cypher, params: {} }),
        })
            .then(r => r.json())
            .then(data => {
                if (!cancelled) {
                    const vals = (data.rows ?? [])
                        .map((r: any) => String(r.value ?? ''))
                        .filter(Boolean);
                    setExamples(vals);
                }
            })
            .catch(() => { if (!cancelled) setExamples([]); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [path]);

    return { examples, loading };
}

export const ConditionRow = memo(({
    condition,
    handleUpdateCondition,
    handleRemove,
    targetClass,
    schema,
}: ConditionRowProps) => {
    const [localValue, setLocalValue] = useState(condition.value ?? '');
    const isMobile = useMediaQuery('(max-width: 768px)');

    useEffect(() => {
        setLocalValue(condition.value ?? '');
    }, [condition.value]);

    const isUnary = condition.op === 'exists' || condition.op === 'not_exists';

    // Derive class from path prefix (e.g. "Terminal.voltage" → "Terminal")
    const derivedClass = condition.path.includes('.')
        ? condition.path.split('.')[0]
        : targetClass;

    // Attribute options for the class
    const attrOptions = useMemo(() => {
        if (!derivedClass || !schema?.[derivedClass]?.attributes) return [];
        return (schema[derivedClass].attributes as { name: string }[])
            .filter(a => a.name)
            .map(a => ({ value: `${derivedClass}.${a.name}`, label: a.name }));
    }, [derivedClass, schema]);

    const { examples, loading: loadingExamples } = useAttributeExamples(condition.path);

    const hasGraphPath = condition.graph_path && condition.graph_path.length > 0;

    const graphPathBadge = hasGraphPath ? (
        <Tooltip
            label={`Traversal path captured (${condition.graph_path!.length} hop${condition.graph_path!.length !== 1 ? 's' : ''})`}
            withArrow
        >
            <ActionIcon variant="subtle" color="blue" size="sm" style={{ cursor: 'default' }}>
                <GitBranch size={12} />
            </ActionIcon>
        </Tooltip>
    ) : null;

    const deleteButton = (
        <ActionIcon variant="subtle" color="red" size="sm" onClick={() => handleRemove(condition.id)}>
            <Trash2 size={14} />
        </ActionIcon>
    );

    const attrSelect = (
        <MantineSelect
            placeholder="Attribute…"
            value={condition.path || null}
            data={attrOptions}
            onChange={(v) => v && handleUpdateCondition(condition.id, { path: v })}
            searchable
            size="xs"
            style={{ flex: 2, minWidth: 0 }}
            comboboxProps={{ withinPortal: false, zIndex: 2000 }}
        />
    );

    const opSelect = (
        <MantineSelect
            data={CIM_OPERATORS}
            value={condition.op}
            size="xs"
            style={{ width: 110, flexShrink: 0 }}
            onChange={(val) => handleUpdateCondition(condition.id, { op: val || '==' })}
            comboboxProps={{ withinPortal: false, zIndex: 2000 }}
        />
    );

    const valueInput = !isUnary ? (
        <TextInput
            placeholder="Value"
            value={localValue}
            size="xs"
            style={{ flex: 2, minWidth: 0 }}
            onChange={(e) => setLocalValue(e.currentTarget.value)}
            onBlur={() => handleUpdateCondition(condition.id, { value: localValue })}
        />
    ) : null;

    const exampleRow = (
        (examples.length > 0 || loadingExamples) && !isUnary ? (
            <Group gap={4} align="center" mt={2}>
                <Text size="10px" c="dimmed" style={{ flexShrink: 0 }}>e.g.</Text>
                {loadingExamples
                    ? <Loader size={10} />
                    : examples.map(ex => (
                        <Badge
                            key={ex}
                            size="xs"
                            variant="outline"
                            color="gray"
                            style={{ cursor: 'pointer', fontWeight: 400 }}
                            onClick={() => {
                                setLocalValue(ex);
                                handleUpdateCondition(condition.id, { value: ex });
                            }}
                        >
                            {ex}
                        </Badge>
                    ))
                }
            </Group>
        ) : null
    );

    if (isMobile) {
        return (
            <Stack gap={4} mb="xs" p="xs" style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                {attrSelect}
                <Group gap="xs" wrap="nowrap">
                    {opSelect}
                    <Group gap={4} ml="auto">
                        {graphPathBadge}
                        {deleteButton}
                    </Group>
                </Group>
                {valueInput}
                {exampleRow}
            </Stack>
        );
    }

    return (
        <Stack gap={2} mb="xs">
            <Group gap="xs" wrap="nowrap">
                {attrSelect}
                {opSelect}
                {valueInput}
                {graphPathBadge}
                {deleteButton}
            </Group>
            {exampleRow}
        </Stack>
    );
});
