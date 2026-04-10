import { useState, useMemo } from 'react';
import {
    Stack, Group, Text, Paper, Button, Textarea,
    TextInput, Select, ActionIcon, Badge, Tooltip,
    Fieldset, Box, SegmentedControl,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Plus, Trash2, RotateCcw, List, Code2 } from 'lucide-react';
import { type TooltipConfig, type TooltipAttribute, type PathStep, genId } from '../../model/rules';
import { useSchema } from '../../context/SchemaContext';

interface TooltipConfigEditorProps {
    value: TooltipConfig;
    onChange: (config: TooltipConfig) => void;
    targetClass?: string;
    /** Path steps from the CIM rule builder — exposes projected attributes as suggestions */
    pathSteps?: PathStep[];
}

// ── Sample data for live preview ────────────────────────────────────────────

// Sample data mirrors the structured response from fetchCimNode / fetchCimEquipmentExpanded.
// Keys are unqualified (matching API output). Class-qualified paths like "IdentifiedObject.name"
// resolve via prefix-stripping in resolvePath — represented here by both forms for preview accuracy.
const SAMPLE_FLAT: Record<string, string> = {
    // Unqualified (actual API keys)
    name:              'XFMR-4207',
    mrid:              'A1B2C3D4-0000',
    description:       'Main feeder transformer',
    cim_class:         'PowerTransformer',
    base_voltage_kv:   '12.47',
    ratedS:            '500000',
    ratedU:            '12470',
    length_m:          '245.3',
    r:                 '0.31',
    x:                 '0.29',
    is_open:           'false',
    // Nested paths (resolved via dot traversal)
    'container.name':  'Main Feeder',
    'terminals.0.phases': 'ABC',
    // Class-qualified aliases (resolved via prefix stripping)
    'IdentifiedObject.name':        'XFMR-4207',
    'IdentifiedObject.mRID':        'A1B2C3D4-0000',
    'IdentifiedObject.description': 'Main feeder transformer',
    'PowerTransformer.ratedS':      '500000',
    'ACLineSegment.length':         '245.3',
    'ACLineSegment.r':              '0.31',
    'ACLineSegment.x':              '0.29',
};

function sampleResolve(alias: string, attrMap: Record<string, string>): string {
    const path = attrMap[alias] ?? alias;
    return SAMPLE_FLAT[path] ?? SAMPLE_FLAT[alias] ?? alias;
}

function renderPreview(tpl: string, attrMap: Record<string, string>): string {
    return tpl.replace(/\{\{([\w.]+)\}\}/g, (_m, token) => sampleResolve(token, attrMap));
}

function sampleResolvePath(path: string): string {
    if (!path || path.endsWith('.')) return '';
    if (SAMPLE_FLAT[path]) return SAMPLE_FLAT[path];
    // Nested traversal on SAMPLE_FLAT
    const parts = path.split('.');
    let val: any = SAMPLE_FLAT;
    for (const p of parts) {
        if (val == null || typeof val !== 'object') { val = null; break; }
        val = (val as any)[p];
    }
    if (val != null && val !== '') return String(val);
    // Strip class prefix
    if (parts.length >= 2) {
        const unqualified = parts.slice(1).join('.');
        return SAMPLE_FLAT[unqualified] ?? '';
    }
    return '';
}

function renderEasyPreview(attrs: TooltipAttribute[]): string {
    const rows = attrs
        .filter(a => a.path && !a.path.endsWith('.'))
        .map(a => {
            const val = sampleResolvePath(a.path);
            const displayLabel = a.label || a.alias || a.path.split('.').pop() || a.path;
            if (!val) return '';
            return `<div style="font-size:12px;margin-bottom:2px;"><strong>${displayLabel}:</strong> ${val}</div>`;
        })
        .filter(Boolean)
        .join('');
    if (!rows) return '';
    return `<div style="padding:10px;background:#1A1B1E;border:1px solid #373A40;border-radius:8px;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,0.5);min-width:150px;">${rows}</div>`;
}

function deriveAlias(path: string): string {
    if (!path) return '';
    const parts = path.split('.');
    return parts[parts.length - 1] || '';
}

const DEFAULT_TEMPLATE =
`<div style="padding:10px;background:#1A1B1E;border:1px solid #373A40;border-radius:8px;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,0.5);min-width:180px">
  <div style="font-size:14px;font-weight:700;color:#4dabf7;margin-bottom:2px">{{name}}</div>
  <div style="opacity:.5;font-size:11px;margin-bottom:8px">{{mrid}}</div>
  <div style="font-size:12px;margin-bottom:2px"><strong>Class:</strong> {{cim_class}}</div>
  <div style="font-size:12px;margin-bottom:2px"><strong>Voltage:</strong> {{base_voltage_kv}} kV</div>
  <div style="font-size:12px"><strong>Container:</strong> {{container.name}}</div>
</div>`;

