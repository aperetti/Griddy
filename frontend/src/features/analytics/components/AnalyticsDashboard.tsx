import { SimpleGrid, Box, Title, Group, ActionIcon, Paper, Text } from '@mantine/core';
import { LayoutGrid, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

interface AnalyticsDashboardProps {
    columns: number;
    children: ReactNode;
    onAddWidget?: () => void;
}

/**
 * AnalyticsDashboard organizes analysis windows into a structured layout
 * instead of floating them over the map.
 */
export function AnalyticsDashboard({ columns, children, onAddWidget }: AnalyticsDashboardProps) {
    return (
        <Box 
            p="md" 
            style={{ 
                width: '100%', 
                height: '100%', 
                overflowY: 'auto',
                background: 'rgba(16, 17, 19, 0.4)',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.05)'
            }}
        >
            <Group justify="space-between" mb="lg">
                <Group gap="xs">
                    <LayoutGrid size={20} color="#339af0" />
                    <Title order={3}>Analytics Dashboard</Title>
                </Group>
                
                {onAddWidget && (
                    <ActionIcon 
                        variant="filled" 
                        color="blue" 
                        size="lg" 
                        radius="md" 
                        onClick={onAddWidget}
                        title="Add analytic view"
                    >
                        <Plus size={20} />
                    </ActionIcon>
                )}
            </Group>

            {/* Dashboard Grid */}
            <SimpleGrid 
                cols={{ base: 1, sm: Math.min(2, columns), md: columns }} 
                spacing="md" 
                verticalSpacing="md"
            >
                {children}
            </SimpleGrid>

            {/* Empty State */}
            {(!children || (Array.isArray(children) && children.length === 0)) && (
                <Paper 
                    withBorder 
                    p="xl" 
                    style={{ 
                        borderStyle: 'dashed', 
                        background: 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '300px',
                        opacity: 0.6
                    }}
                >
                    <LayoutGrid size={48} strokeWidth={1} style={{ marginBottom: '16px' }} />
                    <Text size="lg" fw={500}>No active widgets</Text>
                    <Text size="sm" c="dimmed">Select nodes on the map and use the toolbar to add analytic views.</Text>
                </Paper>
            )}
        </Box>
    );
}
