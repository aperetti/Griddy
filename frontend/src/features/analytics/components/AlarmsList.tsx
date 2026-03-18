import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Card, Text, Stack, Group, Tooltip, ActionIcon, ScrollArea, Table, Badge } from '@mantine/core';
import type { Alarm } from '../../../shared/api';
import { copyToClipboard, getDataToCopy } from '../../../shared/utils/exportUtils';

interface AlarmsListProps {
    alarms: Alarm[];
    title?: string;
}

const getSeverityColor = (severity: string) => {
    switch (severity.toUpperCase()) {
        case 'CRITICAL': return 'red';
        case 'WARNING': return 'orange';
        case 'INFO': return 'blue';
        default: return 'gray';
    }
};

export const AlarmsList: React.FC<AlarmsListProps> = ({ alarms, title = "Active Alarms" }) => {
    const [copied, setCopied] = useState(false);

    const handleCopyAlarms = () => {
        if (alarms.length === 0) return;
        const text = getDataToCopy(alarms);
        copyToClipboard(text).then(success => {
            if (success) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        });
    };

    if (alarms.length === 0) {
        return (
            <Card withBorder padding="md">
                <Text size="sm" c="dimmed">No active alarms for this selection.</Text>
            </Card>
        );
    }

    return (
        <Stack gap="xs">
            <Group justify="space-between" align="center">
                <Text size="sm" fw={700}>{title} ({alarms.length})</Text>
                <Tooltip label={copied ? "Copied!" : "Copy Alarms"} withArrow position="left">
                    <ActionIcon 
                        variant="subtle" 
                        size="sm" 
                        onClick={handleCopyAlarms}
                        color={copied ? "green" : "gray"}
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                    </ActionIcon>
                </Tooltip>
            </Group>
            <ScrollArea h={300} offsetScrollbars>
                <Table striped highlightOnHover withTableBorder>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Node</Table.Th>
                            <Table.Th>Code</Table.Th>
                            <Table.Th>Severity</Table.Th>
                            <Table.Th>Timestamp</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {alarms.map((alarm) => (
                            <Table.Tr key={alarm.alarm_id}>
                                <Table.Td><Text size="xs" ff="monospace">{alarm.node_id}</Text></Table.Td>
                                <Table.Td><Text size="xs" fw={500}>{alarm.alarm_code}</Text></Table.Td>
                                <Table.Td>
                                    <Badge size="xs" color={getSeverityColor(alarm.severity)} variant="filled">
                                        {alarm.severity}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="xs" c="dimmed">
                                        {new Date(alarm.timestamp).toLocaleString()}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </ScrollArea>
        </Stack>
    );
};
