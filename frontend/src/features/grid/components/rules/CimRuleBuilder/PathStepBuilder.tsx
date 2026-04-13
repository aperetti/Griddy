import { useEffect, useState, useMemo, useCallback } from 'react';
import { Group, Badge, Select, ActionIcon, Text, Stack, Tooltip, Paper, Divider, Button, Loader, Box } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Plus, X, Tag, GitBranch } from 'lucide-react';
import { fetchAdjacentClasses } from '../../../../../shared/api';
import { ConditionRow } from './ConditionRow';
import type { PathStep, Condition } from '../../../model/rules';

interface PathStepBuilderProps {
    steps: PathStep[];
    onAddStep: (className: string, parentId?: string) => void;
    onUpdateStep: (index: number, className: string) => void;
    onUpdateStepAttrs: (index: number, attrs: Array<{ attr: string; alias: string }>) => void;
    onRemoveStep: (index: number) => void;
    conditions: Condition[];
    onAddConditionForClass: (className: string, stepId?: string) => void;
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
    isMobile
}: {
    cls: string;
    schema: Record<string, any>;
    attrs: Array<{ attr: string; alias: string }>;
    onChange: (attrs: Array<{ attr: string; alias: string }>) => void;
    isMobile?: boolean;
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
                placeholder={isMobile ? "Add field…" : "Expose attribute…"}
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
    const isMobile = useMediaQuery('(max-width: 768px)');
    const [addingStepTo, setAddingStepTo] = useState<string | null>(null);
    const [editingIdx, setEditingIdx] = useState<number | null>(null);
    const [activeDepth, setActiveDepth] = useState(0);
    const [filterParentId, setFilterParentId] = useState<string | 'all'>('all');

    const indent = isMobile ? 8 : 12;

    // Helper to calculate depth of a step
    const getStepDepth = useCallback((stepId: string | undefined): number => {
        if (!stepId) return 0;
        const step = steps.find(s => s.id === stepId);
        if (!step || !step.parent_id) return 0;
        return 1 + getStepDepth(step.parent_id);
    }, [steps]);

    // Group steps by depth
    const stepsByDepth = useMemo(() => {
        const groups: Record<number, PathStep[]> = {};
        steps.forEach(step => {
            const d = getStepDepth(step.id);
            if (!groups[d]) groups[d] = [];
            groups[d].push(step);
        });
        return groups;
    }, [steps, getStepDepth]);

    const maxDepth = useMemo(() => {
        const depths = Object.keys(stepsByDepth).map(Number);
        return depths.length > 0 ? Math.max(...depths) : 0;
    }, [stepsByDepth]);

    // Reset filter when changing depth
    useEffect(() => {
        setFilterParentId('all');
    }, [activeDepth]);

    // Ensure activeDepth stays within bounds
    useEffect(() => {
        if (activeDepth > maxDepth) setActiveDepth(maxDepth);
    }, [maxDepth, activeDepth]);

    // Parent class for adding a step to a specific parentId
    const addParentClass = addingStepTo ? steps.find(s => s.id === addingStepTo)?.class : null;
    const { classes: addClasses, loading: addLoading } = useAdjacentClasses(addingStepTo ? addParentClass : null);

    // Parent class for editing step at editingIdx = its parent's class
    const editParentId = editingIdx !== null ? steps[editingIdx].parent_id : null;
    const editParentClass = editParentId ? steps.find(s => s.id === editParentId)?.class : null;
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

    const conditionsForStep = useCallback(
        (stepId: string, cls: string) => conditions.filter(c => {
            // If condition has a step_id, it must match
            if (c.step_id) return c.step_id === stepId;
            // Legacy fallback: filter by class name prefix
            return c.path.startsWith(cls + '.');
        }),
        [conditions],
    );

    const renderStepCard = (step: PathStep, depth: number) => {
        const idx = steps.findIndex(s => s.id === step.id);
        const isEditing = !step.fixed && editingIdx === idx;
        const cls = step.class;
        const stepConditions = conditionsForStep(step.id, cls);
        const isAddingHere = addingStepTo === step.id;
        const parentStep = step.parent_id ? steps.find(s => s.id === step.parent_id) : null;

        return (
            <Paper
                key={step.id}
                withBorder={!isMobile || depth === 0}
                p="xs"
                mb="xs"
                style={{
                    borderColor: step.fixed
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(99,179,237,0.3)',
                    background: 'rgba(0,0,0,0.15)',
                    borderRadius: 4,
                }}
            >
                {/* Step header */}
                <Group gap={6} mb={stepConditions.length > 0 ? 6 : 4}>
                    <Stack gap={2} style={{ flex: 1 }}>
                        {isMobile && parentStep && (
                            <Text size="10px" c="dimmed" fw={500} style={{ marginBottom: -2 }}>
                                from {parentStep.class}
                            </Text>
                        )}
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
                                style={{ width: '100%' }}
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
                                    size={isMobile ? "xs" : "sm"}
                                    style={{ cursor: step.fixed ? 'default' : 'pointer', alignSelf: 'flex-start' }}
                                    onClick={() => { if (!step.fixed) setEditingIdx(idx); }}
                                >
                                    {cls || '…'}
                                </Badge>
                            </Tooltip>
                        )}
                    </Stack>

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
                {stepConditions.length > 0 && (
                    <>
                        <Divider my={6} opacity={0.15} />
                        <Stack gap={4}>
                            {stepConditions.map(c => (
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

                {/* Action row */}
                <Divider my={6} opacity={0.1} />
                <Group gap={isMobile ? 4 : 8}>
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        leftSection={<Plus size={10} />}
                        onClick={() => onAddConditionForClass(cls, step.id)}
                    >
                        {isMobile ? "Cond" : "Add condition"}
                    </Button>
                    <Button
                        size="compact-xs"
                        variant="subtle"
                        color="blue"
                        leftSection={<GitBranch size={10} />}
                        onClick={() => setAddingStepTo(step.id)}
                    >
                        {isMobile ? "Fork" : "Fork / Add child"}
                    </Button>
                </Group>

                {/* Add child step dropdown */}
                {isAddingHere && (
                    <Paper withBorder p="xs" mt="xs" style={{ borderColor: 'rgba(99,179,237,0.3)', background: 'rgba(0,0,0,0.15)' }}>
                        <Group gap={6}>
                            <Select
                                size="xs"
                                data={addSelectData}
                                placeholder={addLoading ? 'Loading…' : addClasses.length === 0 ? 'No adjacent' : 'Select class…'}
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
                                        onAddStep(v, step.id);
                                        setAddingStepTo(null);
                                        // Auto-advance on mobile
                                        if (isMobile) setActiveDepth(d => d + 1);
                                    }
                                }}
                            />
                            <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setAddingStepTo(null)} title="Cancel">
                                <X size={12} />
                            </ActionIcon>
                        </Group>
                    </Paper>
                )}

                {/* Tooltip attribute projection — only on non-fixed steps */}
                {!step.fixed && (
                    <TooltipAttrPicker
                        cls={cls}
                        schema={schema}
                        attrs={step.tooltip_attributes ?? []}
                        onChange={(attrs) => onUpdateStepAttrs(idx, attrs)}
                        isMobile={isMobile}
                    />
                )}
            </Paper>
        );
    };

    if (isMobile) {
        const rawCurrentSteps = stepsByDepth[activeDepth] || [];
        
        // Find all unique parents for the current depth to build a branch filter
        const parentsAtDepth = Array.from(new Set(rawCurrentSteps.map(s => s.parent_id).filter(Boolean)))
            .map(pid => {
                const p = steps.find(s => s.id === pid);
                return { id: pid!, class: p?.class || 'Unknown' };
            });

        const currentSteps = filterParentId === 'all' 
            ? rawCurrentSteps 
            : rawCurrentSteps.filter(s => s.parent_id === filterParentId);
        
        return (
            <Stack gap="xs">
                {/* Carousel Navigator */}
                <Paper withBorder p={4} radius="sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Button 
                            variant="subtle" 
                            size="compact-xs" 
                            disabled={activeDepth === 0}
                            onClick={() => setActiveDepth(d => d - 1)}
                        >
                            Back
                        </Button>
                        <Stack gap={0} align="center" style={{ flex: 1 }}>
                            <Text size="xs" fw={700} c="blue">Layer {activeDepth + 1} of {maxDepth + 1}</Text>
                        </Stack>
                        <Button 
                            variant="subtle" 
                            size="compact-xs" 
                            disabled={activeDepth === maxDepth}
                            onClick={() => setActiveDepth(d => d + 1)}
                        >
                            Next
                        </Button>
                    </Group>
                </Paper>

                {/* Branch Filter (only if multiple parents exist at this depth) */}
                {parentsAtDepth.length > 1 && (
                    <Box px={4}>
                        <Text size="10px" c="dimmed" mb={2} fw={600} tt="uppercase">Select Branch:</Text>
                        <Group gap={4} wrap="nowrap" style={{ overflowX: 'auto', paddingBottom: 4 }}>
                            <Badge 
                                variant={filterParentId === 'all' ? 'filled' : 'outline'} 
                                color="blue" 
                                size="xs" 
                                style={{ cursor: 'pointer' }}
                                onClick={() => setFilterParentId('all')}
                            >
                                All Branches
                            </Badge>
                            {parentsAtDepth.map(p => (
                                <Badge 
                                    key={p.id}
                                    variant={filterParentId === p.id ? 'filled' : 'outline'} 
                                    color="gray" 
                                    size="xs" 
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setFilterParentId(p.id)}
                                >
                                    from {p.class}
                                </Badge>
                            ))}
                        </Group>
                    </Box>
                )}

                {/* Slide Content */}
                <Box style={{ minHeight: 120 }}>
                    {currentSteps.map(step => renderStepCard(step, activeDepth))}
                    {currentSteps.length === 0 && (
                        <Text size="xs" c="dimmed" ta="center" py="xl">No steps at this depth</Text>
                    )}
                </Box>
                
                {/* Depth Indicators */}
                <Group justify="center" gap={4}>
                    {Array.from({ length: maxDepth + 1 }).map((_, i) => (
                        <Box
                            key={i}
                            style={{
                                width: activeDepth === i ? 16 : 6,
                                height: 6,
                                borderRadius: 3,
                                background: activeDepth === i ? 'var(--mantine-color-blue-filled)' : 'rgba(255,255,255,0.2)',
                                transition: 'all 0.2s ease'
                            }}
                        />
                    ))}
                </Group>
            </Stack>
        );
    }

    const renderStepTree = (parentId?: string, depth = 0) => {
        const children = steps.filter(s => s.parent_id === parentId || (!parentId && !s.parent_id));
        
        return children.map((step) => (
            <Stack key={step.id} gap={0} ml={depth * indent} style={{ position: 'relative' }}>
                {depth > 0 && (
                    <div style={{
                        position: 'absolute',
                        left: -indent,
                        top: 0,
                        bottom: '50%',
                        width: indent,
                        borderLeft: '1px solid rgba(255,255,255,0.1)',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        borderBottomLeftRadius: 4,
                        pointerEvents: 'none'
                    }} />
                )}
                {renderStepCard(step, depth)}
                {renderStepTree(step.id, depth + 1)}
            </Stack>
        ));
    };

    return (
        <Stack gap={8}>
            {renderStepTree()}
            {steps.length === 0 && (
                 <Group justify="center">
                    <Button
                        size="compact-xs"
                        variant="light"
                        color="blue"
                        leftSection={<Plus size={10} />}
                        onClick={() => setAddingStepTo(undefined)}
                    >
                        Start path
                    </Button>
                </Group>
            )}
        </Stack>
    );
}
