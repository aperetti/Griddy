import { useState, useMemo } from 'react';
import {
    Stack, Group, Text, Paper, Button, Textarea,
    TextInput, Select, ActionIcon, Badge, Tooltip,
    Divider, Fieldset, Box,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import { type TooltipConfig, type TooltipAttribute, genId } from '../../model/rules';
import { useSchema } from '../../context/SchemaContext';

interface TooltipConfigEditorProps {
    value: TooltipConfig;
    onChange: (config: TooltipConfig) => void;
    targetClass?: string;
}

// ── Sample data for live preview ────────────────────────────────────────────

const SAMPLE_FLAT: Record<string, string> = {
    'IdentifiedObject.name':       'XFMR-4207',
    'IdentifiedObject.mRID':       'A1B2C3D4-0000',
    'IdentifiedObject.description':'Main feeder transformer',
    'PowerTransformer.vectorGroup':'Dyn11',
    'ACLineSegment.length':        '245.3',
    'ACLineSegment.r':             '0.31',
    'ACLineSegment.x':             '0.29',
    'PowerElectronicsConnection.ratedS': '167000',
    'PowerElectronicsConnection.ratedU': '12470',
    'BatteryUnit.ratedE':          '500',
    'BatteryUnit.storedE':         '350',
    name:                          'XFMR-4207',
    mrid:                          'A1B2C3D4-0000',
    cim_class:                     'PowerTransformer',
    base_voltage_kv:               '12.47',
    'container.name':              'Main Feeder',
    'terminals.0.phases':          'ABC',
};

function sampleResolve(alias: string, attrMap: Record<string, string>): string {
    const path = attrMap[alias] ?? alias;
    return SAMPLE_FLAT[path] ?? SAMPLE_FLAT[alias] ?? alias;
}

function renderPreview(tpl: string, attrMap: Record<string, string>): string {
    return tpl.replace(/\{\{([\w.]+)\}\}/g, (_m, token) => sampleResolve(token, attrMap));
}

const DEFAULT_TEMPLATE =
`<div style="padding:10px;background:#1A1B1E;border:1px solid #373A40;border-radius:8px;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,0.5);min-width:180px">
  <div style="font-size:14px;font-weight:700;color:#4dabf7;margin-bottom:2px">{{name}}</div>
  <div style="opacity:.5;font-size:11px;margin-bottom:8px">{{mrid}}</div>
  <div style="font-size:12px;margin-bottom:2px"><strong>Class:</strong> {{cim_class}}</div>
  <div style="font-size:12px;margin-bottom:2px"><strong>Voltage:</strong> {{base_voltage_kv}} kV</div>
  <div style="font-size:12px"><strong>Container:</strong> {{container.name}}</div>
</div>`;

// ── Attribute row ────────────────────────────────────────────────────────────

function AttributeRow({
    attr,
    schema,
    targetClass,
    onInsertToken,
    onChange,
    onRemove,
}: {
    attr: TooltipAttribute;
    schema: Record<string, any>;
    targetClass?: string;
    onInsertToken: (token: string) => void;
    onChange: (a: TooltipAttribute) => void;
    onRemove: () => void;
}) {
    const isMobile = useMediaQuery('(max-width: 768px)');

    // Class options — target class first, then all schema classes
    const classOptions = useMemo(() => {
        const all = Object.keys(schema).sort();
        if (targetClass && !all.includes(targetClass)) return all.map(c => ({ value: c, label: c }));
        const ordered = targetClass ? [targetClass, ...all.filter(c => c !== targetClass)] : all;
        return ordered.map(c => ({ value: c, label: c }));
    }, [schema, targetClass]);

    // Attribute options for the selected class
    const attrOptions = useMemo(() => {
        const cls = attr.path.includes('.') ? attr.path.split('.')[0] : targetClass;
        if (!cls || !schema[cls]) return [];
        return (schema[cls].attributes as { name: string; is_complex?: boolean }[])
            .filter(a => !a.is_complex && a.name)
            .map(a => ({ value: `${cls}.${a.name}`, label: a.name }));
    }, [attr.path, schema, targetClass]);

    // Derive the class currently selected from the path prefix
    const selectedClass = attr.path.includes('.') ? attr.path.split('.')[0] : (targetClass ?? '');

    const handleClassChange = (cls: string | null) => {
        if (!cls) return;
        onChange({ ...attr, path: `${cls}.` });
    };

    const handleAttrChange = (fullPath: string | null) => {
        if (!fullPath) return;
        const attrName = fullPath.split('.').pop() ?? fullPath;
        onChange({
            ...attr,
            path: fullPath,
            // Auto-set alias from attribute name if alias is still empty or was auto-generated
            alias: attr.alias && attr.alias !== deriveAlias(attr.path) ? attr.alias : deriveAlias(fullPath),
        });
    };

    return (
        <Group gap="xs" wrap="nowrap" align="flex-start">
            {/* Token badge — click to insert {{alias}} into template */}
            <Tooltip label={`Insert {{${attr.alias || '…'}}} into template`} withArrow openDelay={300}>
                <Badge
                    variant="outline"
                    color="violet"
                    radius="sm"
                    style={{
                        cursor: attr.alias ? 'pointer' : 'default',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        flexShrink: 0,
                        minWidth: 80,
                        textAlign: 'center',
                    }}
                    onClick={() => attr.alias && onInsertToken(`{{${attr.alias}}}`)}
                >
                    {attr.alias ? `{{${attr.alias}}}` : '{{…}}'}
                </Badge>
            </Tooltip>

            {/* Alias text input */}
            <TextInput
                size="xs"
                placeholder="alias"
                value={attr.alias}
                onChange={(e) => onChange({ ...attr, alias: e.currentTarget.value })}
                style={{ width: isMobile ? undefined : 90, flexShrink: 0 }}
                styles={{ input: { fontFamily: 'monospace' } }}
            />

            {/* Class selector */}
            <Select
                size="xs"
                placeholder="Class…"
                value={selectedClass || null}
                data={classOptions}
                onChange={handleClassChange}
                searchable
                style={{ flex: 1, minWidth: 0 }}
                comboboxProps={{ withinPortal: false, zIndex: 2100 }}
            />

            {/* Attribute selector */}
            <Select
                size="xs"
                placeholder="Attribute…"
                value={attr.path || null}
                data={attrOptions}
                onChange={handleAttrChange}
                searchable
                disabled={!selectedClass}
                style={{ flex: 2, minWidth: 0 }}
                comboboxProps={{ withinPortal: false, zIndex: 2100 }}
                nothingFoundMessage="No attributes"
            />

            <ActionIcon variant="subtle" color="red" size="sm" onClick={onRemove}>
                <Trash2 size={14} />
            </ActionIcon>
        </Group>
    );
}

function deriveAlias(path: string): string {
    if (!path) return '';
    const parts = path.split('.');
    return parts[parts.length - 1] || '';
}

// ── Main component ───────────────────────────────────────────────────────────

export function TooltipConfigEditor({ value, onChange, targetClass }: TooltipConfigEditorProps) {
    const { schema } = useSchema();
    const [cursorPos, setCursorPos] = useState<number | null>(null);

    const update = (patch: Partial<TooltipConfig>) => onChange({ ...value, ...patch });

    const attributes: TooltipAttribute[] = value.attributes ?? [];
    const template = value.html_template ?? '';

    const attrMap = useMemo(() => {
        const m: Record<string, string> = {};
        for (const a of attributes) if (a.alias && a.path) m[a.alias] = a.path;
        return m;
    }, [attributes]);

    const addAttribute = () => {
        const initialPath = targetClass ? `${targetClass}.` : '';
        update({
            attributes: [
                ...attributes,
                { id: genId(), alias: '', path: initialPath },
            ],
        });
    };

    const updateAttribute = (id: string, updated: TooltipAttribute) =>
        update({ attributes: attributes.map(a => a.id === id ? updated : a) });

    const removeAttribute = (id: string) =>
        update({ attributes: attributes.filter(a => a.id !== id) });

    // Insert token at cursor position in textarea
    const insertToken = (token: string) => {
        const pos = cursorPos ?? template.length;
        const next = template.slice(0, pos) + token + template.slice(pos);
        update({ html_template: next });
        setCursorPos(pos + token.length);
    };

    const previewHtml = template ? renderPreview(template, attrMap) : '';

    return (
        <Stack gap="sm">
            {/* Attributes */}
            <Fieldset legend="Attributes" variant="default" p="xs">
                <Stack gap="xs">
                    {attributes.length > 0 && (
                        <Group gap="xs">
                            <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ width: 80, flexShrink: 0 }}>Token</Text>
                            <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ width: 90, flexShrink: 0 }}>Alias</Text>
                            <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ flex: 1 }}>Class</Text>
                            <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ flex: 2 }}>Attribute</Text>
                            <div style={{ width: 28 }} />
                        </Group>
                    )}
                    {attributes.map(attr => (
                        <AttributeRow
                            key={attr.id}
                            attr={attr}
                            schema={schema}
                            targetClass={targetClass}
                            onInsertToken={insertToken}
                            onChange={(updated) => updateAttribute(attr.id, updated)}
                            onRemove={() => removeAttribute(attr.id)}
                        />
                    ))}
                    <Button
                        variant="subtle"
                        size="compact-xs"
                        color="gray"
                        leftSection={<Plus size={12} />}
                        onClick={addAttribute}
                        style={{ alignSelf: 'flex-start' }}
                    >
                        Add attribute
                    </Button>
                </Stack>
            </Fieldset>

            {/* HTML Template */}
            <Fieldset
                legend={
                    <Group gap={6}>
                        HTML Template
                        <Tooltip label="Reset to default template" withArrow>
                            <ActionIcon
                                variant="subtle"
                                size="xs"
                                color="gray"
                                onClick={() => update({ html_template: DEFAULT_TEMPLATE })}
                            >
                                <RotateCcw size={11} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                }
                variant="default"
                p="xs"
            >
                <Stack gap="xs">
                    <Text size="xs" c="dimmed">
                        Use{' '}
                        <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace', fontSize: 11 }}>
                            {'{{alias}}'}
                        </code>{' '}
                        tokens — click an attribute badge above to insert at cursor
                    </Text>

                    {/* Quick-insert row for defined aliases */}
                    {attributes.some(a => a.alias) && (
                        <Group gap={4} wrap="wrap">
                            {attributes.filter(a => a.alias).map(a => (
                                <Badge
                                    key={a.id}
                                    variant="outline"
                                    color="violet"
                                    radius="sm"
                                    style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 10 }}
                                    onClick={() => insertToken(`{{${a.alias}}}`)}
                                >
                                    {`{{${a.alias}}}`}
                                </Badge>
                            ))}
                        </Group>
                    )}

                    <Textarea
                        rows={9}
                        value={template}
                        onChange={(e) => update({ html_template: e.currentTarget.value })}
                        onSelect={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
                        onClick={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
                        onKeyUp={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart)}
                        styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                        placeholder={DEFAULT_TEMPLATE}
                    />
                </Stack>
            </Fieldset>

            {/* Preview */}
            {previewHtml && (
                <Box>
                    <Text size="10px" c="dimmed" tt="uppercase" fw={600} mb={4}>Preview (sample data)</Text>
                    <Paper withBorder p="xs" bg="rgba(0,0,0,0.3)" style={{ overflow: 'hidden' }}>
                        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                    </Paper>
                </Box>
            )}
        </Stack>
    );
}
