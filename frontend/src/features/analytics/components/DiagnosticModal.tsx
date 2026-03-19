import { useState, useEffect } from 'react';
import { Stack, Text, ScrollArea, Table, Loader, Alert, Badge, Group, Code, Tabs, Box, Button } from '@mantine/core';
import { AlertCircle, Database, Network, List, Share2, MapPin } from 'lucide-react';
import { AnalysisWindow } from './AnalysisWindow';
import { fetchCimEquipment, fetchCimNode } from '../../../shared/api';
import { autoExport, getDataToCopy } from '../../../shared/utils/exportUtils';
import { TopologyTree } from './TopologyTree';

interface DiagnosticModalProps {
    isOpen: boolean;
    onClose: () => void;
    id: string;
    type: 'Node' | 'Edge';
    title: string;
    onZoomTo?: (id: string, type: 'Node' | 'Edge') => void;
}

export function DiagnosticModal({ 
    isOpen, 
    onClose, 
    id: initialId, 
    type: initialType, 
    title: initialTitle,
    onZoomTo
}: DiagnosticModalProps) {
    const [currentId, setCurrentId] = useState(initialId);
    const [currentType, setCurrentType] = useState(initialType);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<string | null>('attributes');

    // Reset internal state when initial props change (e.g. from map selection)
    useEffect(() => {
        setCurrentId(initialId);
        setCurrentType(initialType);
    }, [initialId, initialType]);

    useEffect(() => {
        if (isOpen && currentId) {
            setLoading(true);
            setError(null);
            
            const fetchData = async () => {
                try {
                    const result = currentType === 'Node' 
                        ? await fetchCimNode(currentId)
                        : await fetchCimEquipment(currentId);
                    
                    setData(result);
                } catch (err: any) {
                    setError(err.message || 'Failed to fetch diagnostic data');
                } finally {
                    setLoading(false);
                }
            };

            fetchData();
        }
    }, [isOpen, currentId, currentType]);

    const handleNavigate = (newId: string, newType: 'Node' | 'Edge') => {
        setCurrentId(newId);
        setCurrentType(newType);
        // Usually stay on the same tab for comparison
    };

    const renderValue = (val: any): React.ReactNode => {
        if (val === null || val === undefined) return <Text c="dimmed" size="xs">null</Text>;
        if (typeof val === 'boolean') return <Badge color={val ? 'green' : 'red'} variant="outline" size="xs">{val.toString()}</Badge>;
        if (typeof val === 'number') return <Text size="xs" fw={500}>{val}</Text>;
        if (typeof val === 'string') return <Text size="xs">{val}</Text>;
        
        if (Array.isArray(val)) {
            if (val.length === 0) return <Text c="dimmed" size="xs">[]</Text>;
            return (
                <Stack gap={4}>
                    {val.map((item, i) => (
                        <Box key={i} p={4} style={{ border: '1px solid rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                            {renderValue(item)}
                        </Box>
                    ))}
                </Stack>
            );
        }

        if (typeof val === 'object') {
            return (
                <Table variant="unstyled" verticalSpacing={2} horizontalSpacing={4}>
                    <Table.Tbody>
                        {Object.entries(val).map(([k, v]) => (
                            <Table.Tr key={k}>
                                <Table.Td style={{ width: '100px', verticalAlign: 'top' }}>
                                    <Text size="10px" fw={700} c="dimmed" style={{ textTransform: 'uppercase' }}>{k}</Text>
                                </Table.Td>
                                <Table.Td>
                                    {renderValue(v)}
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            );
        }

        return <Text size="xs">{JSON.stringify(val)}</Text>;
    };

    const handleExport = () => {
        if (!data) return;
        autoExport(data, `diagnostic_${currentId}`);
    };

    const handleCopy = () => {
        if (!data) return "";
        return getDataToCopy(data);
    };

    return (
        <AnalysisWindow
            isOpen={isOpen}
            onClose={onClose}
            title={data?.name ? `Diagnostic: ${data.name}` : initialTitle}
            storageKey={`diagnostic-${initialId}`}
            onExport={handleExport}
            onCopy={handleCopy}
            loading={loading}
        >
            <Stack gap={0} h="100%">
                <Box p="xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Group gap="xs" justify="space-between">
                        <Group gap="xs">
                            {currentType === 'Node' ? <Network size={16} color="#228be6" /> : <Database size={16} color="#40c057" />}
                            <Text fw={600} size="sm">{data?.cim_class || currentType}</Text>
                            <Code color="blue.9" variant="light" style={{ fontSize: '10px' }}>{currentId}</Code>
                        </Group>
                        {onZoomTo && (
                            <Button 
                                variant="subtle" 
                                size="compact-xs" 
                                leftSection={<MapPin size={12} />}
                                onClick={() => onZoomTo(currentId, currentType)}
                                styles={{ label: { fontSize: '10px' } }}
                            >
                                Zoom To
                            </Button>
                        )}
                    </Group>
                </Box>

                <Tabs value={activeTab} onChange={setActiveTab} variant="pills" styles={{ tab: { fontSize: '11px', padding: '4px 12px' } }}>
                    <Tabs.List p={4}>
                        <Tabs.Tab value="attributes" leftSection={<List size={12} />}>Attributes</Tabs.Tab>
                        <Tabs.Tab value="topology" leftSection={<Share2 size={12} />}>Topology</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value="attributes">
                        <ScrollArea h="100%" offsetScrollbars>
                            <Stack gap="md" p="xs">
                                {loading ? (
                                    <Stack align="center" py="xl">
                                        <Loader size="sm" />
                                        <Text size="xs" c="dimmed">Consulting CIM Knowledge Base...</Text>
                                    </Stack>
                                ) : error ? (
                                    <Alert icon={<AlertCircle size={16} />} title="Retrieval Error" color="red" variant="light">
                                        {error}
                                    </Alert>
                                ) : (
                                    <Table withColumnBorders={false} verticalSpacing="xs">
                                        <Table.Tbody>
                                            {data && Object.entries(data).map(([key, value]) => (
                                                <Table.Tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <Table.Td style={{ width: '140px', verticalAlign: 'top' }}>
                                                        <Text fw={700} size="xs" c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                            {key.replace(/_/g, ' ')}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        {renderValue(value)}
                                                    </Table.Td>
                                                </Table.Tr>
                                            ))}
                                        </Table.Tbody>
                                    </Table>
                                )}
                            </Stack>
                        </ScrollArea>
                    </Tabs.Panel>

                    <Tabs.Panel value="topology">
                        <ScrollArea h="calc(100vh - 400px)" offsetScrollbars>
                            <TopologyTree 
                                id={currentId} 
                                onNavigate={handleNavigate} 
                            />
                        </ScrollArea>
                    </Tabs.Panel>
                </Tabs>
            </Stack>
        </AnalysisWindow>
    );
}
