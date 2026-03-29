import { useState, useEffect } from 'react';
import {
    Stack, Group, Text, SegmentedControl, Paper, Button, Textarea,
    TextInput, Select, ActionIcon, Badge, Collapse, Tooltip,
    Loader, Anchor, Breadcrumbs,
} from '@mantine/core';
import { Plus, Trash2, ChevronDown, ChevronUp, MessageSquare, Code2, RotateCcw, ChevronRight } from 'lucide-react';
import { type TooltipConfig, type TooltipField, genId } from '../../model/rules';
import { useSchema } from '../../context/SchemaContext';
import { fetchCimConnections } from '../../../../shared/api';

interface TooltipConfigEditorProps {
    value: TooltipConfig;
    onChange: (config: TooltipConfig) => void;
    targetClass?: string;
}

// Relative key for each CIM class when navigating from its parent.
// E.g. Terminal is accessed via 'terminals.0' from any Equipment root,
// ConnectivityNode is accessed via 'connectivity_node' from within a Terminal object.
const CLASS_RELATIVE_KEY: Record<string, string> = {
    Terminal:          'terminals.0',
    ConnectivityNode:  'connectivity_node',
    Asset:             'container',
    Feeder:            'container',
    VoltageLevel:      'container',
    Substation:        'container',
};

function getPathPrefix(browsePath: string[]): string {
    // Accumulate relative keys left-to-right so nested navigation produces correct dot paths.
    // e.g. ["PT", "Terminal", "ConnectivityNode"] → "terminals.0.connectivity_node"
    if (browsePath.length <= 1) return '';
    const parts: string[] = [];
    for (const cls of browsePath.slice(1)) {
        parts.push(CLASS_RELATIVE_KEY[cls] ?? cls.toLowerCase());
    }
    return parts.join('.');
}

// ── Sample data for live preview ──────────────────────────────────
const SAMPLE_DATA: Record<string, string> = {
    name:            'XFMR_4207',
    mrid:            'A1B2C3D4-...',
    cim_class:       'PowerTransformer',
    base_voltage_kv: '12.47',
    'container.name': 'Main Feeder',
    'terminals.0.connectivity_node': 'BUS_001',
    'terminals.0.phases': 'A, B, C',
    length_m:        '245.3',
    r:               '0.31',
    x:               '0.29',
    ratedS:          '167000',
    is_open:         'false',
    p_mw:            '0.042',
    q_mvar:          '0.012',
};

function sampleResolve(field: string): string {
    return SAMPLE_DATA[field] ?? field.split('.').pop() ?? field;
}

export const DEFAULT_HTML_TEMPLATE =
`<div style="padding:10px;background:#1A1B1E;border:1px solid #373A40;border-radius:8px;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,0.5);min-width:160px;">
  <div style="font-size:14px;font-weight:700;color:#4dabf7;margin-bottom:2px;">{{name}}</div>
  <div style="opacity:0.5;font-size:11px;margin-bottom:8px;">{{mrid}}</div>
  <div style="font-size:12px;margin-bottom:2px;"><strong>Class:</strong> {{cim_class}}</div>
  <div style="font-size:12px;margin-bottom:2px;"><strong>Voltage:</strong> {{base_voltage_kv}} kV</div>
  <div style="font-size:12px;"><strong>Container:</strong> {{container.name}}</div>
</div>`;

// ── CimTokenBrowser ───────────────────────────────────────────────

interface CimTokenBrowserProps {
    targetClass: string;
    onInsert: (token: string) => void;
}

