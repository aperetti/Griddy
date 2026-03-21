import { memo, useState, useEffect } from 'react';
import { Paper, Title, Text, Group, Badge, ActionIcon, Button, Divider, Loader, Center, Box, Tooltip, Tabs, ScrollArea, Table, Stack } from '@mantine/core';
import { BookOpen, X, BarChart3, Activity, Copy, Check, Info, Share2, AlertCircle } from 'lucide-react';
import { copyToClipboard } from '../../../shared/utils/exportUtils';
import type { Node } from '../../../shared/types';
import { fetchAlarms, fetchCimEquipment, fetchCimNode, type Alarm } from '../../../shared/api';
import { AlarmsList } from '../../analytics/components/AlarmsList';
import { AssetIntegratedExplorer } from '../../analytics/components/AssetIntegratedExplorer';

interface GridExplorerPanelProps {
    selectedNodes: Node[];
    onClearSelection: () => void;
    onViewConsumption: () => void;
    onViewVoltage: () => void;
    onNavigate?: (id: string, type: 'Node' | 'Edge') => void;
    onShowDiagnostic?: (id: string, type: 'Node' | 'Edge') => void;
}

export const GridExplorerPanel = memo(function GridExplorerPanel({
    selectedNodes,
    onClearSelection,
    onViewConsumption,
    onViewVoltage,
    onNavigate,
    onShowDiagnostic
}: GridExplorerPanelProps) {
    const nodeCount = selectedNodes.length;
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const [loadingAlarms, setLoadingAlarms] = useState(false);
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<string | null>('explorer');
    const [cimData, setCimData] = useState<any>(null);
    const [loadingCim, setLoadingCim] = useState(false);

    const primaryNode = selectedNodes.length > 0 ? selectedNodes[0] : null;

    useEffect(() => {
        if (primaryNode) {
            setLoadingAlarms(true);
            setLoadingCim(true);
            
            const nodeType = (primaryNode.id.includes('_') || primaryNode.id.length > 20) ? 'Edge' : 'Node';
            
            Promise.all([
                fetchAlarms(primaryNode.id),
                nodeType === 'Node' ? fetchCimNode(primaryNode.id) : fetchCimEquipment(primaryNode.id)
            ]).then(([alarmsRes, cimRes]) => {
                setAlarms(alarmsRes);
                setCimData(cimRes);
            })
            .catch(console.error)
            .finally(() => {
                setLoadingAlarms(false);
                setLoadingCim(false);
            });
        } else {
            setAlarms([]);
            setCimData(null);
            setActiveTab('explorer');
        }
    }, [primaryNode]);

    const hasSelection = selectedNodes.length > 0;
    const isMultiSelect = selectedNodes.length > 1;

    const handleCopyDetails = () => {
        if (!primaryNode) return;
        const text = JSON.stringify(cimData || primaryNode, null, 2);
        copyToClipboard(text).then(success => {
            if (success) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        });
    };

    const renderAttributeValue = (val: any): React.ReactNode => {
        if (val === null || val === undefined) return <Text c="dimmed" size="xs">null</Text>;
        if (typeof val === 'boolean') return <Badge color={val ? 'green' : 'red'} variant="outline" size="xs">{val.toString()}</Badge>;
        if (typeof val === 'number') return <Text size="xs" fw={500}>{val}</Text>;
        if (typeof val === 'string') return <Text size="xs" style={{ wordBreak: 'break-all' }}>{val}</Text>;
        if (typeof val === 'object') return <Text size="xs" c="dimmed">[Object]</Text>;
        return <Text size="xs">{JSON.stringify(val)}</Text>;
    };

    return (
        <Stack gap="md">
            <Paper p="md" radius="md" withBorder style={{
                background: 'rgba(26, 27, 30, 0.9)',
                backdropFilter: 'blur(10px)'
            }}>
                <Group justify="space-between" mb="xs">
                    <Title order={3}>Griddy Explorer</Title>
                    <Group gap="xs">
                        <Tooltip label="View Docs">
                            <ActionIcon component="a" href="/docs" target="_blank" variant="subtle" color="gray">
                                <BookOpen size={16} />
                            </ActionIcon>
                        </Tooltip>
                        {hasSelection && (
                            <ActionIcon variant="subtle" color="gray" onClick={onClearSelection}>
                                <X size={16} />
                            </ActionIcon>
                        )}
                    </Group>
                </Group>
                
                <Group gap="xs">
                    <Badge color="blue" variant="light" size="sm">Meters: {nodeCount.toLocaleString()}</Badge>
                    <Badge color="teal" variant="light" size="sm">DuckDB Ready</Badge>
                </Group>
            </Paper>

            {hasSelection && (
                <Paper radius="md" withBorder style={{
                    background: 'rgba(26, 27, 30, 0.9)',
                    backdropFilter: 'blur(10px)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: 'calc(100vh - 200px)'
                }}>
                    <Box p="md" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <Group justify="space-between" mb={4}>
                            <Title order={4} style={{ maxWidth: '65%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {isMultiSelect ? `${selectedNodes.length} Assets Selected` : (cimData?.name || primaryNode?.name || 'Asset')}
                            </Title>
                            <Group gap={4}>
                                {!isMultiSelect && onShowDiagnostic && (
                                    <Tooltip label="Full Diagnostic" withArrow>
                                        <ActionIcon 
                                            variant="subtle" 
                                            size="sm" 
                                            onClick={() => onShowDiagnostic(primaryNode!.id, (primaryNode!.type === 'ConnectivityNode' ? 'Node' : 'Edge'))}
                                            color="blue"
                                        >
                                            <Activity size={14} />
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                                {!isMultiSelect && (
                                    <Tooltip label={copied ? "Copied!" : "Copy JSON"} withArrow>
                                        <ActionIcon 
                                            variant="subtle" 
                                            size="sm" 
                                            onClick={handleCopyDetails}
                                            color={copied ? "green" : "gray"}
                                        >
                                            {copied ? <Check size={14} /> : <Copy size={14} />}
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </Group>
                        </Group>
                        {!isMultiSelect && (
                            <Group gap={6}>
                                <Text size="11px" ff="monospace" c="dimmed" truncate style={{ maxWidth: '180px' }}>{primaryNode?.id}</Text>
                                <Badge size="xs" variant="outline" color="blue">{cimData?.cim_class || primaryNode?.type}</Badge>
                            </Group>
                        )}
                    </Box>

                    <Tabs value={activeTab} onChange={setActiveTab} variant="pills" styles={{ 
                        root: { display: 'flex', flexDirection: 'column', flex: 1 },
                        list: { padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' },
                        tab: { fontSize: '11px', padding: '4px 12px' },
                        panel: { flex: 1, overflow: 'hidden' }
                    }}>
                        <Tabs.List>
                            <Tabs.Tab value="explorer" leftSection={<Share2 size={12} />}>Explorer</Tabs.Tab>
                            <Tabs.Tab value="details" leftSection={<Info size={12} />}>Details</Tabs.Tab>
                            <Tabs.Tab value="alarms" leftSection={<AlertCircle size={12} />}>
                                Alarms {alarms.length > 0 && <Badge size="xs" color="red" ml={4}>{alarms.length}</Badge>}
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="explorer">
                            {!isMultiSelect && primaryNode ? (
                                <AssetIntegratedExplorer 
                                    id={primaryNode.id} 
                                    type={(primaryNode.id.includes('_') || primaryNode.id.length > 20) ? 'Edge' : 'Node'}
                                    onNavigate={onNavigate}
                                    onZoomTo={onNavigate} // Use onNavigate for zoom too for now
                                />
                            ) : (
                                <Center p="xl" style={{ flexDirection: 'column' }}>
                                    <Box mb="sm">
                                        <Share2 size={32} opacity={0.2} />
                                    </Box>
                                    <Text size="xs" c="dimmed" ta="center">Multiple assets selected. Selection refinement required for graph traversal.</Text>
                                </Center>
                            )}
                        </Tabs.Panel>

                        <Tabs.Panel value="details">
                            <ScrollArea h="400px" p="xs">
                                {loadingCim ? (
                                    <Center py="xl"><Loader size="xs" /></Center>
                                ) : cimData ? (
                                    <Table variant="unstyled" verticalSpacing={4}>
                                        <Table.Tbody>
                                            {Object.entries(cimData).filter(([k]) => k !== 'hierarchy' && k !== 'transformerends').map(([key, value]) => (
                                                <Table.Tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                    <Table.Td style={{ width: '120px', verticalAlign: 'top' }}>
                                                        <Text size="10px" fw={700} c="dimmed" style={{ textTransform: 'uppercase' }}>{key.replace(/_/g, ' ')}</Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        {renderAttributeValue(value)}
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                ) : (
                                    <Text size="xs" c="dimmed" p="md">No detailed CIM metadata available.</Text>
                                )}
                            </ScrollArea>
                        </Tabs.Panel>

                        <Tabs.Panel value="alarms">
                            <Box p="xs">
                                {loadingAlarms ? (
                                    <Center py="xl"><Loader size="xs" /></Center>
                                ) : (
                                    <AlarmsList alarms={alarms} />
                                )}
                            </Box>
                        </Tabs.Panel>
                    </Tabs>

                    <Divider style={{ opacity: 0.05 }} />

                    <Box p="md">
                        <Group grow gap="xs">
                            <Button size="xs" variant="light" color="blue" leftSection={<BarChart3 size={14} />} onClick={onViewConsumption}>
                                Consumption
                            </Button>
                            <Button size="xs" variant="light" color="cyan" leftSection={<Activity size={14} />} onClick={onViewVoltage}>
                                Voltage
                            </Button>
                        </Group>
                    </Box>
                </Paper>
            )}
        </Stack>
    );
});
