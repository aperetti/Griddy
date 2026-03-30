import { useState, useMemo } from 'react';
import { 
    Button, Group, Text, Stack, 
    Box, Tooltip, 
    Collapse, Select as MantineSelect 
} from '@mantine/core';
import { Sparkles, Info } from 'lucide-react';
import { RuleAssistant } from '../RuleAssistant/RuleAssistant';
import { useCimRuleBuilder } from '../../../hooks/useCimRuleBuilder';
import { ConditionGroup } from './ConditionGroup';
import { useSchema } from '../../../context/SchemaContext';

interface CimRuleBuilderProps {
    value: string | any; // JSON string or parsed object
    onChange: (value: string) => void;
}

export const CimRuleBuilder = ({ value, onChange }: CimRuleBuilderProps) => {
    const { schema } = useSchema();
    const {
        conditions,
        setTargetClass,
        setLogicalOp,
        addCondition,
        addFilledCondition,
        addGroup,
        updateCondition,
        removeNodeItem
    } = useCimRuleBuilder(value, onChange);

    const [showAssistant, setShowAssistant] = useState(false);

    const classOptions = useMemo(() => 
        Object.keys(schema).sort().map(c => ({ value: c, label: c })), 
    [schema]);

    return (
        <Stack gap="xs">
            <Group justify="space-between">
                <MantineSelect
                    label="Target CIM Class"
                    placeholder="e.g. PowerTransformer"
                    data={classOptions}
                    value={conditions.target_class || null}
                    onChange={setTargetClass}
                    searchable
                    clearable
                    size="xs"
                    style={{ flex: 1 }}
                    comboboxProps={{ zIndex: 2000, withinPortal: true }}
                />
                
                <Button 
                    variant="light" 
                    color="grape" 
                    size="xs" 
                    mt={24}
                    leftSection={<Sparkles size={14} />}
                    onClick={() => setShowAssistant(!showAssistant)}
                >
                    Assistant
                </Button>
            </Group>

            <Collapse in={showAssistant}>
                <Box mb="md">
                    <RuleAssistant
                        targetClass={conditions.target_class}
                        onSelectAttribute={(path, val, op, graphPath) => {
                            addFilledCondition(conditions.id, path, val, op || '==', graphPath);
                        }}
                    />
                </Box>
            </Collapse>

            <Box>
                <Group gap="xs" mb={4}>
                    <Text size="xs" fw={700} c="dimmed">MATCH CONDITIONS</Text>
                    <Tooltip label="Rules are matched against CIM objects in the graph. Nested properties (e.g. PowerTransformer.ratedS) are supported.">
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
                />
            </Box>

            <Box mt="xs">
                <Text size="10px" c="dimmed" fs="italic">
                    Tip: Use the Rule Assistant to explore live data and pick attributes by right-clicking.
                </Text>
            </Box>
        </Stack>
    );
};
