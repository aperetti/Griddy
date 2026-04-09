import React, { useState, useMemo } from 'react';
import {
    Stack, Group, Text, Paper, Divider,
    Button, Alert, Fieldset, SegmentedControl, rem,
    TextInput, NumberInput, Switch, Grid, Badge,
    Code, Collapse, Tooltip, ActionIcon, Loader
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
    Info, ListOrdered,
    Type, ZoomIn, LayoutGrid, Play,
    ChevronDown, ChevronUp, AlertCircle, Copy, Check
} from 'lucide-react';
import { CimRuleBuilder } from '../rules/CimRuleBuilder/CimRuleBuilder';
import { ConditionalSymbolList } from './ConditionalSymbolList';
import { VisualConfigEditor } from './VisualConfigEditor';
import { TooltipConfigEditor } from './TooltipConfigEditor';
import { EdgeStyleEditor } from './EdgeStyleEditor';
import { type RuleTestResponse } from '../../../../shared/api';
import { DEFAULT_TOOLTIP_CONFIG } from '../../model/rules';

interface RuleEditorProps {
    rule: any;
    onChange: (val: any) => void;
    onSave: () => void;
    onCancel: () => void;
    onOpenLiveEditor?: (initialValue: string, onSave: (val: string) => void) => void;
    onTest?: (conditions: any, targetClass: string) => Promise<RuleTestResponse>;
    error?: string | null;
}