// ── Easy-mode attribute row ──────────────────────────────────────────────────

function EasyAttributeRow({
    attr,
    schema,
    targetClass,
    onChange,
    onRemove,
}: {
    attr: TooltipAttribute;
    schema: Record<string, any>;
    targetClass?: string;
    onChange: (a: TooltipAttribute) => void;
    onRemove: () => void;
}) {
    const isMobile = useMediaQuery('(max-width: 768px)');

    const classOptions = useMemo(() => {
        const all = Object.keys(schema).sort();
        const ordered = targetClass ? [targetClass, ...all.filter(c => c !== targetClass)] : all;
        return ordered.map(c => ({ value: c, label: c }));
    }, [schema, targetClass]);

    const attrOptions = useMemo(() => {
        const cls = attr.path.includes('.') ? attr.path.split('.')[0] : targetClass;
        if (!cls || !schema[cls]) return [];
        return (schema[cls].attributes as { name: string; is_complex?: boolean }[])
            .filter(a => !a.is_complex && a.name)
            .map(a => ({ value: `${cls}.${a.name}`, label: a.name }));
    }, [attr.path, schema, targetClass]);

    const selectedClass = attr.path.includes('.') ? attr.path.split('.')[0] : (targetClass ?? '');

    const handleClassChange = (cls: string | null) => {
        if (!cls) return;
        onChange({ ...attr, path: `${cls}.` });
    };

    const handleAttrChange = (fullPath: string | null) => {
        if (!fullPath) return;
        const derived = deriveAlias(fullPath);
        onChange({
            ...attr,
            path: fullPath,
            alias: derived,
            // Auto-fill label from attribute name only if still empty
            label: attr.label || derived,
        });
    };

    const labelInput = (
        <TextInput
            size="xs"
            placeholder="Label…"
            value={attr.label ?? ''}
            onChange={(e) => onChange({ ...attr, label: e.currentTarget.value })}
            style={{ width: isMobile ? undefined : 120, flex: isMobile ? 1 : undefined, flexShrink: 0 }}
        />
    );

    const classSelect = (
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
    );

    const attrSelect = (
        <Select
            size="xs"
            placeholder="Attribute…"
            value={attr.path || null}
            data={attrOptions}
            onChange={handleAttrChange}
            searchable
            disabled={!selectedClass}
            style={{ flex: 1, minWidth: 0 }}
            comboboxProps={{ withinPortal: false, zIndex: 2100 }}
            nothingFoundMessage="No attributes"
        />
    );

    const deleteBtn = (
        <ActionIcon variant="subtle" color="red" size="sm" onClick={onRemove}>
            <Trash2 size={14} />
        </ActionIcon>
    );

    if (isMobile) {
        return (
            <Box style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 8px 6px' }}>
                <Group gap="xs" wrap="nowrap" mb={6}>
                    {labelInput}
                    {deleteBtn}
                </Group>
                {classSelect}
                <Box mt={4}>{attrSelect}</Box>
            </Box>
        );
    }

    return (
        <Group gap="xs" wrap="nowrap" align="flex-start">
            {labelInput}
            {classSelect}
            {attrSelect}
            {deleteBtn}
        </Group>
    );
}

// ── HTML-mode attribute row ──────────────────────────────────────────────────

