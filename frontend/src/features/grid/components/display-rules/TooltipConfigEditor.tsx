import { useState, useMemo, useEffect } from 'react';
import {
    Stack, Group, Text, Paper, Button,
    TextInput, Select, ActionIcon, Badge, Tooltip,
    Fieldset, Box, SegmentedControl, Loader,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Plus, Trash2, RotateCcw, List, Code2, ChevronRight, ChevronLeft, RefreshCw } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { type TooltipConfig, type TooltipAttribute, type PathStep, genId } from '../../model/rules';
import { useSchema } from '../../context/SchemaContext';

interface TooltipConfigEditorProps {
    value: TooltipConfig;
    onChange: (config: TooltipConfig) => void;
    targetClass?: string;
    /** Path steps from the CIM rule builder — exposes projected attributes as suggestions */
    pathSteps?: PathStep[];
    /** Resulting mRIDs from a 'Test Rule' action to use as live preview samples */
    testMrids?: string[];
    isEdge?: boolean;
}

// ── Sample data for live preview ────────────────────────────────────────────

const STATIC_SAMPLE: Record<string, string> = {
    name:              'XFMR-4207',
    mrid:              'A1B2C3D4-0000',
    description:       'Main feeder transformer',
    cim_class:         'PowerTransformer',
    base_voltage_kv:   '12.47',
    ratedS:            '500000',
    'container.name':  'Main Feeder',
};

function resolvePath(merged: any, path: string): string {
    if (!path || path.endsWith('.')) return '';
    
    // 1. Exact match
    if (merged[path] !== undefined) return String(merged[path]);

    // 2. Nested traversal
    const parts = path.split('.');
    let val: any = merged;
    for (const p of parts) {
        if (val == null || typeof val !== 'object') { val = null; break; }
        val = (val as any)[p];
    }
    if (val != null && val !== '') return String(val);

    // 3. Strip class prefix
    if (parts.length >= 2) {
        const unqualified = parts.slice(1).join('.');
        if (merged[unqualified] !== undefined) return String(merged[unqualified]);
        
        let uval: any = merged;
        for (const p of parts.slice(1)) {
            if (uval == null || typeof uval !== 'object') { uval = null; break; }
            uval = (uval as any)[p];
        }
        if (uval != null && uval !== '') return String(uval);
    }
    return '';
}

function renderPreview(tpl: string, attrMap: Record<string, string>, data: any): string {
    return tpl.replace(/\{\{([\w.]+)\}\}/g, (_m, token) => {
        const path = attrMap[token] ?? token;
        const resolved = resolvePath(data, path);
        return resolved || `{{${token}}}`;
    });
}