function CimTokenBrowser({ targetClass, onInsert }: CimTokenBrowserProps) {
    const { schema } = useSchema();
    // browsePath tracks the class hierarchy the user has drilled into
    const [browsePath, setBrowsePath] = useState<string[]>([targetClass]);
    const [connections, setConnections] = useState<Record<string, string[]>>({});
    const [loadingConnections, setLoadingConnections] = useState<Record<string, boolean>>({});

    // Reset path when targetClass changes
    useEffect(() => {
        setBrowsePath([targetClass]);
    }, [targetClass]);

    const currentClass = browsePath[browsePath.length - 1];
    const pathPrefix = getPathPrefix(browsePath);
    const classInfo = schema[currentClass];
    const attrs = (classInfo?.attributes ?? []).filter((a: any) => !a.is_complex);
    const knownConnections = connections[currentClass];

    // Lazy-load connections for the current class
    useEffect(() => {
        if (connections[currentClass] !== undefined || loadingConnections[currentClass]) return;
        setLoadingConnections(prev => ({ ...prev, [currentClass]: true }));
        fetchCimConnections(currentClass)
            .then(list => setConnections(prev => ({ ...prev, [currentClass]: list })))
            .catch(() => setConnections(prev => ({ ...prev, [currentClass]: [] })))
            .finally(() => setLoadingConnections(prev => ({ ...prev, [currentClass]: false })));
    }, [currentClass, connections, loadingConnections]);

    const drillInto = (cls: string) => {
        setBrowsePath(prev => [...prev, cls]);
    };

    const breadcrumbItems = browsePath.map((cls, idx) => (
        <Anchor
            key={cls + idx}
            size="xs"
            onClick={() => setBrowsePath(prev => prev.slice(0, idx + 1))}
            style={{ cursor: idx < browsePath.length - 1 ? 'pointer' : 'default', fontWeight: idx === browsePath.length - 1 ? 600 : 400 }}
        >
            {cls}
        </Anchor>
    ));

    const makeToken = (attrName: string) =>
        pathPrefix ? `{{${pathPrefix}.${attrName}}}` : `{{${attrName}}}`;

    return (
        <Stack gap="xs">
            {/* Breadcrumb navigation */}
            {browsePath.length > 1 && (
                <Breadcrumbs separator={<ChevronRight size={10} />} style={{ flexWrap: 'wrap' }}>
                    {breadcrumbItems}
                </Breadcrumbs>
            )}

            {/* Class attributes */}
            {attrs.length > 0 ? (
                <Stack gap={4}>
                    <Text size="10px" c="dimmed" fw={600} tt="uppercase">
                        {currentClass} attributes
                    </Text>
                    <Group gap={4} wrap="wrap">
                        {attrs.map((attr: any) => (
                            <Badge
                                key={attr.name}
                                variant="outline"
                                color="blue"
                                style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 10 }}
                                title={`Type: ${attr.type}`}
                                onClick={() => onInsert(makeToken(attr.name))}
                            >
                                {makeToken(attr.name)}
                            </Badge>
                        ))}
                    </Group>
                </Stack>
            ) : (
                <Text size="xs" c="dimmed">No simple attributes found for {currentClass}</Text>
            )}

            {/* Navigable related classes */}
            <Stack gap={4}>
                <Text size="10px" c="dimmed" fw={600} tt="uppercase">
                    Connected classes
                    {loadingConnections[currentClass] && <Loader size={10} ml={4} />}
                </Text>
                {knownConnections?.length ? (
                    <Group gap={4} wrap="wrap">
                        {knownConnections.map(cls => (
                            <Badge
                                key={cls}
                                variant="light"
                                color="teal"
                                rightSection={<ChevronRight size={10} />}
                                style={{ cursor: 'pointer', fontSize: 10 }}
                                onClick={() => drillInto(cls)}
                            >
                                {cls}
                            </Badge>
                        ))}
                    </Group>
                ) : (
                    !loadingConnections[currentClass] && (
                        <Text size="xs" c="dimmed">No connected classes</Text>
                    )
                )}
            </Stack>
        </Stack>
    );
}

// ── Basic mode field row ──────────────────────────────────────────

