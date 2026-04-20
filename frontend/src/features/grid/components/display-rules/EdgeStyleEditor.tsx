import { useMemo } from 'react';
import { Grid, ColorInput, NumberInput, Select, Fieldset, Stack, Text, Group, Paper, Button, ActionIcon, Tooltip, FileButton, Switch, Divider } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Upload, Maximize2, Circle as CircleIcon, Square as SquareIcon, Triangle as TriangleIcon, Star } from 'lucide-react';
import type { RuleConfig } from '../../../../shared/api';

interface EdgeStyleEditorProps {
    config: Pick<RuleConfig, 'color_hex' | 'line_weight' | 'line_style' | 'icon' | 'center_icon_enabled' | 'center_icon_size' | 'center_icon_rotate'>;
    onChange: (patch: Partial<RuleConfig>) => void;
    onOpenLiveEditor?: (initialValue: string, onSave: (val: string) => void, baseSvg?: string, baseColor?: string) => void;
    baseSvg?: string;
    baseColor?: string;
}

const LINE_STYLE_DATA = [
    { value: 'solid',  label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
];

const templates = [
    { name: 'Circle', icon: <CircleIcon size={14} />, content: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n  <circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="4" fill="none" />\n</svg>' },
    { name: 'Square', icon: <SquareIcon size={14} />, content: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n  <rect x="10" y="10" width="80" height="80" stroke="currentColor" stroke-width="4" fill="none" />\n</svg>' },
    { name: 'Triangle', icon: <TriangleIcon size={14} />, content: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n  <path d="M50 10 L90 90 L10 90 Z" stroke="currentColor" stroke-width="4" fill="none" />\n</svg>' },
    { name: 'Diamond', icon: <Star size={14} />, content: '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">\n  <path d="M50 10 L90 50 L50 90 L10 50 Z" stroke="currentColor" stroke-width="4" fill="none" />\n</svg>' },
];

const SVGPreview = ({ content, color, baseSvg, baseColor }: { content: string; color?: string; baseSvg?: string; baseColor?: string }) => {
    const bg = '#141517';
    const checkerColor = 'rgba(255,255,255,0.03)';
    
    const VIEWBOX_SIZE = 100;

    const workspaceContent = useMemo(() => {
        const parser = new DOMParser();
        
        // BASE LAYER
        let baseContent = '';
        if (baseSvg) {
            const baseStr = baseSvg.includes('<svg') ? baseSvg : `<svg xmlns="http://www.w3.org/2000/svg">${baseSvg}</svg>`;
            const doc = parser.parseFromString(baseStr, 'image/svg+xml');
            const svg = doc.querySelector('svg');
            if (svg) {
                const vb = svg.getAttribute('viewBox')?.split(/[,\s]+/).map(parseFloat);
                let scaleStr = '';
                if (vb && vb.length === 4) {
                    const s = Math.min(VIEWBOX_SIZE / vb[2], VIEWBOX_SIZE / vb[3]);
                    scaleStr = `transform="scale(${s.toFixed(3)})"`;
                }
                baseContent = `<g opacity="0.3" fill="${baseColor || 'currentColor'}" stroke="${baseColor || 'none'}" pointer-events="none" ${scaleStr}>${svg.innerHTML}</g>`;
            }
        }

        // OVERLAY LAYER
        const overlayContent = `<g color="${color || '#339AF0'}">${content || ''}</g>`;

        return `${baseContent}${overlayContent}`;
    }, [content, color, baseSvg, baseColor]);

    const hasContent = !!content || !!baseSvg;

    if (!hasContent) {
        return (
            <Paper
                withBorder
                p="md"
                style={{
                    height: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: bg,
                }}
            >
                <Text size="xs" c="dimmed">No icon</Text>
            </Paper>
        );
    }

    return (
        <Paper
            withBorder
            p="md"
            style={{
                height: 100,
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
                backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            }}
        >
            <div
                style={{
                    width: 60,
                    height: 60,
                    position: 'relative',
                    filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))',
                }}
            >
                <svg 
                    viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
                    width="100%"
                    height="100%"
                    style={{ display: 'block' }}
                    dangerouslySetInnerHTML={{ __html: workspaceContent }}
                />
            </div>
        </Paper>
    );
};

export function EdgeStyleEditor({ config, onChange, onOpenLiveEditor, baseSvg, baseColor }: EdgeStyleEditorProps) {
    const isMobile = useMediaQuery('(max-width: 768px)');

    const handleFileUpload = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            if (content.includes('<svg')) {
                onChange({ icon: content });
            }
        };
        reader.readAsText(file);
    };

    return (
        <Stack gap="md">
            <Fieldset legend="Edge Appearance" variant="default">
                <Grid gutter="md">
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <ColorInput
                            label="Color"
                            description="Overrides default zone/feeder color"
                            value={config.color_hex || ''}
                            onChange={(v) => onChange({ color_hex: v || undefined })}
                            popoverProps={{ zIndex: 2000, withinPortal: true }}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <NumberInput
                            label="Line Weight (px)"
                            description="Leave empty to use phase-based default"
                            placeholder="Default (by phase count)"
                            value={config.line_weight ?? ''}
                            min={0.5}
                            max={20}
                            step={0.5}
                            decimalScale={1}
                            onChange={(v) => onChange({ line_weight: v === '' ? undefined : Number(v) })}
                            allowDecimal
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 4 }}>
                        <Select
                            label="Line Style"
                            description="Leave empty to use phase-based default"
                            placeholder="Default (by phase count)"
                            clearable
                            value={config.line_style ?? null}
                            data={LINE_STYLE_DATA}
                            onChange={(v) => onChange({ line_style: (v as RuleConfig['line_style']) ?? undefined })}
                            comboboxProps={{ zIndex: 2000, withinPortal: true }}
                        />
                    </Grid.Col>
                </Grid>
            </Fieldset>

            <Fieldset legend="Center Icon (optional)" variant="default">
                <Stack gap="md">
                    <Grid gutter="md">
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                            <Switch
                                label="Enable Center Icon"
                                checked={config.center_icon_enabled}
                                onChange={(e) => onChange({ center_icon_enabled: e.currentTarget.checked })}
                            />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                            <NumberInput
                                label="Icon Size"
                                value={config.center_icon_size || 1.0}
                                min={0.1} max={5} step={0.1}
                                disabled={!config.center_icon_enabled}
                                onChange={(v) => onChange({ center_icon_size: Number(v) })}
                            />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                            <Switch
                                label="Rotate Icon to Edge"
                                checked={config.center_icon_rotate}
                                disabled={!config.center_icon_enabled}
                                onChange={(e) => onChange({ center_icon_rotate: e.currentTarget.checked })}
                            />
                        </Grid.Col>
                    </Grid>

                    <Divider opacity={0.1} />

                    <Grid gutter="md">
                        <Grid.Col span={{ base: 12, md: 8 }}>
                            <Stack gap="xs">
                                <Group gap="xs" wrap="nowrap">
                                    <ActionIcon
                                        variant="subtle"
                                        color="red"
                                        size="sm"
                                        title="Clear icon"
                                        disabled={!config.icon}
                                        onClick={() => onChange({ icon: undefined })}
                                    >
                                        ×
                                    </ActionIcon>
                                    <FileButton onChange={handleFileUpload} accept="image/svg+xml">
                                        {(props) => (
                                            <Tooltip label="Upload SVG">
                                                <ActionIcon {...props} variant="light" size={isMobile ? 'md' : 'lg'}>
                                                    <Upload size={isMobile ? 14 : 18} />
                                                </ActionIcon>
                                            </Tooltip>
                                        )}
                                    </FileButton>
                                    {onOpenLiveEditor && (
                                        <Tooltip label="Open in Live Editor">
                                            <ActionIcon
                                                variant="light"
                                                size={isMobile ? 'md' : 'lg'}
                                                onClick={() => onOpenLiveEditor(config.icon || '', (val) => onChange({ icon: val }), baseSvg, baseColor)}
                                            >
                                                <Maximize2 size={isMobile ? 14 : 18} />
                                            </ActionIcon>
                                        </Tooltip>
                                    )}
                                </Group>
                                <Group gap={4} wrap="wrap">
                                    <Text size="xs" c="dimmed" mr={4}>Templates:</Text>
                                    {templates.map(t => (
                                        <Button
                                            key={t.name}
                                            variant="subtle"
                                            size="compact-xs"
                                            leftSection={t.icon}
                                            onClick={() => onChange({ icon: t.content })}
                                        >
                                            {t.name}
                                        </Button>
                                    ))}
                                </Group>
                            </Stack>
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 4 }}>
                            <SVGPreview content={config.icon || ''} color={config.color_hex} baseSvg={baseSvg} baseColor={baseColor} />
                        </Grid.Col>
                    </Grid>
                </Stack>
            </Fieldset>
        </Stack>
    );
}
