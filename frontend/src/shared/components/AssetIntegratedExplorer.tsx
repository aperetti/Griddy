import { useState, useEffect } from 'react';
import { Stack, Text, Group, ActionIcon, ScrollArea, NavLink, Badge, Box, Divider, Loader, Alert } from '@mantine/core';
import { Network, Database, ChevronRight, MapPin, Share2, Component, Info } from 'lucide-react';
import { fetchCimNeighbors, fetchCimEquipment, fetchCimNode } from '../../shared/api';

interface AssetIntegratedExplorerProps {
    id: string;
    type: 'Node' | 'Edge';
    onNavigate?: (id: string, type: 'Node' | 'Edge') => void;
    onZoomTo?: (id: string, type: 'Node' | 'Edge') => void;
}

export function AssetIntegratedExplorer({ id, type, onNavigate, onZoomTo }: AssetIntegratedExplorerProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [neighbors, setNeighbors] = useState<any[]>([]);
    const [hierarchy, setHierarchy] = useState<any>(null);
    const [focusData, setFocusData] = useState<any>(null);

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Fetch basic data based on type
                const [basicResult, neighborResult] = await Promise.all([
                    type === 'Node' ? fetchCimNode(id) : fetchCimEquipment(id),
                    fetchCimNeighbors(id)
                ]);

                setFocusData(basicResult);
                setNeighbors(neighborResult?.neighbors || []);
                setHierarchy(basicResult?.hierarchy || null);
            } catch (err: any) {
                console.error('Explorer fetch error:', err);
                setError(err.message || 'Failed to load neighborhood');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [id, type]);

    const handleItemClick = (mrid: string, itemType: string) => {
        const explorerType = (itemType === 'ConnectivityNode' || itemType === 'Node') ? 'Node' : 'Edge';
        if (onNavigate) {
            onNavigate(mrid, explorerType);
        }
    };

    const renderNavGroup = (title: string, items: any[], icon: React.ReactNode, color: string) => {
        if (items.length === 0) return null;

        return (
            <Box mb="md">
                <Group gap="xs" mb={8} px={4}>
                    <Box c={color}>{icon}</Box>
                    <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        {title}
                    </Text>
                    <Badge size="xs" variant="light" color="gray" ml="auto">{items.length}</Badge>
                </Group>
                <Stack gap={2}>
                    {items.map((item) => (
                        <NavLink
                            key={item.id || item.mrid}
                            label={<Text size="xs" fw={500} truncate>{item.name || item.id || item.mrid}</Text>}
                            description={<Text size="10px" c="dimmed">{item.cim_class || (item.type === 'ConnectivityNode' ? 'Bus' : item.type)}</Text>}
                            leftSection={
                                (item.type === 'ConnectivityNode' || item.type === 'Node') ? 
                                <Network size={14} color="#228be6" /> : 
                                <Database size={14} color="#40c057" />
                            }
                            rightSection={
                                <Group gap={4}>
                                    <ActionIcon 
                                        size="sm" 
                                        variant="subtle" 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const t = (item.type === 'ConnectivityNode' || item.type === 'Node') ? 'Node' : 'Edge';
                                            onZoomTo?.(item.id || item.mrid, t);
                                        }}
                                    >
                                        <MapPin size={10} />
                                    </ActionIcon>
                                    <ChevronRight size={12} strokeWidth={3} />
                                </Group>
                            }
                            onClick={() => handleItemClick(item.id || item.mrid, item.type || item.class)}
                            variant="subtle"
                            styles={{
                                root: { 
                                    borderRadius: '6px',
                                    paddingLeft: '8px',
                                    paddingRight: '8px'
                                },
                                label: { lineHeight: 1.2 }
                            }}
                        />
                    ))}
                </Stack>
            </Box>
        );
    };

    // Flatten hierarchy for simpler navigation if it's not too deep
    const renderHierarchyNode = (node: any, depth = 0) => {
        if (!node) return null;

        return (
            <Box key={node.mrid}>
                <NavLink
                    label={<Text size="xs" fw={500} truncate>{node.name || node.class}</Text>}
                    description={<Text size="10px" c="dimmed">{node.class}</Text>}
                    leftSection={<Component size={14} color="#fab005" />}
                    childrenOffset={16}
                    defaultOpened={depth < 1}
                    styles={{
                        root: { borderRadius: '6px' },
                        label: { lineHeight: 1.2 }
                    }}
                >
                    {node.children?.map((child: any) => renderHierarchyNode(child, depth + 1))}
                </NavLink>
            </Box>
        );
    };

    if (loading && !focusData) {
        return (
            <Stack align="center" py="xl" gap="sm">
                <Loader size="sm" color="blue" />
                <Text size="xs" c="dimmed">Traversing Grid Graph...</Text>
            </Stack>
        );
    }

    if (error) {
        return (
            <Alert color="red" variant="light" icon={<Info size={16} />} m="xs">
                {error}
            </Alert>
        );
    }

    return (
        <Stack gap={0}>
            {/* Context/Filter options could go here */}
            
            <ScrollArea scrollbars="y" style={{ height: 'calc(100vh - 350px)' }} offsetScrollbars>
                <Box p="xs">
                    {/* 1. Internal Hierarchy (Components) */}
                    {hierarchy && (
                        <Box mb="xl">
                            <Group gap="xs" mb={8} px={4}>
                                <Component size={14} color="#fab005" />
                                <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                                    Internal Structure
                                </Text>
                            </Group>
                            <Stack gap={2}>
                                {hierarchy.children?.map((child: any) => renderHierarchyNode(child))}
                            </Stack>
                            <Divider my="md" style={{ opacity: 0.1 }} />
                        </Box>
                    )}

                    {/* 2. Topology - Integrated Graph Traversal */}
                    {renderNavGroup("Connectivity", neighbors, <Share2 size={14} />, "blue")}
                    
                    {neighbors.length === 0 && !hierarchy && (
                        <Stack align="center" py="xl" opacity={0.5}>
                            <Share2 size={32} strokeWidth={1} />
                            <Text size="xs">No immediate connections found</Text>
                        </Stack>
                    )}
                </Box>
            </ScrollArea>
        </Stack>
    );
}