function FieldRow({
    field, schema, targetClass, onChange, onRemove,
}: {
    field: TooltipField;
    schema: Record<string, any>;
    targetClass?: string;
    onChange: (f: TooltipField) => void;
    onRemove: () => void;
}) {
    // Build attribute options from schema of the target class
    const attrs = targetClass
        ? (schema[targetClass]?.attributes ?? [])
            .filter((a: any) => !a.is_complex)
            .map((a: any) => ({ value: a.name, label: `${a.name} (${a.type})` }))
        : [];

    // Always include a few well-known detail-response keys too
    const extra = [
        { value: 'mrid', label: 'mrid (string)' },
        { value: 'cim_class', label: 'cim_class (string)' },
        { value: 'base_voltage_kv', label: 'base_voltage_kv (number)' },
        { value: 'container.name', label: 'container.name (string)' },
        { value: 'terminals.0.connectivity_node', label: 'terminals.0.connectivity_node (string)' },
        { value: 'terminals.0.phases', label: 'terminals.0.phases (array)' },
    ];
    const knownNames = new Set(attrs.map((a: any) => a.value));
    const combined = [...attrs, ...extra.filter(e => !knownNames.has(e.value))];

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
                placeholder="Field / path"
                value={field.field || null}
                onChange={(v) => onChange({ ...field, field: v || '' })}
                data={combined}
                comboboxProps={{ zIndex: 2100, withinPortal: true }}
                searchable
                allowDeselect={false}
            />
            <ActionIcon variant="subtle" color="red" size="sm" onClick={onRemove}>
                <Trash2 size={14} />
            </ActionIcon>
        </Group>
    );
}

// ── Preview helpers ───────────────────────────────────────────────

function renderBasicPreview(fields: TooltipField[]): string {
    if (!fields.length) return '';
    const rows = fields
        .filter(f => f.field)
        .map(f => `<div style="font-size:12px;margin-bottom:2px;"><strong>${f.label || f.field}:</strong> ${sampleResolve(f.field)}</div>`)
        .join('');
    return `<div style="padding:10px;background:#1A1B1E;border:1px solid #373A40;border-radius:8px;color:#fff;min-width:160px;">${rows}</div>`;
}

function renderAdvancedPreview(template: string): string {
    return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_m, f) => sampleResolve(f));
}

// ── Main component ────────────────────────────────────────────────

export function TooltipConfigEditor({ value, onChange, targetClass }: TooltipConfigEditorProps) {
    const { schema } = useSchema();
    const [showTokenBrowser, setShowTokenBrowser] = useState(false);

    const update = (patch: Partial<TooltipConfig>) => onChange({ ...value, ...patch });

    const addField = () =>
        update({ fields: [...value.fields, { id: genId(), label: '', field: '' }] });

    const updateField = (id: string, updated: TooltipField) =>
        update({ fields: value.fields.map(f => f.id === id ? updated : f) });

    const removeField = (id: string) =>
        update({ fields: value.fields.filter(f => f.id !== id) });

    const insertToken = (token: string) =>
        update({ html_template: value.html_template + token });

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
                            schema={schema}
                            targetClass={targetClass}
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
                        <Text size="xs" c="dimmed">
                            Use <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 4px', borderRadius: 3 }}>{'{{field}}'}</code> tokens — click attributes below to insert
                        </Text>
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
                        rightSection={showTokenBrowser ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        onClick={() => setShowTokenBrowser(!showTokenBrowser)}
                        justify="space-between"
                    >
                        {targetClass ? `Browse ${targetClass} tokens` : 'Browse tokens'}
                    </Button>
                    <Collapse in={showTokenBrowser}>
                        <Paper withBorder p="xs" bg="rgba(0,0,0,0.2)">
                            {targetClass ? (
                                <CimTokenBrowser
                                    targetClass={targetClass}
                                    onInsert={insertToken}
                                />
                            ) : (
                                <Text size="xs" c="dimmed">
                                    Set a target class in Match Conditions to see CIM-specific tokens
                                </Text>
                            )}
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
