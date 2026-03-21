import React, { useState, useEffect } from 'react';
import { 
    Table, Button, Group, ActionIcon, 
    Stack, Text, Badge, Select, TextInput, 
    NumberInput, JsonInput, Paper, Divider,
    Autocomplete, ColorInput, ColorSwatch, Avatar,
    Alert
} from '@mantine/core';
import { Plus, Trash2, Edit2, X, AlertCircle } from 'lucide-react';
import { AnalysisWindow } from '../../analytics/components/AnalysisWindow';
import {
    fetchDisplayConfigs, fetchDisplayRules,
    saveDisplayRule, deleteDisplayRule,
    setDefaultDisplayConfig,
    type DisplayConfig, type DisplayRule
} from '../../../shared/api';
import { CimRuleBuilder } from './CimRuleBuilder';

interface DisplayRulesManagerProps {
    opened: boolean;
    onClose: () => void;
}

const ICON_SUGGESTIONS = [
    'mdi:transformer',
    'mdi:transmission-tower',
    'mdi:electric-switch',
    'mdi:meter-electric',
    'mdi:factory',
    'mdi:home',
    'mdi:office-building',
    'mdi:lightning-bolt',
    'mdi:alert-circle',
    'mdi:check-circle',
    'mdi:alpha-t-box',
    'mdi:alpha-s-box',
    'mdi:alpha-m-box',
    'mdi:alpha-c-box',
    'mdi:fuse',
    'mdi:recloser'
];

