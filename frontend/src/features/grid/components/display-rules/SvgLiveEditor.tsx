import React from 'react';
import { 
    Stack, Group, Text, Button, 
    Textarea, Paper, Divider, rem,
    Grid, Box
} from '@mantine/core';
import { Save, Eye, Code } from 'lucide-react';
import { AnalysisWindow } from '../../../analytics/components/AnalysisWindow';
import { InteractiveSvgPreview } from './InteractiveSvgPreview';

interface SvgLiveEditorProps {
    opened: boolean;
    onClose: () => void;
    value: string;
    onChange: (val: string) => void;
    onSave: () => void;
    zIndex?: number;
}

export const SvgLiveEditor: React.FC<SvgLiveEditorProps> = ({ 
    opened, 
    onClose, 
    value, 
    onChange, 
    onSave,
    zIndex = 4000
}) => {
    return (
        <AnalysisWindow 
            isOpen={opened} 
            onClose={onClose} 
            title={
                <Group gap="xs">
                    <Code size={18} />
                    <Text fw={600}>SVG Live Editor</Text>
                </Group>
            }
            initialWidth={850}
            initialHeight={600}
            zIndex={zIndex}
        >
            <Stack gap="md" h="100%">
                <Grid gutter="md" style={{ flex: 1, minHeight: 0 }}>
                    <Grid.Col span={{ base: 12, md: 6 }} style={{ display: 'flex', flexDirection: 'column' }}>
                        <Stack gap={4} h="100%">
                            <Text size="sm" fw={500}>SVG Code</Text>
                            <Textarea
                                placeholder="<svg>...</svg>"
                                value={value}
                                onChange={(e) => onChange(e.currentTarget.value)}
                                h="100%"
                                styles={{ 
                                    root: { flex: 1, display: 'flex', flexDirection: 'column' },
                                    wrapper: { flex: 1, display: 'flex', flexDirection: 'column' },
                                    input: { 
                                        flex: 1, 
                                        fontSize: rem(12), 
                                        fontFamily: 'monospace',
                                        backgroundColor: 'var(--mantine-color-dark-6)'
                                    } 
                                }}
                            />
                        </Stack>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }} style={{ display: 'flex', flexDirection: 'column' }}>
                        <Stack gap={4} h="100%">
                            <Text size="sm" fw={500}>Interactive Preview</Text>
                            <Paper 
                                withBorder 
                                p={0}
                                bg="var(--mantine-color-dark-4)" 
                                style={{ 
                                    flex: 1,
                                    display: 'flex', 
                                    flexDirection: 'column',
                                    overflow: 'hidden',
                                    position: 'relative'
                                }}
                            >
                                {value ? (
                                    <Box style={{ flex: 1, position: 'relative' }}>
                                        <InteractiveSvgPreview value={value} onChange={onChange} />
                                    </Box>
                                ) : (
                                    <Stack align="center" justify="center" gap="xs" c="dimmed" h="100%">
                                        <Eye size={32} opacity={0.3} />
                                        <Text size="xs">Awaiting SVG code...</Text>
                                    </Stack>
                                )}
                            </Paper>
                            <Text size="xs" c="dimmed" mt="xs">
                                Click a group (&lt;g&gt;) to select and transform it. Drag to move, use handles to scale and rotate.
                            </Text>
                        </Stack>
                    </Grid.Col>
                </Grid>

                <Divider />
                <Group justify="flex-end">
                    <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
                    <Button variant="filled" color="blue" leftSection={<Save size={16} />} onClick={onSave}>
                        Apply Changes
                    </Button>
                </Group>
            </Stack>
        </AnalysisWindow>
    );
};