function HtmlAttributeRow({
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

    const classOptions = useMemo(() => {
        const all = Object.keys(schema).sort();
        const ordered = targetClass ? [targetClass, ...all.filter(c => c !== targetClass)] : all;
        return ordered.map(c => ({ value: c, label: c }));
    }, [schema, targetClass]);

    const attrOptions = useMemo(() => {
        const cls = attr.path.includes('.') ? attr.path.split('.')[0] : targetClass;
        if (!cls || !schema[cls]) return [];
        return (schema[cls].attributes as { name: string; is_complex?: boolean }[])
            .filter(a => !a.is_complex && a.name)
            .map(a => ({ value: `${cls}.${a.name}`, label: a.name }));
    }, [attr.path, schema, targetClass]);

    const selectedClass = attr.path.includes('.') ? attr.path.split('.')[0] : (targetClass ?? '');

    const handleClassChange = (cls: string | null) => {
        if (!cls) return;
        onChange({ ...attr, path: `${cls}.` });
    };

    const handleAttrChange = (fullPath: string | null) => {
        if (!fullPath) return;
        onChange({
            ...attr,
            path: fullPath,
            alias: attr.alias && attr.alias !== deriveAlias(attr.path) ? attr.alias : deriveAlias(fullPath),
        });
    };

    const tokenBadge = (
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
    );

    const aliasInput = (
        <TextInput
            size="xs"
            placeholder="alias"
            value={attr.alias}
            onChange={(e) => onChange({ ...attr, alias: e.currentTarget.value })}
            style={{ width: isMobile ? undefined : 90, flex: isMobile ? 1 : undefined, flexShrink: 0 }}
            styles={{ input: { fontFamily: 'monospace' } }}
        />
    );

    const classSelect = (
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
    );

    const attrSelect = (
        <Select
            size="xs"
            placeholder="Attribute…"
            value={attr.path || null}
            data={attrOptions}
            onChange={handleAttrChange}
            searchable
            disabled={!selectedClass}
            style={{ flex: 1, minWidth: 0 }}
            comboboxProps={{ withinPortal: false, zIndex: 2100 }}
            nothingFoundMessage="No attributes"
        />
    );

    const deleteBtn = (
        <ActionIcon variant="subtle" color="red" size="sm" onClick={onRemove}>
            <Trash2 size={14} />
        </ActionIcon>
    );

    if (isMobile) {
        return (
            <Box style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 8px 6px' }}>
                <Group gap="xs" wrap="nowrap" mb={6}>
                    {tokenBadge}
                    {aliasInput}
                    {deleteBtn}
                </Group>
                {classSelect}
                <Box mt={4}>{attrSelect}</Box>
            </Box>
        );
    }

    return (
        <Group gap="xs" wrap="nowrap" align="flex-start">
            {tokenBadge}
            {aliasInput}
            {classSelect}
            {attrSelect}
            {deleteBtn}
        </Group>
    );
}

// ── Locked attribute row (path-projected only) ──────────────────────────────

function LockedAttributeRow({
    projected,
    active,
    mode,
    onInsertToken,
    onAdd,
    onChangeLabel,
    onRemove,
}: {
    projected: { attr: string; alias: string };
    active: TooltipAttribute | undefined;
    mode: 'easy' | 'html';
    onInsertToken: (token: string) => void;
    onAdd: () => void;
    onChangeLabel: (label: string) => void;
    onRemove: () => void;
}) {
    const isMobile = useMediaQuery('(max-width: 768px)');
    const attrName = projected.attr.split('.').pop() ?? projected.alias;

    const tokenBadge = mode === 'html' && active ? (
        <Tooltip label={`Insert {{${active.alias}}} into template`} withArrow openDelay={300}>
            <Badge
                variant="outline"
                color="violet"
                radius="sm"
                style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, flexShrink: 0 }}
                onClick={() => onInsertToken(`{{${active.alias}}}`)}
            >
                {`{{${active.alias}}}`}
            </Badge>
        </Tooltip>
    ) : null;

    const attrBadge = (
        <Badge variant="light" color="teal" radius="sm" size="sm" style={{ fontFamily: 'monospace', flexShrink: 0 }}>
            {attrName}
        </Badge>
    );

    const labelInput = active ? (
        <TextInput
            size="xs"
            placeholder="Label…"
            value={active.label ?? ''}
            onChange={(e) => onChangeLabel(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 0 }}
        />
    ) : (
        <Text size="xs" c="dimmed" style={{ flex: 1 }}>{projected.alias}</Text>
    );

    const toggleBtn = active ? (
        <ActionIcon variant="subtle" color="red" size="sm" onClick={onRemove}>
            <Trash2 size={14} />
        </ActionIcon>
    ) : (
        <ActionIcon variant="subtle" color="teal" size="sm" onClick={onAdd}>
            <Plus size={14} />
        </ActionIcon>
    );

    const content = (
        <Group gap="xs" wrap="nowrap" align="center" style={{ opacity: active ? 1 : 0.45 }}>
            {mode === 'html' && tokenBadge ? tokenBadge : attrBadge}
            {labelInput}
            {toggleBtn}
        </Group>
    );

    if (isMobile && active) {
        return (
            <Box style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '8px 8px 6px' }}>
                {content}
            </Box>
        );
    }

    return content;
}

// ── Main component ───────────────────────────────────────────────────────────