export const DisplayRulesManager: React.FC<DisplayRulesManagerProps> = ({ opened, onClose }) => {
    const [configs, setConfigs] = useState<DisplayConfig[]>([]);
    const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
    const [rules, setRules] = useState<DisplayRule[]>([]);
    const [editingRule, setEditingRule] = useState<Partial<DisplayRule> | null>(null);
    const [useBuilder, setUseBuilder] = useState(true);
    const [configError, setConfigError] = useState<string | null>(null);

    useEffect(() => {
        if (opened) {
            loadConfigs();
        }
    }, [opened]);

    useEffect(() => {
        if (selectedConfigId) {
            loadRules(selectedConfigId);
        }
    }, [selectedConfigId]);

    const loadConfigs = async () => {
        try {
            setConfigError(null);
            const data = await fetchDisplayConfigs();
            if (!Array.isArray(data)) {
                throw new Error('Backend returned invalid data structure (404?)');
            }
            setConfigs(data);
            if (data.length > 0 && !selectedConfigId) {
                const def = data.find(c => c.is_default) || data[0];
                setSelectedConfigId(def.id);
            }
        } catch (err: any) {
            console.error('Failed to load configs', err);
            setConfigs([]);
            setConfigError(err.message || 'Failed to connect to display service. Ensure the main-backend is running.');
        }
    };

    const loadRules = async (configId: number) => {
        try {
            const data = await fetchDisplayRules(configId);
            setRules(data.sort((a, b) => b.priority - a.priority));
        } catch (err) {
            console.error('Failed to load rules', err);
        }
    };

    const handleSetDefault = async (configId: number) => {
        try {
            await setDefaultDisplayConfig(configId);
            loadConfigs();
        } catch (err) {
            console.error('Failed to set default', err);
        }
    };

    const handleSaveRule = async () => {
        if (!editingRule || !selectedConfigId) return;
        try {
            await saveDisplayRule({ ...editingRule, config_id: selectedConfigId });
            setEditingRule(null);
            loadRules(selectedConfigId);
        } catch (err) {
            console.error('Failed to save rule', err);
        }
    };

    const handleDeleteRule = async (ruleId: number) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            await deleteDisplayRule(ruleId);
            if (selectedConfigId) loadRules(selectedConfigId);
        } catch (err) {
            console.error('Failed to delete rule', err);
        }
    };

    const handleAddRule = () => {
        setEditingRule({
            name: 'New Rule',
            priority: 0,
            match_conditions: '{}',
            visual_type: 'Custom',
            color_hex: ''
        });
    };

    return (
        <AnalysisWindow
            isOpen={opened}
            onClose={onClose}
            title="Display Rules Manager"
            storageKey="display-rules-manager"
        >
            <Stack gap="md" h="100%">
                {configError && (
                    <Alert icon={<AlertCircle size={16} />} title="Backend Error" color="red" variant="light">
                        {configError}
                    </Alert>
                )}
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Select
                        label="Configuration Profile"
                        placeholder="Select a profile"
                        data={Array.isArray(configs) ? configs.map(c => ({ value: c.id.toString(), label: c.name + (c.is_default ? ' (Default)' : '') })) : []}
                        value={selectedConfigId?.toString()}
                        onChange={(val) => setSelectedConfigId(val ? parseInt(val) : null)}
                        style={{ flex: 1 }}
                        size="xs"
                    />
                    <Button
                        variant="light"
                        color="blue"
                        size="xs"
                        mt={window.innerWidth < 600 ? 0 : 20}
                        disabled={!selectedConfigId || configs.find(c => c.id === selectedConfigId)?.is_default}
                        onClick={() => selectedConfigId && handleSetDefault(selectedConfigId)}
                    >
                        Set Default
                    </Button>
                </Group>

                <Divider label="Rules Priority" labelPosition="center" />

                <Paper withBorder p="xs" style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)' }}>
                    {editingRule ? (
                        <Stack gap="sm">
                            <Group justify="space-between">
                                <Text fw={700} size="xs">{editingRule.id ? "Edit Rule" : "Add New Rule"}</Text>
                                <ActionIcon variant="subtle" size="xs" onClick={() => setEditingRule(null)}>
                                    <X size={14} />
                                </ActionIcon>
                            </Group>
                            <TextInput
                                label="Rule Name"
                                placeholder="e.g. Substation Regulators"
                                value={editingRule?.name || ''}
                                onChange={(e) => setEditingRule(prev => prev ? { ...prev, name: e.target.value } : null)}
                                size="xs"
                            />
                            <Group grow>
                                <TextInput
                                    label="Visual Type Override"
                                    placeholder="e.g. Regulator"
                                    value={editingRule?.visual_type || ''}
                                    onChange={(e) => setEditingRule(prev => prev ? { ...prev, visual_type: e.target.value } : null)}
                                    size="xs"
                                />
                                <NumberInput
                                    label="Priority"
                                    value={editingRule?.priority || 0}
                                    onChange={(val) => setEditingRule(prev => prev ? { ...prev, priority: typeof val === 'number' ? val : 0 } : null)}
                                    size="xs"
                                />
                            </Group>
                            <Group justify="space-between" align="center">
                                <Text size="xs" fw={500}>Match Conditions</Text>
                                <Button
                                    variant="subtle"
                                    size="compact-xs"
                                    onClick={() => setUseBuilder(!useBuilder)}
                                >
                                    {useBuilder ? "Switch to JSON" : "Switch to Builder"}
                                </Button>
                            </Group>

                            {useBuilder ? (
                                <CimRuleBuilder
                                    value={editingRule?.match_conditions || '{}'}
                                    onChange={(val) => setEditingRule(prev => prev ? { ...prev, match_conditions: val } : null)}
                                />
                            ) : (
                                <JsonInput
                                    placeholder='{"equipment_type": "PowerTransformer", "properties": {"name": "Regulator"}}'
                                    validationError="Invalid JSON"
                                    formatOnBlur
                                    autosize
                                    minRows={4}
                                    value={editingRule?.match_conditions || '{}'}
                                    onChange={(val) => setEditingRule(prev => prev ? { ...prev, match_conditions: val } : null)}
                                    size="xs"
                                />
                            )}
                            <Group py="sm" align="flex-end">
                                <Stack gap={4} style={{ flex: 1 }}>
                                    <Autocomplete
                                        label="Icon (optional)"
                                        placeholder="e.g. mdi:transformer"
                                        data={ICON_SUGGESTIONS}
                                        value={editingRule?.icon || ''}
                                        onChange={(val: string) => setEditingRule(prev => prev ? { ...prev, icon: val } : null)}
                                        size="xs"
                                        comboboxProps={{ withinPortal: true, zIndex: 1100 }}
                                        renderOption={({ option }: { option: any }) => (
                                            <Group gap="xs">
                                                <Avatar 
                                                    src={`https://api.iconify.design/${option.value.replace(':', '/')}.svg`} 
                                                    size="xs" 
                                                    radius="0"
                                                    styles={{ image: { filter: 'invert(1)' } }}
                                                />
                                                <Text size="xs">{option.value}</Text>
                                            </Group>
                                        )}
                                    />
                                </Stack>
                                {editingRule?.icon && (
                                    <Avatar 
                                        src={`https://api.iconify.design/${editingRule.icon.replace(':', '/')}.svg`} 
                                        size="sm" 
                                        radius="0"
                                        mb={4}
                                        styles={{ image: { filter: 'invert(1)' } }}
                                    />
                                )}
                                <ColorInput
                                    label="Color (optional)"
                                    placeholder="#FF7800"
                                    value={editingRule?.color_hex || ''}
                                    onChange={(val: string) => setEditingRule(prev => prev ? { ...prev, color_hex: val } : null)}
                                    style={{ width: 140 }}
                                    size="xs"
                                />
                            </Group>
                            <Group justify="flex-end" mt="md">
                                <Button variant="outline" size="xs" onClick={() => setEditingRule(null)}>Cancel</Button>
                                <Button color="blue" size="xs" onClick={handleSaveRule}>Save Rule</Button>
                            </Group>
                        </Stack>
                    ) : (
                        <Stack gap="xs">
                            <Group justify="space-between">
                                <Text fw={700} size="xs" c="dimmed">PROCESSING ORDER (HIGH TO LOW)</Text>
                                <Button size="compact-xs" leftSection={<Plus size={14} />} onClick={handleAddRule}>
                                    Add Rule
                                </Button>
                            </Group>

                            <Table striped highlightOnHover verticalSpacing="xs">
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Name</Table.Th>
                                        <Table.Th>Conditions</Table.Th>
                                        <Table.Th>Visual</Table.Th>
                                        <Table.Th>Pri</Table.Th>
                                        <Table.Th style={{ width: 80 }}>Actions</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {rules.map(rule => (
                                        <Table.Tr key={rule.id}>
                                            <Table.Td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {rule.name}
                                            </Table.Td>
                                            <Table.Td>
                                                <Group gap="xs">
                                                    {rule.color_hex && <ColorSwatch color={rule.color_hex} size={12} />}
                                                    <Badge color="blue" variant="light" size="xs">{rule.visual_type}</Badge>
                                                </Group>
                                            </Table.Td>
                                            <Table.Td>
                                                <Text size="xs" c="dimmed" truncate="end" style={{ maxWidth: 200 }}>
                                                    {(() => {
                                                        try {
                                                            const conds = JSON.parse(rule.match_conditions);
                                                            if (conds.target_class) {
                                                                const count = conds.conditions?.length || 0;
                                                                return `${conds.target_class} (+${count})`;
                                                            }
                                                            return rule.match_conditions;
                                                        } catch {
                                                            return 'Invalid JSON';
                                                        }
                                                    })()}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>{rule.priority}</Table.Td>
                                            <Table.Td>
                                                <Group gap={4} wrap="nowrap">
                                                    <ActionIcon size="sm" variant="subtle" onClick={() => setEditingRule(rule)}>
                                                        <Edit2 size={14} />
                                                    </ActionIcon>
                                                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleDeleteRule(rule.id)}>
                                                        <Trash2 size={14} />
                                                    </ActionIcon>
                                                </Group>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                    {rules.length === 0 && (
                                        <Table.Tr>
                                            <Table.Td colSpan={4} align="center" style={{ padding: 20 }}>
                                                <Text size="xs" c="dimmed">No rules defined for this profile.</Text>
                                            </Table.Td>
                                        </Table.Tr>
                                    )}
                                </Table.Tbody>
                            </Table>
                        </Stack>
                    )}
                </Paper>
            </Stack>
        </AnalysisWindow>
    );
};
