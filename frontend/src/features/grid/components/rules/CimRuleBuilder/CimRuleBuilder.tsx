import { useState, useCallback } from 'react';
import {
    Button, Group, Stack,
    Box, SegmentedControl, Fieldset,
    Collapse, Badge
} from '@mantine/core';
import { Sparkles, Waypoints } from 'lucide-react';
import { RuleAssistant } from '../RuleAssistant/RuleAssistant';
import { useCimRuleBuilder } from '../../../hooks/useCimRuleBuilder';
import { PathStepBuilder } from './PathStepBuilder';
import { CustomCypherEditor } from './CustomCypherEditor';
import { useSchema } from '../../../context/SchemaContext';
import { genId, type PathStep, type Condition } from '../../../model/rules';

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

    const buildSteps = (clsChain: string[]) => {
        let parentId: string | undefined = undefined;
        return clsChain.map((cls, i) => {
            const id = genId();
            const step: PathStep = { id, class: cls, fixed: i < 2, parent_id: parentId };
            parentId = id;
            return step;
        });
    };

    // Forward: CN first
    if (cnIdx < tIdx) {
        return buildSteps(chain.slice(cnIdx));
    }

    // Reverse: CN comes after Terminal — flip so CN is first
    const reversed = [...chain].reverse();
    const rCnIdx = reversed.indexOf('ConnectivityNode');
    const rTIdx = reversed.indexOf('Terminal');
    if (rCnIdx < rTIdx) {
        return buildSteps(reversed.slice(rCnIdx));
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
        setGeometryType,
        setRuleMode,
        setCustomCypher,
        addPathStep,
        updatePathStep,
        updatePathStepAttrs,
        removePathStep,
        addConditionForClass,
        addFilledCondition,
        updateCondition,
        removeNodeItem,
    } = useCimRuleBuilder(value, onChange);

    const [showAssistant, setShowAssistant] = useState(false);
    const [explorerPathDetected, setExplorerPathDetected] = useState(false);

    // Derive current mode values
    const ruleMode: 'guided' | 'custom_cypher' = conditions.rule_mode || 'guided';
    const geometryType = conditions.geometry_type || 'node';
    // entity_type is kept in sync with geometry_type via setGeometryType
    const entityType: 'node' | 'edge' = geometryType === 'edge' ? 'edge' : 'node';

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
        const currentClasses = current.map(s => s.class).join('->');
        const derivedClasses = derived.map(s => s.class).join('->');

        if (derivedClasses !== currentClasses) {
            handleUpdate({ ...conditions, path_steps: derived });
            setExplorerPathDetected(true);
        }
    }, [entityType, ruleMode, conditions, handleUpdate]);

    return (
        <Stack gap="xs">
            {/* ── Mode selector ────────────────────────────────────── */}
            <SegmentedControl
                size="xs"
                value={ruleMode}
                onChange={(v) => setRuleMode(v as 'guided' | 'custom_cypher')}
                data={[
                    { value: 'guided', label: 'Guided' },
                    { value: 'custom_cypher', label: 'Custom Cypher' },
                ]}
            />

            {/* ── Geometry Filter (Guided Mode only) ────────────────── */}
            {ruleMode === 'guided' && (
                <Fieldset legend="Geometry Filter" variant="default">
                    <SegmentedControl
                        size="xs"
                        fullWidth
                        value={geometryType}
                        onChange={(v) => setGeometryType(v as 'any' | 'node' | 'edge')}
                        data={[
                            { value: 'any', label: 'Any' },
                            { value: 'node', label: 'Node (1 point)' },
                            { value: 'edge', label: 'Edge (>1 point)' },
                        ]}
                    />
                </Fieldset>
            )}

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
                    <Fieldset
                        legend={
                            <Group gap={6}>
                                {entityType === 'node' ? 'Node Path & Conditions' : 'Edge Path & Conditions'}
                                {explorerPathDetected && entityType === 'node' && (
                                    <Badge size="xs" color="teal" variant="light" leftSection={<Waypoints size={10} />}>
                                        from explorer
                                    </Badge>
                                )}
                            </Group>
                        }
                        variant="default"
                    >
                        <PathStepBuilder
                            steps={conditions.path_steps || []}
                            entityType={entityType}
                            onAddStep={addPathStep}
                            onUpdateStep={updatePathStep}
                            onUpdateStepAttrs={updatePathStepAttrs}
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
                                    // Use the stepId if we can find it for the effective target class
                                    const step = conditions.path_steps?.find(s => s.class === effectiveTargetClass && !s.fixed);
                                    addFilledCondition(conditions.id, path, val, op || '==', graphPath, step?.id);
                                }}
                                onNodePathChange={entityType === 'node' ? handleNodePathChange : undefined}
                            />
                        </Box>
                    </Collapse>
                </>
            )}
        </Stack>
    );
};
