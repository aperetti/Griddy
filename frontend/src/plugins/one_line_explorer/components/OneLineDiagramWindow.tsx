import { Box, Stack, Loader, Text, Alert, Badge, Group } from '@mantine/core';
import { AlertTriangle } from 'lucide-react';
import { AnalysisWindow } from '@plugin-sdk';
import { useOneLineDiagram } from '../hooks/useOneLineDiagram';
import { OneLineDiagramSvg } from './OneLineDiagramSvg';
import type { AnalysisInstance } from '../../../hooks/useAnalyticsState';

interface OneLineDiagramWindowProps {
    instance: AnalysisInstance;
    onClose: (id: string) => void;
    onMinimize: (id: string) => void;
    onFocus: (id: string) => void;
}

export const OneLineDiagramWindow: React.FC<OneLineDiagramWindowProps> = ({
    instance,
    onClose,
    onMinimize,
    onFocus,
}) => {
    const nodeId = instance.nodeIds?.[0] ?? null;
    const { layout, loading, error } = useOneLineDiagram(nodeId);

    return (
        <AnalysisWindow
            isOpen={true}
            title={instance.nodeName || 'One-Line Diagram'}
            storageKey={`one-line-explorer-${instance.id}`}
            onClose={() => onClose(instance.id)}
            onMinimize={() => onMinimize(instance.id)}
            onFocus={() => onFocus(instance.id)}
            zIndex={instance.zIndex}
            contentStyle={{ overflow: 'hidden', padding: 0 }}
        >
            <Stack style={{ height: '100%', flex: 1, minHeight: 0 }} gap={0}>
                {/* Diagram body */}
                <Box style={{ flex: 1, position: 'relative', minHeight: 0 }}>
                    {loading && (
                        <Stack align="center" justify="center" h="100%" gap="xs" style={{ opacity: 0.6 }}>
                            <Loader size="sm" color="blue" />
                            <Text size="xs" c="dimmed">Building one-line diagram…</Text>
                        </Stack>
                    )}

                    {error && !loading && (
                        <Box p="md">
                            <Alert icon={<AlertTriangle size={14} />} color="red" variant="light">
                                <Text size="xs">{error}</Text>
                            </Alert>
                        </Box>
                    )}

                    {!loading && !error && layout && layout.nodes.length > 0 && (
                        <OneLineDiagramSvg layout={layout} />
                    )}

                    {!loading && !error && (!layout || layout.nodes.length === 0) && nodeId && (
                        <Stack align="center" justify="center" h="100%" gap="xs" style={{ opacity: 0.5 }}>
                            <Text size="xs" c="dimmed">No connectivity data found for this node.</Text>
                        </Stack>
                    )}
                </Box>

                {/* Legend */}
                <Box
                    px="xs"
                    py={4}
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}
                >
                    <Group gap={6} wrap="wrap">
                        <Badge color="yellow" size="xs" variant="dot">Selected bus</Badge>
                        <Badge color="cyan" size="xs" variant="dot">Upstream path</Badge>
                        <Badge color="orange" size="xs" variant="dot">Substation bus</Badge>
                        <Badge color="blue" size="xs" variant="dot">Bus</Badge>
                        <Badge color="orange" size="xs" variant="outline">Transformer ○○</Badge>
                        <Badge color="green" size="xs" variant="outline">Breaker ■</Badge>
                        <Badge color="red" size="xs" variant="outline">Open switch</Badge>
                    </Group>
                </Box>
            </Stack>
        </AnalysisWindow>
    );
};
