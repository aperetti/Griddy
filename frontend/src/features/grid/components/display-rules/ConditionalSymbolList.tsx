import React, { useState, useMemo } from 'react';
import {
    Stack, Group, Text, Button, ActionIcon,
    Select, Paper, Divider, Collapse,
    rem, Tooltip, Badge
} from '@mantine/core';
import { Plus, Trash2, ChevronUp, ChevronDown, MessageSquare } from 'lucide-react';
import { CimRuleBuilder } from '../rules/CimRuleBuilder/CimRuleBuilder';
import { VisualConfigEditor } from './VisualConfigEditor';
import { TooltipConfigEditor } from './TooltipConfigEditor';
import { EdgeStyleEditor } from './EdgeStyleEditor';
import { type TooltipConfig, DEFAULT_TOOLTIP_CONFIG, type PathStep } from '../../model/rules';

interface ConditionalStyle {
    conditions: any;
    icon?: string;
    svg?: string;
    color_hex?: string;
    size?: number;
    visual_type?: string;
    mode: 'replace' | 'add';
    tooltip_config?: TooltipConfig | null;
    // Edge properties
    line_weight?: number;
    line_style?: 'solid' | 'dashed' | 'dotted';
    center_icon_enabled?: boolean;
    center_icon_size?: number;
    center_icon_rotate?: boolean;
}

interface ConditionalStyleListProps {
    symbols: ConditionalStyle[];
    onChange: (symbols: ConditionalStyle[]) => void;
    onOpenLiveEditor?: (initialValue: string, onSave: (val: string) => void, baseSvg?: string, baseColor?: string) => void;
    onTest?: (conditions: any, targetClass: string) => Promise<any>;
    targetClass?: string;
    baseSvg?: string;
    baseColor?: string;
    baseTooltipConfig?: TooltipConfig;
    basePathSteps?: PathStep[];
    isEdgeRule?: boolean;
}

function StyleRow({
    symbol, index, total, targetClass, onChange, onRemove, onMove, onOpenLiveEditor, onTest, baseSvg, baseColor, isEdgeRule, baseTooltipConfig, basePathSteps
}: {
    symbol: ConditionalStyle;
    index: number;
    total: number;
    targetClass?: string;
    onChange: (patch: Partial<ConditionalStyle>) => void;
    onRemove: () => void;
    onMove: (dir: 'up' | 'down') => void;
    onOpenLiveEditor?: (initialValue: string, onSave: (val: string) => void, baseSvg?: string, baseColor?: string) => void;
    onTest?: (conditions: any, targetClass: string) => Promise<any>;
    baseSvg?: string;
    baseColor?: string;
    isEdgeRule?: boolean;
    baseTooltipConfig?: TooltipConfig;
    basePathSteps?: PathStep[];
}) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResults, setTestResults] = useState<{ match_count: number } | null>(null);
    const hasTooltip = !!symbol.tooltip_config;

    const handleTest = async () => {
        if (!onTest || !targetClass) return;
        setIsTesting(true);
        try {
            const res = await onTest(symbol.conditions, targetClass);
            setTestResults(res);
        } catch (err) {
            console.error('Test failed', err);
        } finally {
            setIsTesting(false);
        }
    };

    const mergedPathSteps = useMemo(() => {
        const base = basePathSteps || [];
        const over = symbol.conditions?.path_steps || [];
        return [...base, ...over];
    }, [basePathSteps, symbol.conditions?.path_steps]);

    const localTargetClass = useMemo(() => {
        if (symbol.conditions?.path_steps?.length) {
            return symbol.conditions.path_steps[symbol.conditions.path_steps.length - 1].class;
        }
        return targetClass;
    }, [symbol.conditions, targetClass]);

    return (
        <Paper withBorder p="md" shadow="sm">
            <Stack gap="sm">
                <Group justify="space-between">
                    <Group gap="xs">
                        <Badge color="blue" variant="light">Style #{index + 1}</Badge>
                        <Select
                            size="xs"
                            placeholder="Mode"
                            value={symbol.mode}
                            onChange={(v) => onChange({ mode: v as any })}
                            data={[
                                { value: 'replace', label: 'Replace Base' },
                                { value: 'add', label: 'Add Overlay' },
                            ]}
                            style={{ width: rem(120) }}
                            comboboxProps={{ zIndex: 2000, withinPortal: true }}
                        />
                        {onTest && (
                            <Group gap={4}>
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    color="teal"
                                    onClick={handleTest}
                                    loading={isTesting}
                                >
                                    Test
                                </Button>
                                {testResults && (
                                    <Badge size="xs" color={testResults.match_count > 0 ? 'green' : 'gray'}>
                                        {testResults.match_count}
                                    </Badge>
                                )}
                            </Group>
                        )}
                    </Group>
                    <Group gap="xs">
                        <Tooltip label="Move Up">
                            <ActionIcon size="sm" variant="subtle" disabled={index === 0} onClick={() => onMove('up')}>
                                <ChevronUp size={14} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Move Down">
                            <ActionIcon size="sm" variant="subtle" disabled={index === total - 1} onClick={() => onMove('down')}>
                                <ChevronDown size={14} />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Remove Style" color="red">
                            <ActionIcon size="sm" variant="subtle" color="red" onClick={onRemove}>
                                <Trash2 size={14} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Group>

                <Divider label="Conditions" labelPosition="left" />
                <CimRuleBuilder
                    value={symbol.conditions}
                    onChange={(conds) => onChange({ conditions: conds })}
                />

                {isEdgeRule ? (
                    <EdgeStyleEditor
                        config={{
                            ...symbol,
                            icon: symbol.svg || symbol.icon,
                        } as any}
                        baseSvg={baseSvg}
                        baseColor={baseColor}
                        onChange={(val) => {
                            const patch = { ...val };
                            // If updating icon content, clear shadowing svg
                            if ('icon' in patch) patch.svg = undefined;
                            onChange(patch);
                        }}
                        onOpenLiveEditor={onOpenLiveEditor}
                    />
                ) : (
                    <VisualConfigEditor
                        legend="Override Visuals"
                        config={{
                            visual_type: symbol.visual_type,
                            color_hex: symbol.color_hex,
                            size: symbol.size,
                            svg: symbol.svg || symbol.icon,
                            mode: symbol.mode,
                        }}
                        baseSvg={baseSvg}
                        baseColor={baseColor}
                        onChange={(val) => {
                            const patch = { ...val };
                            // If updating svg content, clear shadowing icon
                            if ('svg' in patch) patch.icon = undefined;
                            onChange(patch);
                        }}
                        onOpenLiveEditor={onOpenLiveEditor}
                    />
                )}

                <Divider
                    label={
                        <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => setShowTooltip(v => !v)}>
                            <MessageSquare size={12} />
                            <Text size="xs">Override Tooltip</Text>
                            {hasTooltip && <Badge size="xs" color="teal" variant="dot">configured</Badge>}
                            {showTooltip ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        </Group>
                    }
                    labelPosition="left"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setShowTooltip(v => !v)}
                />
                <Collapse in={showTooltip}>
                    <Stack gap="xs">
                        <Group justify="flex-end">
                            {hasTooltip ? (
                                <Button size="xs" variant="subtle" color="red" onClick={() => onChange({ tooltip_config: null })}>
                                    Remove override tooltip
                                </Button>
                            ) : (
                                <Button size="xs" variant="subtle" onClick={() => onChange({ tooltip_config: baseTooltipConfig || DEFAULT_TOOLTIP_CONFIG })}>
                                    Add override tooltip
                                </Button>
                            )}
                        </Group>
                        {hasTooltip && (
                            <TooltipConfigEditor
                                value={symbol.tooltip_config!}
                                onChange={(tc) => onChange({ tooltip_config: tc })}
                                targetClass={localTargetClass}
                                pathSteps={mergedPathSteps}
                            />
                        )}
                    </Stack>
                </Collapse>
            </Stack>
        </Paper>
    );
}

