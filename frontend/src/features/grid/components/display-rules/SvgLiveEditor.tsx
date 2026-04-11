import React from 'react';
import { 
    Stack, Group, Text, Button, 
    Textarea, Paper, Divider, rem,
    Grid, Box
} from '@mantine/core';
import { Save, Eye, Code } from 'lucide-react';
import { GridModal } from '../../../../features/ui/GridModal';

interface SvgLiveEditorProps {
    opened: boolean;
    onClose: () => void;
    value: string;
    onChange: (val: string) => void;
    onSave: () => void;
}

export const SvgLiveEditor: React.FC<SvgLiveEditorProps> = ({ 
    opened, 
    onClose, 
    value, 
    onChange, 
    onSave 
}) => {
    return (
        <GridModal 
            opened={opened} 
            onClose={onClose} 
            title={
                <Group gap="xs">
                    <Code size={18} />
                    <Text fw={600}>SVG Live Editor</Text>
                </Group>
            }
            size="xl"
            zIndex={4000}
            internal={false}
        >
            <Stack gap="md">
                <Grid gutter="md">
                    <Grid.Col span={{ base: 12, md: 7 }}>
                        <Stack gap={4}>
                            <Text size="sm" fw={500}>SVG Code</Text>
                            <Textarea
                                placeholder="<svg>...</svg>"
                                value={value}
                                onChange={(e) => onChange(e.currentTarget.value)}
                                minRows={15}
                                maxRows={25}
                                styles={{ input: { fontSize: rem(12), fontFamily: 'monospace' } }}
                            />
                        </Stack>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 5 }}>
                        <Stack gap={4}>
                            <Text size="sm" fw={500}>Preview</Text>
                            <Paper 
                                withBorder 
                                p="xl" 
                                bg="var(--mantine-color-dark-4)" 
                                style={{ 
                                    minHeight: rem(300), 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    overflow: 'hidden'
                                }}
                            >
                                {value ? (
                                    <Box 
                                        dangerouslySetInnerHTML={{ __html: value }} 
                                        style={{ 
                                            width: '100%', 
                                            height: '100%', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center'
                                        }}
                                    />
                                ) : (
                                    <Stack align="center" gap="xs" c="dimmed">
                                        <Eye size={32} opacity={0.3} />
                                        <Text size="xs">Awaiting SVG code...</Text>
                                    </Stack>
                                )}
                            </Paper>
                            <Text size="xs" c="dimmed" mt="xs">
                                Note: Only standard SVG tags are supported. Ensure the code is self-contained.
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
        </GridModal>
    );
};
