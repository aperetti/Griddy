import { useState, useMemo, useCallback } from 'react';
import {
    Button, Group, Text, Stack,
    Box, Tooltip, SegmentedControl, Fieldset,
    Collapse, Select as MantineSelect, Badge
} from '@mantine/core';
import { Sparkles, Info, GitBranch, Code2, Waypoints } from 'lucide-react';
import { RuleAssistant } from '../RuleAssistant/RuleAssistant';
import { useCimRuleBuilder } from '../../../hooks/useCimRuleBuilder';
import { ConditionGroup } from './ConditionGroup';
import { PathStepBuilder } from './PathStepBuilder';
import { CustomCypherEditor } from './CustomCypherEditor';
import { useSchema } from '../../../context/SchemaContext';
import type { PathStep, Condition } from '../../../model/rules';

// Edge classes for the edge-mode target class selector
const EDGE_CLASSES = [
    'ACLineSegment', 'Breaker', 'LoadBreakSwitch', 'Fuse',
    'Disconnector', 'Recloser', 'PowerTransformer', 'TransformerTank',
];

/**
 * Derive PathStep[] from an ordered CIM class chain navigated in the explorer.
 *
 * Looks for a ConnectivityNode → Terminal pattern (forward or reversed).
 * Returns null if no clear CN-anchored path is detectable.
 *
 * Examples:
 *   ['ConnectivityNode','Terminal','PowerElectronicsConnection']  → 3 steps, first 2 fixed
 *   ['PowerElectronicsConnection','Terminal','ConnectivityNode']  → reversed, detected + flipped
 */
function derivePathStepsFromChain(chain: string[]): PathStep[] | null {
    if (chain.length < 2) return null;

    const cnIdx = chain.indexOf('ConnectivityNode');
    const tIdx = chain.indexOf('Terminal');

    if (cnIdx === -1 || tIdx === -1) return null;

    // Forward: CN first
    if (cnIdx < tIdx) {
        const forward = chain.slice(cnIdx);
        return forward.map((cls, i) => ({ class: cls, fixed: i < 2 }));
    }

    // Reverse: CN comes after Terminal — flip so CN is first
    const reversed = [...chain].reverse();
    const rCnIdx = reversed.indexOf('ConnectivityNode');
    const rTIdx = reversed.indexOf('Terminal');
    if (rCnIdx < rTIdx) {
        const forward = reversed.slice(rCnIdx);
        return forward.map((cls, i) => ({ class: cls, fixed: i < 2 }));
    }

    return null;
}

interface CimRuleBuilderProps {
    value: string | any; // JSON string or parsed object
    onChange: (value: string) => void;
}