export function TooltipConfigEditor({ value, onChange, targetClass, pathSteps }: TooltipConfigEditorProps) {
    const { schema } = useSchema();
    const [cursorPos, setCursorPos] = useState<number | null>(null);
    const isMobile = useMediaQuery('(max-width: 768px)');

    // Infer mode: explicit field wins; fall back on config content so existing html_template rules open in html mode
    const mode = value.tooltip_mode ?? (value.html_template ? 'html' : 'easy');
    const update = (patch: Partial<TooltipConfig>) => onChange({ ...value, ...patch });

    const attributes: TooltipAttribute[] = value.attributes ?? [];
    const template = value.html_template ?? '';

    const attrMap = useMemo(() => {
        const m: Record<string, string> = {};
        for (const a of attributes) if (a.alias && a.path) m[a.alias] = a.path;
        return m;
    }, [attributes]);

    // Collect all tooltip_attributes projected from path steps
    const projectedAttrs = useMemo((): Array<{ attr: string; alias: string }> => {
        if (!pathSteps) return [];
        return pathSteps.flatMap(s => s.tooltip_attributes ?? []);
    }, [pathSteps]);

    const addAttribute = () => {
        const initialPath = targetClass ? `${targetClass}.` : '';
        update({
            attributes: [
                ...attributes,
                { id: genId(), alias: '', path: initialPath, label: '' },
            ],
        });
    };

    const updateAttribute = (id: string, updated: TooltipAttribute) =>
        update({ attributes: attributes.map(a => a.id === id ? updated : a) });

    const removeAttribute = (id: string) =>
        update({ attributes: attributes.filter(a => a.id !== id) });

    const insertToken = (token: string) => {
        const pos = cursorPos ?? template.length;
        const next = template.slice(0, pos) + token + template.slice(pos);
        update({ html_template: next });
        setCursorPos(pos + token.length);
    };

    const previewHtml = mode === 'easy'
        ? renderEasyPreview(attributes)
        : (template ? renderPreview(template, attrMap) : '');

    // When path steps have projected attributes, restrict to those only
    const isPathLocked = projectedAttrs.length > 0;

    return (
        <Stack gap="sm">
            {/* Mode toggle */}
            <SegmentedControl
                size="xs"
                value={mode}
                onChange={(v) => update({ tooltip_mode: v as 'easy' | 'html' })}
                data={[
                    { value: 'easy', label: <Group gap={4} wrap="nowrap"><List size={12} /><span>Easy</span></Group> },
                    { value: 'html', label: <Group gap={4} wrap="nowrap"><Code2 size={12} /><span>HTML Template</span></Group> },
                ]}
            />

            {/* Attributes */}
            <Fieldset legend="Attributes" variant="default" p="xs">
                <Stack gap="xs">
                    {isPathLocked ? (
                        /* Path-locked: only projected attributes can be added */
                        <>
                            {projectedAttrs.length === 0 ? (
                                <Text size="xs" c="dimmed">No attributes exposed in the rule editor yet.</Text>
                            ) : (
                                projectedAttrs.map(pa => {
                                    const active = attributes.find(a => a.path === pa.attr);
                                    return (
                                        <LockedAttributeRow
                                            key={pa.attr}
                                            projected={pa}
                                            active={active}
                                            mode={mode}
                                            onInsertToken={insertToken}
                                            onAdd={() => update({
                                                attributes: [
                                                    ...attributes,
                                                    { id: genId(), alias: pa.alias, path: pa.attr, label: pa.alias },
                                                ],
                                            })}
                                            onChangeLabel={(label) => active && updateAttribute(active.id, { ...active, label })}
                                            onRemove={() => active && removeAttribute(active.id)}
                                        />
                                    );
                                })
                            )}
                            {projectedAttrs.length > 0 && (
                                <Text size="10px" c="dimmed" fs="italic">
                                    Expose more attributes in the rule editor path steps to add them here.
                                </Text>
                            )}
                        </>
                    ) : (
                        /* Free mode: full class/attribute picker */
                        <>
                            {attributes.length > 0 && !isMobile && (
                                mode === 'easy' ? (
                                    <Group gap="xs">
                                        <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ width: 120, flexShrink: 0 }}>Label</Text>
                                        <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ flex: 1 }}>Class</Text>
                                        <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ flex: 1 }}>Attribute</Text>
                                        <div style={{ width: 28 }} />
                                    </Group>
                                ) : (
                                    <Group gap="xs">
                                        <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ width: 80, flexShrink: 0 }}>Token</Text>
                                        <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ width: 90, flexShrink: 0 }}>Alias</Text>
                                        <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ flex: 1 }}>Class</Text>
                                        <Text size="10px" c="dimmed" fw={600} tt="uppercase" style={{ flex: 1 }}>Attribute</Text>
                                        <div style={{ width: 28 }} />
                                    </Group>
                                )
                            )}
                            {attributes.map(attr => (
                                mode === 'easy' ? (
                                    <EasyAttributeRow
                                        key={attr.id}
                                        attr={attr}
                                        schema={schema}
                                        targetClass={targetClass}
                                        onChange={(updated) => updateAttribute(attr.id, updated)}
                                        onRemove={() => removeAttribute(attr.id)}
                                    />
                                ) : (
                                    <HtmlAttributeRow
                                        key={attr.id}
                                        attr={attr}
                                        schema={schema}
                                        targetClass={targetClass}
                                        onInsertToken={insertToken}
                                        onChange={(updated) => updateAttribute(attr.id, updated)}
                                        onRemove={() => removeAttribute(attr.id)}
                                    />
                                )
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
                        </>
                    )}
                </Stack>
            </Fieldset>

            {/* HTML Template (html mode only) */}
            {mode === 'html' && (
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
            )}

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
