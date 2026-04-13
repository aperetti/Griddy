import { useEffect, useState, useMemo, useCallback } from 'react';
import { Group, Badge, Select, ActionIcon, Text, Stack, Tooltip, Paper, Divider, Button, Loader } from '@mantine/core';
import { Plus, X, Tag } from 'lucide-react';
import { fetchAdjacentClasses } from '../../../../../shared/api';
import { ConditionRow } from './ConditionRow';
import type { PathStep, Condition } from '../../../model/rules';

interface PathStepBuilderProps {
    steps: PathStep[];
    onAddStep: (className: string) => void;
    onUpdateStep: (index: number, className: string) => void;
    onUpdateStepAttrs: (index: number, attrs: Array<{ attr: string; alias: string }>) => void;
    onRemoveStep: (index: number) => void;
    conditions: Condition[];
    onAddConditionForClass: (className: string) => void;
    onUpdateCondition: (id: string, updates: Partial<Condition>) => void;
    onRemoveCondition: (id: string) => void;
    schema: Record<string, any>;
}

/** Fetch and cache adjacent classes for a given parent class. */
function useAdjacentClasses(parentClass: string | null) {
    const [classes, setClasses] = useState<Array<{ name: string; category: string }>>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!parentClass) { setClasses([]); return; }
        let cancelled = false;
        setLoading(true);
        fetchAdjacentClasses(parentClass)
            .then(result => { if (!cancelled) setClasses(result); })
            .catch(() => { if (!cancelled) setClasses([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [parentClass]);

    return { classes, loading };
}

// ── Tooltip attribute picker per step ───────────────────────────────────────

function TooltipAttrPicker({
    cls,
    schema,
    attrs,
    onChange,
}: {
    cls: string;
    schema: Record<string, any>;
    attrs: Array<{ attr: string; alias: string }>;
    onChange: (attrs: Array<{ attr: string; alias: string }>) => void;
}) {
    const attrOptions = useMemo(() => {
        if (!schema[cls]) return [];
        return (schema[cls].attributes as { name: string; is_complex?: boolean }[])
            .filter(a => !a.is_complex && a.name)
            .map(a => ({ value: `${cls}.${a.name}`, label: a.name }));
    }, [cls, schema]);

    const addAttr = (fullPath: string | null) => {
        if (!fullPath) return;
        const alias = fullPath.split('.').pop() ?? fullPath;
        if (attrs.some(a => a.attr === fullPath)) return; // already added
        onChange([...attrs, { attr: fullPath, alias }]);
    };

    const removeAttr = (attr: string) => onChange(attrs.filter(a => a.attr !== attr));

    return (
        <Stack gap={4} mt={6}>
            <Divider opacity={0.1} />
            <Group gap={4} align="center">
                <Tag size={10} style={{ opacity: 0.5 }} />
                <Text size="10px" c="dimmed" fw={600} tt="uppercase">Tooltip fields</Text>
            </Group>
            {attrs.length > 0 && (
                <Group gap={4} wrap="wrap">
                    {attrs.map(a => (
                        <Badge
                            key={a.attr}
                            variant="dot"
                            color="teal"
                            size="xs"
                            radius="sm"
                            style={{ fontFamily: 'monospace' }}
                            rightSection={
                                <ActionIcon size={10} variant="transparent" color="gray" onClick={() => removeAttr(a.attr)}>
                                    <X size={8} />
                                </ActionIcon>
                            }
                        >
                            {a.alias}
                        </Badge>
                    ))}
                </Group>
            )}
            <Select
                size="xs"
                placeholder="Expose attribute…"
                data={attrOptions.filter(o => !attrs.some(a => a.attr === o.value))}
                value={null}
                onChange={addAttr}
                searchable
                clearable
                disabled={attrOptions.length === 0}
                comboboxProps={{ withinPortal: false, zIndex: 2000 }}
                nothingFoundMessage="No attributes"
                leftSection={<Plus size={10} />}
            />
        </Stack>
    );
}

export function PathStepBuilder({
    steps,
    onAddStep,
    onUpdateStep,
    onUpdateStepAttrs,
    onRemoveStep,
    conditions,
    onAddConditionForClass,
    onUpdateCondition,
    onRemoveCondition,
    schema,
}: PathStepBuilderProps) {
    const [addingStep, setAddingStep] = useState(false);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);

    // Parent class for the "add step" dropdown = last step in the list
    const addParentClass = steps.length > 0 ? steps[steps.length - 1].class : null;
    const { classes: addClasses, loading: addLoading } = useAdjacentClasses(addingStep ? addParentClass : null);

    // Parent class for editing step at editingIdx = step before it
    const editParentClass = editingIdx !== null && editingIdx > 0
        ? steps[editingIdx - 1].class
        : null;
    const { classes: editClasses, loading: editLoading } = useAdjacentClasses(editingIdx !== null ? editParentClass : null);

    const addSelectData = useMemo(() => {
        const groups: Record<string, any[]> = {};
        (addClasses || []).filter(c => c && c.name).forEach(c => {
            const cat = c.category || 'Other CIM Classes';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({ value: c.name, label: c.name });
        });
        return Object.entries(groups).map(([group, items]) => ({ group, items }));
    }, [addClasses]);

    const editSelectData = useMemo(() => {
        const groups: Record<string, any[]> = {};
        (editClasses || []).filter(c => c && c.name).forEach(c => {
            const cat = c.category || 'Other CIM Classes';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({ value: c.name, label: c.name });
        });
        return Object.entries(groups).map(([group, items]) => ({ group, items }));
    }, [editClasses]);

    const conditionsForClass = useCallback(
        (cls: string) => conditions.filter(c => c.path.startsWith(cls + '.')),
        [conditions],
    );

    return (
        <Stack gap={0}>
            {steps.map((step, idx) => {
                const isEditing = !step.fixed && editingIdx === idx;
                const cls = step.class;
                const clsConditions = conditionsForClass(cls);
                const isLast = idx === steps.length - 1;

                return (
                    <Stack key={idx} gap={0}>
                        <Paper
                            withBorder
                            p="xs"
                            style={{
                                borderColor: step.fixed
                                    ? 'rgba(255,255,255,0.08)'
                                    : 'rgba(99,179,237,0.3)',
                                background: 'rgba(0,0,0,0.15)',
                            }}
                        >
                            {/* Step header */}
                            <Group gap={6} mb={clsConditions.length > 0 ? 6 : 0}>
                                {isEditing ? (
                                    <Select
                                        size="xs"
                                        value={cls || null}
                                        data={editSelectData}
                                        onChange={(v) => {
                                            if (v) { onUpdateStep(idx, v); setEditingIdx(null); }
                                        }}
                                        searchable
                                        autoFocus
                                        placeholder={editLoading ? 'Loading…' : 'Select class…'}
                                        disabled={editLoading}
                                        rightSection={editLoading ? <Loader size={12} /> : undefined}
                                        style={{ flex: 1 }}
                                        comboboxProps={{ withinPortal: false, zIndex: 2000 }}
                                        nothingFoundMessage={editLoading ? 'Loading…' : 'No matching classes'}
                                    />
                                ) : (
                                    <Tooltip
                                        label={step.fixed ? cls : 'Click to change class'}
                                        openDelay={400}
                                        disabled={step.fixed}
                                    >
                                        <Badge
                                            variant="filled"
                                            color={
                                                cls === 'ConnectivityNode' ? 'teal'
                                                : cls === 'Terminal' ? 'gray'
                                                : 'blue'
                                            }
                                            radius="sm"
                                            size="sm"
                                            style={{ cursor: step.fixed ? 'default' : 'pointer', flexShrink: 0 }}
                                            onClick={() => { if (!step.fixed) setEditingIdx(idx); }}
                                        >
                                            {cls || '…'}
                                        </Badge>
                                    </Tooltip>
                                )}

                                {!step.fixed && (
                                    <ActionIcon
                                        size="xs"
                                        variant="subtle"
                                        color="red"
                                        ml="auto"
                                        onClick={() => { setEditingIdx(null); onRemoveStep(idx); }}
                                    >
                                        <X size={12} />
                                    </ActionIcon>
                                )}
                            </Group>

                            {/* Conditions for this class */}
                            {clsConditions.length > 0 && (
                                <>
                                    <Divider my={6} opacity={0.15} />
                                    <Stack gap={4}>
                                        {clsConditions.map(c => (
                                            <ConditionRow
                                                key={c.id}
                                                condition={c}
                                                handleUpdateCondition={onUpdateCondition}
                                                handleRemove={onRemoveCondition}
                                                targetClass={cls}
                                                schema={schema}
                                            />
                                        ))}
                                    </Stack>
                                </>
                            )}

                            {/* Add condition button */}
                            <Divider my={6} opacity={0.1} />
                            <Button
                                size="compact-xs"
                                variant="subtle"
                                color="gray"
                                leftSection={<Plus size={10} />}
                                onClick={() => onAddConditionForClass(cls)}
                            >
                                Add condition
                            </Button>

                            {/* Tooltip attribute projection — only on non-fixed steps */}
                            {!step.fixed && (
                                <TooltipAttrPicker
                                    cls={cls}
                                    schema={schema}
                                    attrs={step.tooltip_attributes ?? []}
                                    onChange={(attrs) => onUpdateStepAttrs(idx, attrs)}
                                />
                            )}
                        </Paper>

                        {/* Arrow connector — shown between steps and before "add step" */}
                        {(!isLast || addingStep) && (
                            <Group justify="center" my={4}>
                                <Text size="xs" c="dimmed">↓</Text>
                            </Group>
                        )}
                    </Stack>
                );
            })}

            {/* Add step */}
            {addingStep ? (
                <Paper withBorder p="xs" style={{ borderColor: 'rgba(99,179,237,0.3)', background: 'rgba(0,0,0,0.15)' }}>
                    <Group gap={6}>
                        <Select
                            size="xs"
                            data={addSelectData}
                            placeholder={addLoading ? 'Loading…' : addClasses.length === 0 ? 'No adjacent classes found' : 'Select class…'}
                            disabled={addLoading}
                            rightSection={addLoading ? <Loader size={12} /> : undefined}
                            searchable
                            autoFocus
                            style={{ flex: 1 }}
                            comboboxProps={{ withinPortal: false, zIndex: 2000 }}
                            nothingFoundMessage={addLoading ? 'Loading…' : 'No matching classes'}
                            onChange={(v) => {
                                if (v) {
                                    setEditingIdx(null);
                                    onAddStep(v);
                                    setAddingStep(false);
                                }
                            }}
                        />
                        <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setAddingStep(false)} title="Cancel">
                            <X size={12} />
                        </ActionIcon>
                    </Group>
                </Paper>
            ) : (
                <Group justify="center" mt={4}>
                    <Button
                        size="compact-xs"
                        variant="light"
                        color="blue"
                        leftSection={<Plus size={10} />}
                        onClick={() => setAddingStep(true)}
                    >
                        Add step
                    </Button>
                </Group>
            )}
        </Stack>
    );
}
