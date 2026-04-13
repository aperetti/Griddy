import { useState, useCallback, useMemo } from 'react';
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
import { genId, type PathStep, type Condition } from '../../../model/rules';

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
        setEntityType,
        setRuleMode,
        setCustomCypher,
        addPathStep,
        updatePathStep,
        updatePathStepAttrs,
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

    // Derive current mode values
    const entityType: 'node' | 'edge' = conditions.entity_type || 'node';
    const ruleMode: 'guided' | 'custom_cypher' = conditions.rule_mode || 'guided';

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
        const currentClasses = current.map(s => s.class).join('->');
        const derivedClasses = derived.map(s => s.class).join('->');

        if (derivedClasses !== currentClasses) {
            handleUpdate({ ...conditions, path_steps: derived });
            setExplorerPathDetected(true);
        }
    }, [entityType, ruleMode, conditions, handleUpdate]);

                        <PathStepBuilder
                            steps={conditions.path_steps || []}
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
