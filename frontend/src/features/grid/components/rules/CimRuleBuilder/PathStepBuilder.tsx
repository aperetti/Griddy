import { useEffect, useState, useMemo } from 'react';
import { Group, Badge, Select, ActionIcon, Text, Stack, Tooltip, Paper, Divider, Button, Loader } from '@mantine/core';
import { Plus, X } from 'lucide-react';
import { fetchConductingEquipmentClasses } from '../../../../../shared/api';
import { useSchema } from '../../../context/SchemaContext';
import { ConditionRow } from './ConditionRow';
import type { PathStep, Condition } from '../../../model/rules';

interface PathStepBuilderProps {
    steps: PathStep[];
    onAddStep: (className: string) => void;
    onUpdateStep: (index: number, className: string) => void;
    onRemoveStep: (index: number) => void;
    conditions: Condition[];
    onAddConditionForClass: (className: string) => void;
    onUpdateCondition: (id: string, updates: Partial<Condition>) => void;
    onRemoveCondition: (id: string) => void;
    schema: Record<string, any>;
}

export function PathStepBuilder({
    steps,
    onAddStep,
    onUpdateStep,
    onRemoveStep,
    conditions,
    onAddConditionForClass,
    onUpdateCondition,
    onRemoveCondition,
    schema,
}: PathStepBuilderProps) {
    const { schema: ctxSchema } = useSchema();
    const [conductingClasses, setConductingClasses] = useState<string[]>([]);
    const [classesLoading, setClassesLoading] = useState(true);
    const [addingStep, setAddingStep] = useState(false);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);

    useEffect(() => {
        fetchConductingEquipmentClasses()
            .then((cls) => { setConductingClasses(cls); setClassesLoading(false); })
            .catch(() => {
                setConductingClasses(Object.keys(ctxSchema).sort());
                setClassesLoading(false);
            });
    }, []);

    // Memoize so the array reference stays stable across renders — prevents Mantine
    // Select from resetting its internal search state when the parent re-renders.
    const selectableClasses = useMemo(
        () => conductingClasses.map(c => ({ value: c, label: c })),
        [conductingClasses]
    );

    const conditionsForClass = (cls: string) =>
        conditions.filter(c => c.path.startsWith(cls + '.'));

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
                                        data={selectableClasses}
                                        onChange={(v) => {
                                            if (v) { onUpdateStep(idx, v); setEditingIdx(null); }
                                        }}
                                        searchable
                                        autoFocus
                                        placeholder={classesLoading ? 'Loading…' : 'Select class…'}
                                        disabled={classesLoading}
                                        rightSection={classesLoading ? <Loader size={12} /> : undefined}
                                        style={{ flex: 1 }}
                                        comboboxProps={{ withinPortal: false, zIndex: 2000 }}
                                    />
                                ) : (
                                    <Tooltip
                                        label={step.fixed ? cls : 'Tap to change class'}
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
                            data={selectableClasses}
                            placeholder={classesLoading ? 'Loading…' : 'Select class…'}
                            disabled={classesLoading}
                            rightSection={classesLoading ? <Loader size={12} /> : undefined}
                            searchable
                            autoFocus
                            style={{ flex: 1 }}
                            comboboxProps={{ withinPortal: false, zIndex: 2000 }}
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
