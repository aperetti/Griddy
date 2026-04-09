import { Grid, ColorInput, NumberInput, Select, Fieldset } from '@mantine/core';
import type { RuleConfig } from '../../../../shared/api';

interface EdgeStyleEditorProps {
    config: Pick<RuleConfig, 'color_hex' | 'line_weight' | 'line_style'>;
    onChange: (patch: Partial<RuleConfig>) => void;
}

const LINE_STYLE_DATA = [
    { value: 'solid',  label: 'Solid' },
    { value: 'dashed', label: 'Dashed' },
    { value: 'dotted', label: 'Dotted' },
];

export function EdgeStyleEditor({ config, onChange }: EdgeStyleEditorProps) {
    return (
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
    );
}
