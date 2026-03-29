import { useState } from 'react';
import {
    Stack, Group, Text, SegmentedControl, Paper, Button, Textarea,
    TextInput, Select, ActionIcon, Badge, Collapse, Fieldset, Tooltip,
} from '@mantine/core';
import { Plus, Trash2, ChevronDown, ChevronUp, MessageSquare, Code2, RotateCcw } from 'lucide-react';
import { type TooltipConfig, type TooltipField, genId } from '../../model/rules';

interface TooltipConfigEditorProps {
    value: TooltipConfig;
    onChange: (config: TooltipConfig) => void;
}

export const NODE_FIELDS = [
    { value: 'name',           label: 'Name' },
    { value: 'id',             label: 'ID / mRID' },
    { value: 'type',           label: 'CIM Type' },
    { value: 'phases',         label: 'Phases' },
    { value: 'base_voltage_kv', label: 'Base Voltage (kV)' },
    { value: 'circuit_id',    label: 'Circuit' },
    { value: 'display_label', label: 'Display Label' },
    { value: 'edge_type',     label: 'Edge Type' },
    { value: 'transformer_kva', label: 'Transformer Rating (kVA)' },
    { value: 'length_m',      label: 'Line Length (m)' },
    { value: 'is_open',       label: 'Switch State' },
];

const SAMPLE_DATA: Record<string, string> = {
    name:            'BUS_4207',
    id:              'A1B2C3D4-E5F6-...',
    type:            'ConnectivityNode',
    phases:          'A, B, C',
    base_voltage_kv: '12.47',
    circuit_id:      'circuit_1',
    display_label:   'Main Bus',
    edge_type:       'ACLineSegment',
    transformer_kva: '167.0',
    length_m:        '245.3',
    is_open:         'false',
};

export const DEFAULT_HTML_TEMPLATE =
`<div style="padding:10px;background:#1A1B1E;border:1px solid #373A40;border-radius:8px;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,0.5);min-width:160px;">
  <div style="font-size:14px;font-weight:700;color:#4dabf7;margin-bottom:2px;">{{name}}</div>
  <div style="opacity:0.5;font-size:11px;margin-bottom:8px;">{{id}}</div>
  <div style="font-size:12px;margin-bottom:2px;"><strong>Type:</strong> {{type}}</div>
  <div style="font-size:12px;margin-bottom:2px;"><strong>Phases:</strong> {{phases}}</div>
  <div style="font-size:12px;"><strong>Voltage:</strong> {{base_voltage_kv}} kV</div>
</div>`;

function renderBasicPreview(fields: TooltipField[]): string {
    if (!fields.length) return '';
    const rows = fields
        .filter(f => f.field)
        .map(f => `<div style="font-size:12px;margin-bottom:2px;"><strong>${f.label || f.field}:</strong> ${SAMPLE_DATA[f.field] ?? '—'}</div>`)
        .join('');
    return `<div style="padding:10px;background:#1A1B1E;border:1px solid #373A40;border-radius:8px;color:#fff;min-width:160px;">${rows}</div>`;
}

function renderAdvancedPreview(template: string): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_m, f) => SAMPLE_DATA[f] ?? `{{${f}}}`);
}

function FieldRow({
    field,
    onChange,
    onRemove,
}: {
    field: TooltipField;
    onChange: (f: TooltipField) => void;
    onRemove: () => void;
}) {
    return (
        <Group gap="xs" wrap="nowrap">
            <TextInput
                style={{ flex: 1 }}
                size="xs"
                placeholder="Label"
                value={field.label}
                onChange={(e) => onChange({ ...field, label: e.currentTarget.value })}
            />
            <Select
                style={{ flex: 1 }}
                size="xs"
                placeholder="Node field"
                value={field.field || null}
                onChange={(v) => onChange({ ...field, field: v || '' })}
                data={NODE_FIELDS}
                comboboxProps={{ zIndex: 2100, withinPortal: true }}
                searchable
            />
            <ActionIcon variant="subtle" color="red" size="sm" onClick={onRemove}>
                <Trash2 size={14} />
            </ActionIcon>
        </Group>
    );
}

