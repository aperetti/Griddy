import React from 'react';
import { 
    Stack, Group, Text, Button, 
    Paper, Divider, rem,
    Box
} from '@mantine/core';
import { Save, Eye, Code as CodeIcon } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { AnalysisWindow } from '../../../analytics/components/AnalysisWindow';
import { InteractiveSvgPreview } from './InteractiveSvgPreview';

interface SvgLiveEditorProps {
    opened: boolean;
    onClose: () => void;
    value: string;
    onChange: (val: string) => void;
    onSave: () => void;
    baseSvg?: string;
    baseColor?: string;
    zIndex?: number;
}

export const SvgLiveEditor: React.FC<SvgLiveEditorProps> = ({ 
    opened, 
    onClose, 
    value, 
    onChange, 
    onSave,
    baseSvg,
    baseColor,
    zIndex = 4000
}) => {
    return (
        <AnalysisWindow 
            isOpen={opened} 
            onClose={onClose} 
            storageKey="svg-live-editor"
            title={
                <Group gap="xs">
                    <CodeIcon size={18} />
                    <Text fw={600}>SVG Live Editor</Text>
                </Group>
            }
            initialWidth={850}
            initialHeight={750}
            zIndex={zIndex}
            contentStyle={{ 
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden',
                height: '100%',
                padding: '15px' 
            }}
        >
            <Stack gap="md" style={{ flex: 1, overflow: 'hidden', height: '100%' }}>
                <Box style={{ flex: 1, display: 'flex', gap: rem(16), minHeight: 0 }}>
                    <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <Stack gap={4} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                            <Text size="sm" fw={500}>SVG Code</Text>
                            <Box 
                                style={{ 
                                    flex: 1, 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    minHeight: '200px',
                                    height: '100%',
                                    borderRadius: 'var(--mantine-radius-sm)',
                                    border: '1px solid var(--mantine-color-dark-4)',
                                    overflow: 'hidden',
                                    backgroundColor: '#1A1B1E'
                                }}
                            >
                                <Editor
                                    height="100%"
                                    width="100%"
                                    language="xml"
                                    theme="vs-dark"
                                    value={value}
                                    onChange={(val) => onChange(val || '')}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        lineHeight: 22,
                                        lineNumbers: 'on',
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                        wordWrap: 'on',
                                        padding: { top: 10, bottom: 10 },
                                        guides: {
                                            indentation: true
                                        },
                                        renderLineHighlight: 'all',
                                    }}
                                />
                            </Box>
                        </Stack>
                    </Box>

                    <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <Stack gap={4} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
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
                                        <InteractiveSvgPreview 
                                            value={value} 
                                            onChange={onChange}
                                            baseSvg={baseSvg}
                                            baseColor={baseColor}
                                        />
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
                    </Box>
                </Box>

                <Divider />
                <Group justify="flex-end" style={{ flexShrink: 0 }}>
                    <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
                    <Button variant="filled" color="blue" leftSection={<Save size={16} />} onClick={onSave}>
                        Apply Changes
                    </Button>
                </Group>
            </Stack>
        </AnalysisWindow>
    );
};
