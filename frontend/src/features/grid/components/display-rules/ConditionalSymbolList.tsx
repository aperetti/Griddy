import React from 'react';
import { 
    Stack, Group, Text, Button, ActionIcon, 
    Select, Paper, Divider, 
    rem, Tooltip, Badge 
} from '@mantine/core';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { CimRuleBuilder } from '../rules/CimRuleBuilder/CimRuleBuilder';
import { VisualConfigEditor } from './VisualConfigEditor';

interface ConditionalSymbol {
    conditions: any;
    icon?: string;
    svg?: string; // Legacy support
    color_hex?: string;
    size?: number;
    visual_type?: string;
    mode: 'replace' | 'add';
}

interface ConditionalSymbolListProps {
    symbols: ConditionalSymbol[];
    onChange: (symbols: ConditionalSymbol[]) => void;
    onOpenLiveEditor?: (initialValue: string, onSave: (val: string) => void) => void;
}

export const ConditionalSymbolList: React.FC<ConditionalSymbolListProps> = ({ 
    symbols = [], 
    onChange,
    onOpenLiveEditor
}) => {
    const addSymbol = () => {
        onChange([...symbols, { 
            conditions: { logical_op: 'AND', conditions: [] }, 
            icon: '', 
            mode: 'add',
            visual_type: 'Custom',
            size: 1.0
        }]);
    };

    const removeSymbol = (index: number) => {
        const next = [...symbols];
        next.splice(index, 1);
        onChange(next);
    };

    const updateSymbol = (index: number, val: Partial<ConditionalSymbol>) => {
        const next = [...symbols];
        next[index] = { ...next[index], ...val };
        onChange(next);
    };

    const moveSymbol = (index: number, direction: 'up' | 'down') => {
        const next = [...symbols];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= symbols.length) return;
        
        const temp = next[index];
        next[index] = next[newIndex];
        next[newIndex] = temp;
        onChange(next);
    };

    return (
        <Stack gap="md" mt="md">
            <Group justify="space-between">
                <Text fw={600} size="sm" c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: rem(1) }}>
                    Conditional Symbols
                </Text>
                <Button 
                    variant="light" 
                    size="xs" 
                    leftSection={<Plus size={14} />}
                    onClick={addSymbol}
                >
                    Add Symbol
                </Button>
            </Group>

            {symbols.length === 0 ? (
                <Paper withBorder p="xl" style={{ borderStyle: 'dashed', backgroundColor: 'transparent' }}>
                    <Stack align="center" gap="xs">
                        <Text size="sm" c="dimmed">No conditional symbols defined.</Text>
                        <Text size="xs" c="dimmed" ta="center">
                            Use these to override the default appearance when specific CIM properties are met.
                        </Text>
                    </Stack>
                </Paper>
            ) : (
                symbols.map((symbol, idx) => (
                    <Paper key={idx} withBorder p="md" shadow="sm">
                        <Stack gap="sm">
                            <Group justify="space-between">
                                <Group gap="xs">
                                    <Badge color="blue" variant="light">Symbol #{idx + 1}</Badge>
                                    <Select
                                        size="xs"
                                        placeholder="Mode"
                                        value={symbol.mode}
                                        onChange={(v) => updateSymbol(idx, { mode: v as any })}
                                        data={[
                                            { value: 'replace', label: 'Replace Base' },
                                            { value: 'add', label: 'Add Overlay' }
                                        ]}
                                        style={{ width: rem(120) }}
                                        comboboxProps={{ zIndex: 2000, withinPortal: true }}
                                    />
                                </Group>
                                <Group gap="xs">
                                    <Tooltip label="Move Up">
                                        <ActionIcon 
                                            size="sm" 
                                            variant="subtle" 
                                            disabled={idx === 0}
                                            onClick={() => moveSymbol(idx, 'up')}
                                        >
                                            <ChevronUp size={14} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="Move Down">
                                        <ActionIcon 
                                            size="sm" 
                                            variant="subtle" 
                                            disabled={idx === symbols.length - 1}
                                            onClick={() => moveSymbol(idx, 'down')}
                                        >
                                            <ChevronDown size={14} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="Remove Symbol" color="red">
                                        <ActionIcon 
                                            size="sm" 
                                            variant="subtle" 
                                            color="red"
                                            onClick={() => removeSymbol(idx)}
                                        >
                                            <Trash2 size={14} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>

                            <Divider label="Conditions" labelPosition="left" />
                            <CimRuleBuilder 
                                value={symbol.conditions}
                                onChange={(conds) => updateSymbol(idx, { conditions: conds })}
                            />

                            <VisualConfigEditor 
                                legend="Override Visuals"
                                config={{
                                    visual_type: symbol.visual_type,
                                    color_hex: symbol.color_hex,
                                    size: symbol.size,
                                    icon: symbol.icon || symbol.svg // Fallback to svg if icon is missing
                                }}
                                onChange={(val) => updateSymbol(idx, val)}
                                onOpenLiveEditor={onOpenLiveEditor}
                            />
                        </Stack>
                    </Paper>
                ))
            )}
        </Stack>
    );
};