export const CimRuleBuilder = ({ value, onChange }: CimRuleBuilderProps) => {
    const { schema } = useSchema();
    const {
        conditions,
        handleUpdate,
        setEntityType,
        setRuleMode,
        setCustomCypher,
        addPathStep,
        updatePathStep,
        removePathStep,
        setTargetClass,
        setLogicalOp,
        addCondition,
        addConditionForClass,
        addFilledCondition,
        addGroup,
        updateCondition,
        removeNodeItem,
    } = useCimRuleBuilder(value, onChange);

    const [showAssistant, setShowAssistant] = useState(false);
    const [explorerPathDetected, setExplorerPathDetected] = useState(false);

    // Derive current mode values — with backward compat for legacy rules
    const entityType: 'node' | 'edge' = conditions.entity_type ||
        (conditions.resolve_via_connectivity_node ? 'node' : 'edge');
    const ruleMode: 'guided' | 'custom_cypher' = conditions.rule_mode || 'guided';

    const isLegacy = !conditions.entity_type && !conditions.path_steps && !conditions.rule_mode;

    const allClasses = useMemo(() =>
        Object.keys(schema).sort().map(c => ({ value: c, label: c })),
    [schema]);

    const edgeClassOptions = EDGE_CLASSES.map(c => ({ value: c, label: c }));

    // The "target class" shown in condition hints — last non-fixed path step or target_class
    const effectiveTargetClass: string | undefined = (() => {
        if (conditions.path_steps?.length) {
            const last = [...conditions.path_steps].reverse().find((s: PathStep) => !s.fixed);
            return last?.class;
        }
        return conditions.target_class;
    })();

    // Called by GraphExplorer whenever user navigates to a node.
    // Derives a CN-anchored PathStep[] from the class chain and updates path_steps.
    const handleNodePathChange = useCallback((cimClassChain: string[]) => {
        if (entityType !== 'node' || ruleMode !== 'guided') return;
        const derived = derivePathStepsFromChain(cimClassChain);
        if (!derived || derived.length < 3) {
            setExplorerPathDetected(false);
            return;
        }
        // Only update if it differs from the current path (avoid infinite loops)
        const current = conditions.path_steps ?? [];
        const derivedJson = JSON.stringify(derived);
        const currentJson = JSON.stringify(current);
        if (derivedJson !== currentJson) {
            handleUpdate({ ...conditions, path_steps: derived });
            setExplorerPathDetected(true);
        }
    }, [entityType, ruleMode, conditions, handleUpdate]);

    return (
        <Stack gap="xs">
            {/* ── Entity type + mode selectors ─────────────────────── */}
            <Group grow gap="xs">
                <SegmentedControl
                    size="xs"
                    value={entityType}
                    onChange={(v) => setEntityType(v as 'node' | 'edge')}
                    data={[
                        { value: 'node', label: <Group gap={4}><GitBranch size={12} />Node</Group> },
                        { value: 'edge', label: <Group gap={4}><Code2 size={12} />Edge</Group> },
                    ]}
                />
                <SegmentedControl
                    size="xs"
                    value={ruleMode}
                    onChange={(v) => setRuleMode(v as 'guided' | 'custom_cypher')}
                    data={[
                        { value: 'guided', label: 'Guided' },
                        { value: 'custom_cypher', label: 'Custom Cypher' },
                    ]}
                />
            </Group>

            {/* ── Custom Cypher mode ────────────────────────────────── */}
            {ruleMode === 'custom_cypher' && (
                <CustomCypherEditor
                    value={conditions.custom_cypher || ''}
                    onChange={setCustomCypher}
                    entityType={entityType}
                />
            )}

            {/* ── Guided mode ───────────────────────────────────────── */}
            {ruleMode === 'guided' && (
                <>
                    {entityType === 'node' && (
                        <Fieldset
                            legend={
                                <Group gap={6}>
                                    Path &amp; Conditions
                                    {explorerPathDetected && (
                                        <Badge size="xs" color="teal" variant="light" leftSection={<Waypoints size={10} />}>
                                            from explorer
                                        </Badge>
                                    )}
                                </Group>
                            }
                            variant="default"
                        >
                            <PathStepBuilder
                                steps={conditions.path_steps || [
                                    { class: 'ConnectivityNode', fixed: true },
                                    { class: 'Terminal', fixed: true },
                                ]}
                                onAddStep={addPathStep}
                                onUpdateStep={updatePathStep}
                                onRemoveStep={(idx: number) => {
                                    removePathStep(idx);
                                    setExplorerPathDetected(false);
                                }}
                                conditions={
                                    conditions.conditions.filter(c => !('conditions' in c)) as Condition[]
                                }
                                onAddConditionForClass={addConditionForClass}
                                onUpdateCondition={updateCondition}
                                onRemoveCondition={removeNodeItem}
                                schema={schema}
                            />
                        </Fieldset>
                    )}

                    {entityType === 'edge' && (
                        <MantineSelect
                            label="Target Edge Class"
                            placeholder="e.g. ACLineSegment"
                            data={edgeClassOptions}
                            value={conditions.target_class || null}
                            onChange={setTargetClass}
                            searchable
                            clearable
                            size="xs"
                            comboboxProps={{ zIndex: 2000, withinPortal: true }}
                        />
                    )}

                    {/* Legacy fallback: target_class dropdown for old rules without entity_type */}
                    {isLegacy && (
                        <MantineSelect
                            label="Target CIM Class"
                            description="Legacy rule — consider recreating with the new path builder"
                            placeholder="e.g. PowerTransformer"
                            data={allClasses}
                            value={conditions.target_class || null}
                            onChange={setTargetClass}
                            searchable
                            clearable
                            size="xs"
                            comboboxProps={{ zIndex: 2000, withinPortal: true }}
                        />
                    )}

                    {/* Rule Assistant */}
                    <Group justify="flex-end">
                        <Button
                            variant="light"
                            color="grape"
                            size="xs"
                            leftSection={<Sparkles size={14} />}
                            onClick={() => setShowAssistant(!showAssistant)}
                        >
                            Assistant
                        </Button>
                    </Group>

                    <Collapse in={showAssistant}>
                        <Box mb="md">
                            <RuleAssistant
                                targetClass={effectiveTargetClass}
                                onSelectAttribute={(path, val, op, graphPath) => {
                                    addFilledCondition(conditions.id, path, val, op || '==', graphPath);
                                }}
                                onNodePathChange={entityType === 'node' ? handleNodePathChange : undefined}
                            />
                        </Box>
                    </Collapse>

                    {/* Legacy rules — single flat ConditionGroup */}
                    {isLegacy && (
                        <Box>
                            <Group gap="xs" mb={4}>
                                <Text size="xs" fw={700} c="dimmed">ATTRIBUTE CONDITIONS</Text>
                            </Group>
                            <ConditionGroup
                                group={conditions}
                                isRoot={true}
                                onUpdateLogicalOp={setLogicalOp}
                                onAddCondition={addCondition}
                                onAddGroup={addGroup}
                                onUpdateCondition={updateCondition}
                                onRemoveNode={removeNodeItem}
                                targetClass={effectiveTargetClass}
                                schema={schema}
                            />
                        </Box>
                    )}

                    {/* Edge conditions */}
                    {entityType === 'edge' && effectiveTargetClass && (
                        <Box>
                            <Group gap="xs" mb={4}>
                                <Text size="xs" fw={700} c="dimmed">ATTRIBUTE CONDITIONS</Text>
                                <Tooltip label="Filter by properties of the edge class.">
                                    <Info size={12} style={{ opacity: 0.5 }} />
                                </Tooltip>
                            </Group>
                            <ConditionGroup
                                group={conditions}
                                isRoot={true}
                                onUpdateLogicalOp={setLogicalOp}
                                onAddCondition={addCondition}
                                onAddGroup={addGroup}
                                onUpdateCondition={updateCondition}
                                onRemoveNode={removeNodeItem}
                                targetClass={effectiveTargetClass}
                                schema={schema}
                            />
                        </Box>
                    )}
                </>
            )}
        </Stack>
    );
};