export function TooltipConfigEditor({ value, onChange }: TooltipConfigEditorProps) {
    const [showTokenRef, setShowTokenRef] = useState(false);

    const update = (patch: Partial<TooltipConfig>) => onChange({ ...value, ...patch });

    const addField = () =>
        update({ fields: [...value.fields, { id: genId(), label: '', field: 'name' }] });

    const updateField = (id: string, updated: TooltipField) =>
        update({ fields: value.fields.map(f => f.id === id ? updated : f) });

    const removeField = (id: string) =>
        update({ fields: value.fields.filter(f => f.id !== id) });

    const previewHtml =
        value.mode === 'basic'
            ? renderBasicPreview(value.fields)
            : value.html_template
                ? renderAdvancedPreview(value.html_template)
                : '';

    return (
        <Stack gap="sm">
            <SegmentedControl
                size="xs"
                value={value.mode}
                onChange={(v) => update({ mode: v as 'basic' | 'advanced' })}
                data={[
                    { value: 'basic',    label: <Group gap={4} wrap="nowrap"><MessageSquare size={12} />Basic Fields</Group> },
                    { value: 'advanced', label: <Group gap={4} wrap="nowrap"><Code2 size={12} />HTML Template</Group> },
                ]}
            />

            {value.mode === 'basic' ? (
                <Stack gap="xs">
                    {value.fields.length > 0 && (
                        <Group gap="xs">
                            <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ flex: 1 }}>Label</Text>
                            <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ flex: 1 }}>Field</Text>
                            <div style={{ width: 28 }} />
                        </Group>
                    )}

                    {value.fields.map(f => (
                        <FieldRow
                            key={f.id}
                            field={f}
                            onChange={(updated) => updateField(f.id, updated)}
                            onRemove={() => removeField(f.id)}
                        />
                    ))}

                    <Button variant="subtle" size="xs" leftSection={<Plus size={12} />} onClick={addField}>
                        Add Field
                    </Button>
                </Stack>
            ) : (
                <Stack gap="xs">
                    <Group justify="space-between" align="flex-end">
                        <Text size="xs" c="dimmed">Use <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 4px', borderRadius: 3 }}>{'{{field}}'}</code> tokens to inject node/edge data</Text>
                        <Tooltip label="Reset to default template" withArrow>
                            <ActionIcon
                                variant="subtle"
                                size="sm"
                                color="gray"
                                onClick={() => update({ html_template: DEFAULT_HTML_TEMPLATE })}
                            >
                                <RotateCcw size={13} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>

                    <Textarea
                        rows={9}
                        value={value.html_template}
                        onChange={(e) => update({ html_template: e.currentTarget.value })}
                        styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                        placeholder={DEFAULT_HTML_TEMPLATE}
                    />

                    <Button
                        variant="subtle"
                        size="xs"
                        color="gray"
                        rightSection={showTokenRef ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        onClick={() => setShowTokenRef(!showTokenRef)}
                        justify="space-between"
                    >
                        Available tokens
                    </Button>
                    <Collapse in={showTokenRef}>
                        <Paper withBorder p="xs" bg="rgba(0,0,0,0.2)">
                            <Group gap="xs" wrap="wrap">
                                {NODE_FIELDS.map(f => (
                                    <Badge
                                        key={f.value}
                                        variant="outline"
                                        color="blue"
                                        style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 10 }}
                                        title={f.label}
                                        onClick={() => update({ html_template: value.html_template + `{{${f.value}}}` })}
                                    >
                                        {`{{${f.value}}}`}
                                    </Badge>
                                ))}
                            </Group>
                        </Paper>
                    </Collapse>
                </Stack>
            )}

            {previewHtml && (
                <Stack gap={4}>
                    <Text size="10px" c="dimmed" tt="uppercase" fw={600}>Preview (sample data)</Text>
                    <Paper withBorder p="xs" bg="rgba(0,0,0,0.3)" style={{ overflow: 'hidden' }}>
                        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                    </Paper>
                </Stack>
            )}
        </Stack>
    );
}
