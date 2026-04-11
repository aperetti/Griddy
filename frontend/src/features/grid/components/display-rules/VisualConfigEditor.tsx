import {
    Stack, Group, Text, TextInput, NumberInput,
    Select, Grid, Paper, Tooltip, ActionIcon,
    FileButton, ColorInput, Fieldset, Button
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { 
    Upload, Maximize2, 
    Circle as CircleIcon, Square as SquareIcon, Triangle as TriangleIcon, Star 
} from 'lucide-react';

interface VisualConfigEditorProps {
    config: {
        visual_type?: string;
        color_hex?: string;
        size?: number;
        icon?: string;
        svg?: string;
    };
    onChange: (val: any) => void;
    onOpenLiveEditor?: (initialValue: string, onSave: (val: string) => void) => void;
    legend?: string;
}

const templates = [
    { name: 'Circle', icon: <CircleIcon size={14} />, content: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n  <circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="4" fill="none" />\n</svg>' },
    { name: 'Square', icon: <SquareIcon size={14} />, content: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n  <rect x="10" y="10" width="80" height="80" stroke="currentColor" stroke-width="4" fill="none" />\n</svg>' },
    { name: 'Triangle', icon: <TriangleIcon size={14} />, content: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n  <path d="M50 10 L90 90 L10 90 Z" stroke="currentColor" stroke-width="4" fill="none" />\n</svg>' },
    { name: 'Diamond', icon: <Star size={14} />, content: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n  <path d="M50 10 L90 50 L50 90 L10 50 Z" stroke="currentColor" stroke-width="4" fill="none" />\n</svg>' }
];

const SVGPreview = ({ content, color }: { content: string; color?: string }) => {
    const bg = '#141517';
    const checkerColor = 'rgba(255,255,255,0.03)';
    
    if (!content || !content.includes('<svg')) {
        return (
            <Paper 
                withBorder 
                p="md" 
                style={{ 
                    height: 120, 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    backgroundColor: bg
                }}
            >
                <Text size="xs" c="dimmed">No SVG Content</Text>
            </Paper>
        );
    }

    let previewContent = content;
    if (!content.includes('width=') && !content.includes('height=')) {
        previewContent = content.replace('<svg', '<svg width="100%" height="100%"');
    }

    return (
        <Paper 
            withBorder 
            p="md" 
            style={{ 
                height: 120, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                overflow: 'hidden',
                backgroundColor: bg,
                backgroundImage: `
                    linear-gradient(45deg, ${checkerColor} 25%, transparent 25%),
                    linear-gradient(-45deg, ${checkerColor} 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, ${checkerColor} 75%),
                    linear-gradient(-45deg, transparent 75%, ${checkerColor} 75%)
                `,
                backgroundSize: '20px 20px',
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
            }}
        >
            <div 
                style={{ 
                    width: 80, 
                    height: 80, 
                    color: color || '#339AF0',
                    filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))'
                }}
                dangerouslySetInnerHTML={{ __html: previewContent }} 
            />
        </Paper>
    );
};

export const VisualConfigEditor: React.FC<VisualConfigEditorProps> = ({
    config,
    onChange,
    onOpenLiveEditor,
    legend = "Visual Appearance"
}) => {
    const isMobile = useMediaQuery('(max-width: 768px)');

    // Conditional symbols use 'svg', base rules use 'icon'.
    // Use whichever key is present in the current config.
    const svgKey = ('svg' in config) ? 'svg' : 'icon';
    const currentSvg = config.svg || config.icon || '';

    const handleFileUpload = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (content.includes('<svg')) {
                onChange({ [svgKey]: content });
            }
        };
        reader.readAsText(file);
    };

    return (
        <Fieldset legend={legend} variant="default">
            <Grid gutter="md">
                <Grid.Col span={{ base: 12, sm: 4 }}>
                    <Select
                        label="Visual Type"
                        value={config.visual_type || 'Custom'}
                        onChange={(v) => onChange({ visual_type: v })}
                        data={['Circle', 'Square', 'Triangle', 'Custom']}
                        comboboxProps={{ zIndex: 2000, withinPortal: true }}
                    />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                    <ColorInput
                        label="Base Color"
                        value={config.color_hex || ''}
                        onChange={(v) => onChange({ color_hex: v })}
                        popoverProps={{ zIndex: 2000, withinPortal: true }}
                    />
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 4 }}>
                    <NumberInput
                        label="Scaling Factor"
                        step={0.1}
                        decimalScale={2}
                        value={config.size || 1.0}
                        onChange={(v) => onChange({ size: Number(v) })}
                    />
                </Grid.Col>

                <Grid.Col span={12}>
                    <Stack gap="xs">
                        <Text size="sm" fw={500}>Base Symbol (SVG)</Text>
                        <Grid>
                            <Grid.Col span={{ base: 12, md: 8 }}>
                                <Stack gap="xs">
                                    <Group gap="xs" wrap="nowrap">
                                        <TextInput
                                            style={{ flex: 1, fontFamily: 'monospace' }}
                                            placeholder="<svg>...</svg> content"
                                            value={currentSvg}
                                            onChange={(e) => onChange({ [svgKey]: e.currentTarget.value })}
                                        />
                                        <FileButton onChange={handleFileUpload} accept="image/svg+xml">
                                            {(props) => (
                                                <Tooltip label="Upload SVG">
                                                    <ActionIcon {...props} variant="light" size={isMobile ? 'md' : 'lg'}>
                                                        <Upload size={isMobile ? 14 : 18} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                        </FileButton>
                                        <Tooltip label="Open in Live Editor">
                                            <ActionIcon
                                                variant="light"
                                                size={isMobile ? 'md' : 'lg'}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onOpenLiveEditor?.(currentSvg, (val) => onChange({ [svgKey]: val }));
                                                }}
                                            >
                                                <Maximize2 size={isMobile ? 14 : 18} />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                    <Group gap={4} wrap="wrap">
                                        <Text size="xs" c="dimmed" mr={4}>Templates:</Text>
                                        {templates.map(t => (
                                            <Button
                                                key={t.name}
                                                variant="subtle"
                                                size="compact-xs"
                                                leftSection={t.icon}
                                                onClick={() => onChange({ [svgKey]: t.content })}
                                            >
                                                {t.name}
                                            </Button>
                                        ))}
                                    </Group>
                                </Stack>
                            </Grid.Col>
                            <Grid.Col span={{ base: 12, md: 4 }}>
                                <SVGPreview content={currentSvg} color={config.color_hex} />
                            </Grid.Col>
                        </Grid>
                    </Stack>
                </Grid.Col>
            </Grid>
        </Fieldset>
    );
};