function renderEasyPreview(attrs: TooltipAttribute[], data: any): string {
    const rows = attrs
        .filter(a => a.path && !a.path.endsWith('.'))
        .map(a => {
            const val = resolvePath(data, a.path);
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
  <div style="font-size:12px"><strong>Voltage:</strong> {{base_voltage_kv}} kV</div>
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

export function TooltipConfigEditor({ value, onChange, targetClass, pathSteps, testMrids, isEdge }: TooltipConfigEditorProps) {
    const { schema } = useSchema();
    const isMobile = useMediaQuery('(max-width: 768px)');

    // Preview sample data management
    const [sampleIndex, setSampleIndex] = useState(0);
    const [sampleData, setSampleData] = useState<any>(STATIC_SAMPLE);
    const [isLoadingSample, setIsLoadingSample] = useState(false);

    useEffect(() => {
        const fetchSample = async () => {
            if (!testMrids || testMrids.length === 0) {
                setSampleData(STATIC_SAMPLE);
                return;
            }
            const mrid = testMrids[sampleIndex % testMrids.length];
            setIsLoadingSample(true);
            try {
                const endpoint = isEdge ? `/api/cim/equipment/${encodeURIComponent(mrid)}/expanded` : `/api/cim/node/${encodeURIComponent(mrid)}`;
                const res = await fetch(endpoint);
                if (res.ok) {
                    const data = await res.json();
                    setSampleData(data);
                }
            } catch (err) {
                console.error('Failed to fetch sample data', err);
            } finally {
                setIsLoadingSample(false);
            }
        };
        fetchSample();
    }, [testMrids, sampleIndex, isEdge]);

    // Infer mode
    const mode = value.tooltip_mode ?? (value.html_template ? 'html' : 'easy');
    const update = (patch: Partial<TooltipConfig>) => onChange({ ...value, ...patch });

    const attributes: TooltipAttribute[] = value.attributes ?? [];
    const template = value.html_template ?? '';

    const attrMap = useMemo(() => {
        const m: Record<string, string> = {};
        for (const a of attributes) if (a.alias && a.path) m[a.alias] = a.path;
        return m;
    }, [attributes]);

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

    const previewHtml = mode === 'easy'
        ? renderEasyPreview(attributes, sampleData)
        : (template ? renderPreview(template, attrMap, sampleData) : '');

    const isPathLocked = projectedAttrs.length > 0;

    return (
        <Stack gap="sm">
            <SegmentedControl
                size="xs"
                value={mode}
                onChange={(v) => update({ tooltip_mode: v as 'easy' | 'html' })}
                data={[
                    { value: 'easy', label: <Group gap={4} wrap="nowrap"><List size={12} /><span>Easy</span></Group> },
                    { value: 'html', label: <Group gap={4} wrap="nowrap"><Code2 size={12} /><span>HTML Template</span></Group> },
                ]}
            />

            <Fieldset legend="Attributes" variant="default" p="xs">
                <Stack gap="xs">
                    {isPathLocked ? (
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
                                            onInsertToken={() => {}} // Handle via editor
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
                        </>
                    ) : (
                        <>
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
                                        onInsertToken={() => {}} // Use badge above editor
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
                        {attributes.some(a => a.alias) && (
                            <Group gap={4} wrap="wrap">
                                {attributes.filter(a => a.alias).map(a => (
                                    <Badge
                                        key={a.id}
                                        variant="outline"
                                        color="violet"
                                        radius="sm"
                                        style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 10 }}
                                        title="Copy to clipboard"
                                        onClick={() => {
                                            navigator.clipboard.writeText(`{{${a.alias}}}`);
                                        }}
                                    >
                                        {`{{${a.alias}}}`}
                                    </Badge>
                                ))}
                            </Group>
                        )}

                        <Box style={{ border: '1px solid #373A40', borderRadius: 4, overflow: 'hidden' }}>
                            <Editor
                                height="250px"
                                defaultLanguage="html"
                                theme="vs-dark"
                                value={template}
                                onChange={(v) => update({ html_template: v || '' })}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 12,
                                    lineNumbers: 'off',
                                    scrollBeyondLastLine: false,
                                    wordWrap: 'on',
                                    padding: { top: 8, bottom: 8 }
                                }}
                            />
                        </Box>
                    </Stack>
                </Fieldset>
            )}

            {/* Preview Section */}
            <Box>
                <Group justify="space-between" mb={4}>
                    <Text size="10px" c="dimmed" tt="uppercase" fw={600}>
                        Preview {testMrids && testMrids.length > 0 ? `(Sample ${sampleIndex % testMrids.length + 1} of ${testMrids.length})` : '(Static Sample)'}
                    </Text>
                    
                    {testMrids && testMrids.length > 1 && (
                        <Group gap={4}>
                            {isLoadingSample && <Loader size={10} />}
                            <ActionIcon 
                                size="xs" 
                                variant="subtle" 
                                onClick={() => setSampleIndex(prev => prev === 0 ? testMrids.length - 1 : prev - 1)}
                            >
                                <ChevronLeft size={12} />
                            </ActionIcon>
                            <ActionIcon 
                                size="xs" 
                                variant="subtle" 
                                onClick={() => setSampleIndex(prev => prev + 1)}
                            >
                                <ChevronRight size={12} />
                            </ActionIcon>
                        </Group>
                    )}
                    
                    {testMrids && testMrids.length === 0 && (
                        <Text size="10px" c="dimmed" fs="italic">Click "Test Rule Match" below to use real samples</Text>
                    )}
                </Group>
                
                <Paper withBorder p="xs" bg="rgba(0,0,0,0.3)" style={{ position: 'relative', minHeight: 60, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {isLoadingSample && sampleIndex > 0 ? (
                        <Loader size="sm" />
                    ) : (
                        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                    )}
                </Paper>
                
                {sampleData && sampleData.mrid && (
                    <Text size="10px" c="dimmed" mt={4} ta="right" style={{ fontFamily: 'monospace' }}>
                        Previewing mRID: {sampleData.mrid}
                    </Text>
                )}
            </Box>
        </Stack>
    );
}