export const ConditionalSymbolList: React.FC<ConditionalStyleListProps> = ({
    symbols = [],
    onChange,
    onOpenLiveEditor,
    onTest,
    targetClass,
    baseSvg,
    baseColor,
    baseTooltipConfig,
    basePathSteps,
    isEdgeRule,
}) => {
    const addSymbol = () => {
        onChange([...symbols, {
            conditions: { logical_op: 'AND', conditions: [] },
            icon: '',
            mode: 'add',
            visual_type: 'Custom',
            size: 1.0,
        }]);
    };

    const updateSymbol = (index: number, patch: Partial<ConditionalStyle>) => {
        const next = [...symbols];
        next[index] = { ...next[index], ...patch };
        onChange(next);
    };

    const removeSymbol = (index: number) => {
        const next = [...symbols];
        next.splice(index, 1);
        onChange(next);
    };

    const moveSymbol = (index: number, direction: 'up' | 'down') => {
        const next = [...symbols];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= symbols.length) return;
        [next[index], next[newIndex]] = [next[newIndex], next[index]];
        onChange(next);
    };

    return (
        <Stack gap="md" mt="md">
            <Group justify="space-between">
                <Text fw={600} size="sm" c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: rem(1) }}>
                    Conditional Styling
                </Text>
                <Button variant="light" size="xs" leftSection={<Plus size={14} />} onClick={addSymbol}>
                    Add Style
                </Button>
            </Group>

            {symbols.length === 0 ? (
                <Paper withBorder p="xl" style={{ borderStyle: 'dashed', backgroundColor: 'transparent' }}>
                    <Stack align="center" gap="xs">
                        <Text size="sm" c="dimmed">No conditional styles defined.</Text>
                        <Text size="xs" c="dimmed" ta="center">
                            Use these to override the default appearance when specific CIM properties are met.
                        </Text>
                    </Stack>
                </Paper>
            ) : (
                symbols.map((symbol, idx) => (
                    <StyleRow
                        key={idx}
                        symbol={symbol}
                        index={idx}
                        total={symbols.length}
                        targetClass={targetClass}
                        baseSvg={baseSvg}
                        baseColor={baseColor}
                        baseTooltipConfig={baseTooltipConfig}
                        basePathSteps={basePathSteps}
                        isEdgeRule={isEdgeRule}
                        onChange={(patch) => updateSymbol(idx, patch)}
                        onRemove={() => removeSymbol(idx)}
                        onMove={(dir) => moveSymbol(idx, dir)}
                        onOpenLiveEditor={onOpenLiveEditor}
                        onTest={onTest}
                    />
                ))
            )}
        </Stack>
    );
};
