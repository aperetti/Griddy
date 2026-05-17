import React, { Fragment } from 'react';
import { Table, Box, Text, Group, ActionIcon, Badge, rem } from '@mantine/core';
import { ListOrdered, Copy, Trash2, CheckCircle2, CircleDashed } from 'lucide-react';
import { RuleIconPreview } from './RuleIconPreview';
import { type DisplayRule } from '../../../../shared/api';
import { type DisplayRuleGroup } from '../../model/rules';

interface RuleTableProps {
    groups: DisplayRuleGroup[];
    isMobile: boolean;
    onEditRule: (rule: DisplayRule) => void;
    onDuplicateRule: (ruleId: number) => void;
    onDeleteRule: (rule: DisplayRule) => void;
}

export const RuleTable: React.FC<RuleTableProps> = ({
    groups,
    isMobile,
    onEditRule,
    onDuplicateRule,
    onDeleteRule
}) => {
    return (
        <Box style={{ overflowX: 'auto' }}>
            <Table verticalSpacing="xs">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th style={{ width: rem(40) }}>Icon</Table.Th>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Priority</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th style={{ width: rem(120) }}>Actions</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {groups.map((group, gIdx) => (
                        <Fragment key={gIdx}>
                            {group.groupName && (
                                <Table.Tr bg="rgba(255, 255, 255, 0.05)">
                                    <Table.Td colSpan={5} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                        <Text size="xs" fw={700} c="blue" tt="uppercase" lts="1px">{group.groupName}</Text>
                                    </Table.Td>
                                </Table.Tr>
                            )}
                            {group.rules.map((rule) => (
                                <Table.Tr 
                                    key={rule.id}
                                    onClick={() => onEditRule(rule)}
                                    style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <Table.Td>
                                        <RuleIconPreview 
                                            icon={rule.config?.icon} 
                                            color={rule.config?.color_hex} 
                                            size={20}
                                        />
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={500}>{rule.name}</Text>
                                    </Table.Td>
                                    <Table.Td><Text size="xs">{rule.priority}</Text></Table.Td>
                                    <Table.Td>
                                        {isMobile ? (
                                            rule.enabled
                                                ? <CheckCircle2 size={16} color="var(--mantine-color-green-5)" />
                                                : <CircleDashed size={16} color="var(--mantine-color-gray-5)" />
                                        ) : (
                                            <Badge color={rule.enabled ? 'green' : 'gray'} size="xs" variant="dot">
                                                {rule.enabled ? 'Active' : 'Disabled'}
                                            </Badge>
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap={8}>
                                            <ActionIcon variant="subtle" color="blue" size="sm" onClick={(e) => { e.stopPropagation(); onEditRule(rule); }}><ListOrdered size={14} /></ActionIcon>
                                            <ActionIcon variant="subtle" color="blue" size="sm" onClick={(e) => { e.stopPropagation(); onDuplicateRule(rule.id); }}><Copy size={14} /></ActionIcon>
                                            <ActionIcon 
                                                variant="subtle" 
                                                color="red" 
                                                size="sm" 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteRule(rule);
                                                }}
                                            >
                                                <Trash2 size={14} />
                                            </ActionIcon>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Fragment>
                    ))}
                </Table.Tbody>
            </Table>
        </Box>
    );
};
