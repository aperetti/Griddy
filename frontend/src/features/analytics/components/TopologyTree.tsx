import { useState, useEffect } from 'react';
import { Stack, Text, Group, Loader, Box, Badge, NavLink, Paper } from '@mantine/core';
import { Database, CircleDot, Network } from 'lucide-react';
import { fetchCimNeighbors } from '../../../shared/api';

interface TopologyTreeProps {
    id: string;
    onNavigate: (id: string, type: 'Node' | 'Edge') => void;
}

export function TopologyTree({ id, onNavigate }: TopologyTreeProps) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const result = await fetchCimNeighbors(id);
                setData(result);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    if (loading) {
        return (
            <Group py="md" justify="center">
                <Loader size="xs" />
                <Text size="xs" c="dimmed">Traversing topology...</Text>
            </Group>
        );
    }

    if (!data || !data.neighbors || data.neighbors.length === 0) {
        return <Text size="xs" c="dimmed" p="md">No adjacent CIM entities found.</Text>;
    }

    return (
        <Stack gap="xs" p="xs">
            <Paper withBorder p="xs" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <Group justify="space-between" mb="xs">
                    <Group gap="xs">
                        <Network size={14} color="#228be6" />
                        <Text size="xs" fw={700}>NEIGHBORHOOD EXPLORER</Text>
                    </Group>
                    <Badge size="xs" variant="light">{data.neighbors.length} connections</Badge>
                </Group>
                
                <Box>
                    {data.neighbors.map((neighbor: any) => (
                        <NavLink
                            key={neighbor.id}
                            label={neighbor.name}
                            description={neighbor.id}
                            leftSection={
                                neighbor.type === 'ConnectivityNode' 
                                    ? <CircleDot size={14} color="#228be6" /> 
                                    : <Database size={14} color="#40c057" />
                            }
                            rightSection={
                                neighbor.type === 'Equipment' && neighbor.cim_class ? (
                                    <Badge size="xs" variant="filled" color="dark.4" styles={{ label: { fontSize: '8px' } }}>
                                        {neighbor.cim_class}
                                    </Badge>
                                ) : null
                            }
                            onClick={() => onNavigate(neighbor.id, neighbor.type === 'Equipment' ? 'Edge' : 'Node')}
                            styles={{
                                root: { padding: '4px 8px', borderRadius: '4px' },
                                label: { fontSize: '12px', fontWeight: 600 },
                                description: { fontSize: '10px', opacity: 0.6 }
                            }}
                        />
                    ))}
                </Box>
            </Paper>
            <Text size="10px" c="dimmed" px="xs">Click any neighbor to inspect its CIM attributes.</Text>
        </Stack>
    );
}