export const RuleEditor: React.FC<RuleEditorProps> = ({ 
    rule, 
    onChange, 
    onSave, 
    onCancel,
    onOpenLiveEditor,
    onTest,
    error 
}) => {
    const [activeTab, setActiveTab] = useState<'basic' | 'conditional'>('basic');
    const [testResults, setTestResults] = useState<RuleTestResponse | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [showQuery, setShowQuery] = useState(false);
    const [copied, setCopied] = useState(false);
    const isMobile = useMediaQuery('(max-width: 768px)');

    // Auto-clear test results when conditions change
    const [lastConditions, setLastConditions] = useState('');
    const currentConditionsStr = JSON.stringify(rule.match_conditions);
    
    if (currentConditionsStr !== lastConditions) {
        setLastConditions(currentConditionsStr);
        setTestResults(null);
    }

    const updateConfig = (val: any) => {
        onChange({
            ...rule,
            config: { ...(rule.config || {}), ...val }
        });
    };

    const parsedConditions = useMemo(() => {
        const mc = rule.match_conditions;
        if (!mc) return {};
        return typeof mc === 'string'
            ? (() => { try { return JSON.parse(mc); } catch { return {}; } })()
            : mc;
    }, [rule.match_conditions]);

    const targetClass: string | undefined = parsedConditions?.target_class;
    const isEdgeRule = parsedConditions?.entity_type === 'edge';

    const handleTest = async () => {
        if (!onTest) return;
        setIsTesting(true);
        try {
            const conds = typeof rule.match_conditions === 'string' 
                ? JSON.parse(rule.match_conditions) 
                : rule.match_conditions;
            
            const targetClass = conds?.target_class || 'PowerSystemResource';
            const res = await onTest(conds, targetClass);
            setTestResults(res);
        } catch (err) {
            console.error('Test failed', err);
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <Stack gap="lg">
            <Paper withBorder p="md">
                <Grid gutter="md">
                    <Grid.Col span={{ base: 12, sm: 6 }}>
                        <TextInput
                            label="Rule Name"
                            placeholder="e.g. Medium Voltage Busbar"
                            value={rule.name || ''}
                            onChange={(e) => onChange({ ...rule, name: e.currentTarget.value })}
                            required
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 3 }}>
                        <NumberInput
                            label="Priority"
                            description="Higher priority matches first"
                            value={rule.priority}
                            onChange={(v) => onChange({ ...rule, priority: Number(v) })}
                        />
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, sm: 3 }}>
                        <Stack gap={0} mt={rem(25)}>
                            <Switch
                                label="Rule Enabled"
                                checked={rule.enabled}
                                onChange={(e) => onChange({ ...rule, enabled: e.currentTarget.checked })}
                            />
                        </Stack>
                    </Grid.Col>
                </Grid>
            </Paper>

            <SegmentedControl
                value={activeTab}
                onChange={(v: any) => setActiveTab(v)}
                data={[
                    { label: <Group gap="xs"><Type size={14} />Basic Styling</Group>, value: 'basic' },
                    { label: <Group gap="xs"><ListOrdered size={14} />Conditional Symbols</Group>, value: 'conditional' }
                ]}
                fullWidth
            />

            {activeTab === 'basic' ? (
                <Stack gap="md">
                    <Fieldset legend="Match Conditions" variant="default">
                        <CimRuleBuilder 
                            value={rule.match_conditions}
                            onChange={(v) => onChange({ ...rule, match_conditions: v })}
                        />
                    </Fieldset>

                    {isEdgeRule ? (
                        <EdgeStyleEditor
                            config={rule.config || {}}
                            onChange={updateConfig}
                            onOpenLiveEditor={onOpenLiveEditor}
                        />
                    ) : (
                        <VisualConfigEditor
                            config={rule.config || {}}
                            onChange={updateConfig}
                            onOpenLiveEditor={onOpenLiveEditor}
                        />
                    )}

                    <Fieldset legend="Tooltip Appearance" variant="default">
                        <TooltipConfigEditor
                            value={rule.config?.tooltip_config || DEFAULT_TOOLTIP_CONFIG}
                            onChange={(tc) => updateConfig({ tooltip_config: tc })}
                            targetClass={targetClass}
                        />
                    </Fieldset>

                    <Fieldset legend="Level of Detail & Clustering" variant="default">
                       <Grid gutter="md">
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <Group gap="xs" mb="xs">
                                    <ZoomIn size={16} color="gray" />
                                    <Text size="sm" fw={500}>Zoom Range Visibility</Text>
                                </Group>
                                <Group grow gap="xs">
                                    <NumberInput
                                        label="Min Zoom"
                                        min={0} max={24}
                                        value={rule.config?.min_zoom || 0}
                                        onChange={(v) => updateConfig({ min_zoom: Number(v) })}
                                    />
                                    <NumberInput
                                        label="Max Zoom"
                                        min={0} max={24}
                                        value={rule.config?.max_zoom || 24}
                                        onChange={(v) => updateConfig({ max_zoom: Number(v) })}
                                    />
                                </Group>
                            </Grid.Col>
                            
                            <Grid.Col span={{ base: 12, sm: 6 }}>
                                <Group gap="xs" mb="xs">
                                    <LayoutGrid size={16} color="gray" />
                                    <Text size="sm" fw={500}>Clustering Behavior</Text>
                                </Group>
                                <Stack gap="xs">
                                    <Switch
                                        label="Enable Clustering"
                                        checked={rule.config?.cluster_enabled}
                                        onChange={(e) => updateConfig({ cluster_enabled: e.currentTarget.checked })}
                                    />
                                    {rule.config?.cluster_enabled && (
                                        <Grid gutter="xs">
                                            <Grid.Col span={6}>
                                                <NumberInput
                                                    label="Cluster Radius"
                                                    size="xs"
                                                    value={rule.config?.cluster_radius || 40}
                                                    onChange={(v) => updateConfig({ cluster_radius: Number(v) })}
                                                />
                                            </Grid.Col>
                                            <Grid.Col span={6}>
                                                <NumberInput
                                                    label="Min Points"
                                                    size="xs"
                                                    value={rule.config?.cluster_min_points || 2}
                                                    onChange={(v) => updateConfig({ cluster_min_points: Number(v) })}
                                                />
                                            </Grid.Col>
                                        </Grid>
                                    )}
                                </Stack>
                            </Grid.Col>
                       </Grid>
                    </Fieldset>
                </Stack>
            ) : (
                <ConditionalSymbolList
                    symbols={rule.config?.svg_overrides || []}
                    onChange={(symbols) => updateConfig({ svg_overrides: symbols })}
                    onOpenLiveEditor={onOpenLiveEditor}
                    targetClass={targetClass}
                />
            )}

            {error && (
                <Alert color="red" icon={<Info size={16} />} title="Save Error">
                    {error}
                </Alert>
            )}

            <Paper withBorder p="sm" bg="rgba(0, 0, 0, 0.15)">
                <Stack gap="xs">
                    <Group justify="space-between" wrap="wrap" gap="xs">
                        <Group gap="xs">
                            <Button
                                variant="light"
                                color="teal"
                                size="xs"
                                fullWidth={isMobile}
                                leftSection={isTesting ? <Loader size={14} /> : <Play size={14} />}
                                onClick={handleTest}
                                loading={isTesting}
                            >
                                Test Rule Match
                            </Button>

                            {testResults && (
                                <Badge color={testResults.match_count > 0 ? 'green' : 'gray'} variant="filled">
                                    {testResults.match_count} Matches Found
                                </Badge>
                            )}
                        </Group>

                        {testResults && (
                            <Button
                                variant="subtle"
                                size="xs"
                                color="gray"
                                fullWidth={isMobile}
                                rightSection={showQuery ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                onClick={() => setShowQuery(!showQuery)}
                            >
                                {showQuery ? 'Hide Query' : 'View Generated Query'}
                            </Button>
                        )}
                    </Group>

                    {testResults?.warnings && testResults.warnings.length > 0 && (
                        <Alert color="orange" icon={<AlertCircle size={16} />} p="xs">
                           <Stack gap={4}>
                                {testResults.warnings.map((w, i) => (
                                    <Text key={i} size="xs">{w}</Text>
                                ))}
                           </Stack>
                        </Alert>
                    )}

                    <Collapse in={showQuery}>
                        <Stack gap="xs" mt="xs">
                            <Group justify="space-between" align="center">
                                <Text size="xs" c="dimmed" fw={500}>Generated Cypher Query:</Text>
                                <Tooltip label={copied ? 'Copied!' : 'Copy query with params'} withArrow>
                                    <ActionIcon
                                        size="xs"
                                        variant="subtle"
                                        color={copied ? 'teal' : 'gray'}
                                        onClick={() => {
                                            if (!testResults?.query) return;
                                            const params = testResults.params ?? {};
                                            let full = testResults.query;
                                            Object.entries(params).forEach(([key, val]) => {
                                                full = full.replaceAll(`$${key}`, JSON.stringify(val));
                                            });
                                            // navigator.clipboard requires HTTPS + focus — not reliable on mobile.
                                            // Fall back to textarea execCommand for broad compatibility.
                                            const fallback = () => {
                                                const ta = document.createElement('textarea');
                                                ta.value = full;
                                                ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
                                                document.body.appendChild(ta);
                                                ta.focus();
                                                ta.select();
                                                document.execCommand('copy');
                                                document.body.removeChild(ta);
                                            };
                                            if (navigator.clipboard) {
                                                navigator.clipboard.writeText(full).catch(fallback);
                                            } else {
                                                fallback();
                                            }
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 2000);
                                        }}
                                    >
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                    </ActionIcon>
                                </Tooltip>
                            </Group>
                            <Code block style={{ fontSize: rem(11), maxHeight: rem(150), overflowY: 'auto' }}>
                                {testResults?.query || 'No query generated'}
                            </Code>
                            {testResults?.params && Object.keys(testResults.params).length > 0 && (
                                <>
                                    <Text size="xs" c="dimmed" fw={500}>Parameters:</Text>
                                    <Code block style={{ fontSize: rem(11) }}>
                                        {JSON.stringify(testResults.params, null, 2)}
                                    </Code>
                                </>
                            )}
                        </Stack>
                    </Collapse>
                </Stack>
            </Paper>

            <Divider my="md" />

            <Group justify={isMobile ? 'stretch' : 'flex-end'} grow={isMobile}>
                <Button variant="subtle" color="gray" fullWidth={isMobile} onClick={onCancel}>Cancel</Button>
                <Button variant="filled" color="blue" fullWidth={isMobile} onClick={onSave}>Save Rule</Button>
            </Group>
        </Stack>
    );
};
