import { Box, Group, SegmentedControl, Text, ActionIcon, Stack, Button } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Plus, FolderPlus, Trash2 } from 'lucide-react';
import type { ConditionGroup as IConditionGroup, Condition } from '../../../model/rules';
import { ConditionRow } from './ConditionRow';

interface ConditionGroupProps {
    group: IConditionGroup;
    isRoot?: boolean;
    onUpdateLogicalOp: (id: string, op: 'AND' | 'OR') => void;
    onAddCondition: (groupId: string) => void;
    onAddGroup: (groupId: string) => void;
    onUpdateCondition: (id: string, updates: Partial<Condition>) => void;
    onRemoveNode: (id: string) => void;
    targetClass?: string;
    schema?: Record<string, any>;
}

export const ConditionGroup = ({
    group,
    isRoot = false,
    onUpdateLogicalOp,
    onAddCondition,
    onAddGroup,
    onUpdateCondition,
    onRemoveNode,
    targetClass,
    schema,
}: ConditionGroupProps) => {
    const isMobile = useMediaQuery('(max-width: 768px)');

    return (
        <Box
            p="sm"
            mb="xs"
            style={{
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '4px',
                background: isRoot ? 'transparent' : 'rgba(255,255,255,0.02)'
            }}
        >
            <Stack gap={isMobile ? 'xs' : 0} mb="sm">
                <Group justify="space-between" wrap="wrap" gap="xs">
                    <Group gap="xs">
                        <SegmentedControl
                            value={group.logical_op}
                            onChange={(val) => onUpdateLogicalOp(group.id, val as 'AND' | 'OR')}
                            data={[
                                { label: 'AND', value: 'AND' },
                                { label: 'OR', value: 'OR' }
                            ]}
                            size="xs"
                        />
                        {!isMobile && (
                            <Text size="xs" c="dimmed">Match {group.logical_op === 'AND' ? 'all' : 'any'} conditions</Text>
                        )}
                    </Group>

                    <Group gap={4}>
                        <Button
                            variant="subtle"
                            size="compact-xs"
                            leftSection={<Plus size={12} />}
                            onClick={() => onAddCondition(group.id)}
                        >
                            Condition
                        </Button>
                        <Button
                            variant="subtle"
                            size="compact-xs"
                            leftSection={<FolderPlus size={12} />}
                            onClick={() => onAddGroup(group.id)}
                        >
                            Group
                        </Button>
                        {!isRoot && (
                            <ActionIcon
                                variant="subtle"
                                color="red"
                                size="sm"
                                onClick={() => onRemoveNode(group.id)}
                            >
                                <Trash2 size={14} />
                            </ActionIcon>
                        )}
                    </Group>
                </Group>
            </Stack>

            <Stack gap={0} ml={isRoot ? 0 : 'md'}>
                {group.conditions.map((c) => {
                    const isGroup = 'conditions' in c;
                    
                    if (isGroup) {
                        return (
                            <ConditionGroup
                                key={c.id}
                                group={c as IConditionGroup}
                                onUpdateLogicalOp={onUpdateLogicalOp}
                                onAddCondition={onAddCondition}
                                onAddGroup={onAddGroup}
                                onUpdateCondition={onUpdateCondition}
                                onRemoveNode={onRemoveNode}
                                targetClass={targetClass}
                                schema={schema}
                            />
                        );
                    }

                    return (
                        <ConditionRow
                            key={c.id}
                            condition={c as Condition}
                            handleUpdateCondition={onUpdateCondition}
                            handleRemove={onRemoveNode}
                            targetClass={targetClass}
                            schema={schema}
                        />
                    );
                })}

                {group.conditions.length === 0 && (
                    <Text size="xs" c="dimmed" ta="center" py="sm">Empty group - add a condition</Text>
                )}
            </Stack>
        </Box>
    );
};
