import { memo, useState, useEffect } from 'react';
import { Paper, Title, Text, Group, Badge, ActionIcon, Button, Divider, Loader, Center, Box, Tooltip } from '@mantine/core';
import { BookOpen, X, BarChart3, Activity, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../../../shared/utils/exportUtils';
import type { Node } from '../../../shared/types';
import { fetchAlarms, type Alarm } from '../../../shared/api';
import { AlarmsList } from '../../analytics/components/AlarmsList';

interface Props {
    nodeCount: number;
    selectedNodes: Node[];
    onClearSelection: () => void;
    onViewConsumption: () => void;
    onViewVoltage: () => void;
}

export const GridExplorerPanel = memo(function GridExplorerPanel({
    nodeCount,
    selectedNodes,
    onClearSelection,
    onViewConsumption,
    onViewVoltage
}: Props) {
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const [loadingAlarms, setLoadingAlarms] = useState(false);
    const [copied, setCopied] = useState(false);

    const primaryNode = selectedNodes.length > 0 ? selectedNodes[0] : null;

    useEffect(() => {
        if (primaryNode) {
            setLoadingAlarms(true);
            fetchAlarms(primaryNode.id)
                .then(setAlarms)
                .catch(console.error)
                .finally(() => setLoadingAlarms(false));
        } else {
            setAlarms([]);
        }
    }, [primaryNode]);

    const hasSelection = selectedNodes.length > 0;
    const isMultiSelect = selectedNodes.length > 1;

    const handleCopyDetails = () => {
        if (!primaryNode) return;
        const text = JSON.stringify(primaryNode, null, 2);
        copyToClipboard(text).then(success => {
            if (success) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        });
    };

    return (
        <>
            <Paper p="xl" radius="md" withBorder style={{
                background: 'rgba(26, 27, 30, 0.9)',
                backdropFilter: 'blur(10px)'
            }}>
                <Title order={3} mb="xs">Griddy Explorer</Title>
                <Text size="sm" c="dimmed" mb="md">High-performance grid monitoring & intelligent SCADA analytics.</Text>

                <Group gap="xs">
                    <Badge color="teal" variant="light">DuckDB Backend Ready</Badge>
                    <Badge color="blue" variant="light">Meters: {nodeCount.toLocaleString()}</Badge>
                    <Button
                        component="a"
                        href="/docs"
                        target="_blank"
                        variant="subtle"
                        size="compact-xs"
                        leftSection={<BookOpen size={14} />}
                        color="gray"
                    >
                        View Docs
                    </Button>
                </Group>
            </Paper>

            {hasSelection && (
                <Paper p="xl" radius="md" withBorder style={{
                    background: 'rgba(26, 27, 30, 0.9)',
                    backdropFilter: 'blur(10px)'
                }}>
                    <Group justify="space-between" mb="sm">
                        <Title order={4}>{isMultiSelect ? 'Selected Assets' : 'Selected Asset'}</Title>
                        <ActionIcon variant="subtle" onClick={onClearSelection}><X size={16} /></ActionIcon>
                    </Group>

                    {isMultiSelect ? (
                        <Paper p="xs" withBorder radius="xs" mb="md" style={{ backgroundColor: 'rgba(51, 154, 240, 0.1)' }}>
                            <Text size="sm" fw={500}>{selectedNodes.length} devices selected for aggregate analysis.</Text>
                            <Text size="xs" c="dimmed" mt={4}>Shift+Click to add/remove more assets from the map.</Text>
                        </Paper>
                    ) : (
                        <Paper p="xs" withBorder radius="xs" mb="md" style={{ backgroundColor: 'rgba(0,0,0,0.2)', position: 'relative' }}>
                            <Box style={{ position: 'absolute', top: 4, right: 4 }}>
                                <Tooltip label={copied ? "Copied!" : "Copy Details"} withArrow position="left">
                                    <ActionIcon 
                                        variant="subtle" 
                                        size="xs" 
                                        onClick={handleCopyDetails}
                                        color={copied ? "green" : "gray"}
                                    >
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                    </ActionIcon>
                                </Tooltip>
                            </Box>
                            <Text size="xs" ff="monospace">ID: {primaryNode?.id}</Text>
                            <Text size="xs" ff="monospace">Type: {primaryNode?.type}</Text>
                            <Text size="xs" ff="monospace">Name: {primaryNode?.name}</Text>
                        </Paper>
                    )}

                    <Divider my="md" label={isMultiSelect ? "Primary Asset Health" : "Real-time Health"} labelPosition="center" />

                    {loadingAlarms ? (
                        <Center h={100}>
                            <Loader size="sm" variant="dots" />
                        </Center>
                    ) : (
                        <AlarmsList alarms={alarms} title={isMultiSelect ? `Active Alarms (${primaryNode?.id})` : "Active Node Alarms"} />
                    )}

                    <Divider my="md" />

                    <Group grow gap="xs">
                        <Button size="xs" variant="light" color="blue" leftSection={<BarChart3 size={14} />} onClick={onViewConsumption}>
                            {isMultiSelect ? 'Joint Consumption' : 'Consumption TS'}
                        </Button>
                        <Button size="xs" variant="light" color="cyan" leftSection={<Activity size={14} />} onClick={onViewVoltage}>
                            {isMultiSelect ? 'Joint Voltage Dist' : 'Voltage Dist'}
                        </Button>
                    </Group>
                </Paper>
            )}
        </>
    );
});
