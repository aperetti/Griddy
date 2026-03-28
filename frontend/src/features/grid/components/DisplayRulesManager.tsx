import React, { useState, useEffect, Fragment } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { 
    X, Upload, Trash2, Plus,
    AlertCircle, Code, Eye, Info, Copy, Lock,
    ArrowLeft, Download, MoreVertical, ListOrdered,
    ArrowDownAZ, Filter, Package, Maximize2
} from 'lucide-react';
import { 
    Table, Button, Group, ActionIcon, 
    Stack, Text, Badge, Select, TextInput, 
    NumberInput, JsonInput, Paper, Divider,
    ColorSwatch, Box, PasswordInput,
    Alert, FileButton, Grid, Textarea, Switch,
    Fieldset, Menu, rem, Tooltip, SegmentedControl
} from '@mantine/core';
import { AnalysisWindow } from '../../analytics/components/AnalysisWindow';
import {
    fetchDisplayConfigs, fetchDisplayRules,
    saveDisplayRule, deleteDisplayRule,
    duplicateDisplayRule,
    setDefaultDisplayConfig,
    createDisplayConfig, deleteDisplayConfig,
    type DisplayConfig, type DisplayRule
} from '../../../shared/api';
import { CimRuleBuilder } from './CimRuleBuilder';

interface DisplayRulesManagerProps {
    opened: boolean;
    onClose: () => void;
    onFocus?: () => void;
    onRulesChanged?: () => void;
    zIndex?: number;
}


export const DisplayRulesManager: React.FC<DisplayRulesManagerProps> = ({ 
    opened, 
    onClose,
    onFocus,
    onRulesChanged,
    zIndex = 1005
}) => {
    const [configs, setConfigs] = useState<DisplayConfig[]>([]);
    const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
    const [rules, setRules] = useState<DisplayRule[]>([]);
    const [editingRule, setEditingRule] = useState<Partial<DisplayRule> | null>(null);
    const [configError, setConfigError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [useBuilder, setUseBuilder] = useState(true);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    
    // Grouping and Sorting state
    const [groupBy, setGroupBy] = useState<'none' | 'cim_class'>('none');
    const [sortBy, setSortBy] = useState<'priority' | 'name'>('priority');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [editorValue, setEditorValue] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('adminAuth'));
    const [authUsername, setAuthUsername] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    
    // Profile Management State
    const [isCreatingConfig, setIsCreatingConfig] = useState(false);
    const [newConfigName, setNewConfigName] = useState('');
    const isMobile = useMediaQuery('(max-width: 768px)');

    useEffect(() => {
        if (opened && isAuthenticated) {
            loadConfigs();
            onFocus?.();
        } else if (opened && !isAuthenticated) {
            onFocus?.();
        }
    }, [opened, isAuthenticated]);

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
            if (err.message === 'Unauthorized') {
                localStorage.removeItem('adminAuth');
                setIsAuthenticated(false);
                setAuthError("Session expired or unauthorized. Please sign in again.");
            } else {
                setConfigError(err.message || 'Failed to connect to display service.');
            }
        }
    };

    const loadRules = async (configId: number) => {
        try {
            const data = await fetchDisplayRules(configId);
            setRules(data);
        } catch (err) {
            console.error('Failed to load rules', err);
        }
    };

    // Helper to get group name for a rule
    const getCimClass = (rule: DisplayRule) => {
        try {
            const conds = typeof rule.match_conditions === 'string' 
                ? JSON.parse(rule.match_conditions) 
                : rule.match_conditions;
            return conds?.target_class || 'Any Class';
        } catch {
            return 'Invalid Rule';
        }
    };

    // Processed rules (sorted and grouped)
    const processedRules = React.useMemo(() => {
        // 1. Sort the rules
        const sorted = [...rules].sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'priority') {
                comparison = a.priority - b.priority;
            } else {
                comparison = a.name.localeCompare(b.name);
            }
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        // 2. Group if selected
        if (groupBy === 'none') {
            return [{ groupName: null, rules: sorted }];
        }

        const groups: Record<string, DisplayRule[]> = {};
        sorted.forEach(rule => {
            const cls = getCimClass(rule);
            if (!groups[cls]) groups[cls] = [];
            groups[cls].push(rule);
        });

        return Object.keys(groups).sort().map(name => ({
            groupName: name,
            rules: groups[name]
        }));
    }, [rules, groupBy, sortBy, sortOrder]);

    const handleSetDefault = async (configId: number) => {
        try {
            await setDefaultDisplayConfig(configId);
            loadConfigs();
            onRulesChanged?.();
        } catch (err) {
            console.error('Failed to set default', err);
        }
    };

    const handleSaveRule = async () => {
        if (!editingRule || !selectedConfigId) return;
        try {
            setSaveError(null);
            await saveDisplayRule({ ...editingRule, config_id: selectedConfigId });
            setEditingRule(null);
            loadRules(selectedConfigId);
            onRulesChanged?.();
        } catch (err: any) {
            console.error('Failed to save rule', err);
            setSaveError(err.message || 'Failed to save rule. Check JSON format and required fields.');
        }
    };

    const handleDeleteRule = async (ruleId: number) => {
        if (!confirm('Are you sure you want to delete this rule?')) return;
        try {
            await deleteDisplayRule(ruleId);
            if (selectedConfigId) {
                loadRules(selectedConfigId);
                onRulesChanged?.();
            }
        } catch (err) {
            console.error('Failed to delete rule', err);
        }
    };

    const handleDuplicateRule = async (ruleId: number) => {
        try {
            await duplicateDisplayRule(ruleId);
            if (selectedConfigId) {
                loadRules(selectedConfigId);
                onRulesChanged?.();
            }
        } catch (err) {
            console.error('Failed to duplicate rule', err);
        }
    };

    const handleFileUpload = (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target?.result as string;
            const trimmed = content.trim();
            if (trimmed.startsWith('<svg') || trimmed.includes('<svg')) {
                setEditingRule(prev => prev ? { 
                    ...prev, 
                    config: { ...(prev.config || {}), icon: content } as any
                } : null);
            } else {
                console.warn('Uploaded file does not appear to be an SVG');
            }
        };
        reader.readAsText(file);
    };

    const openEditor = () => {
        setEditorValue(editingRule?.config?.icon || '');
        setIsEditorOpen(true);
    };

    const saveFromEditor = () => {
        setEditingRule(prev => prev ? { 
            ...prev, 
            config: { ...(prev.config || {}), icon: editorValue } as any
        } : null);
        setIsEditorOpen(false);
    };

    const handleAddRule = () => {
        setEditingRule({
            name: 'New Rule',
            enabled: true,
            priority: 0,
            match_conditions: '{}',
            config: {
                visual_type: 'Custom',
                color_hex: '',
                size: 1.0,
                label: '',
                cluster_enabled: false,
                cluster_radius: 40,
                cluster_max_zoom: 20,
                cluster_min_points: 2,
                min_zoom: 0,
                max_zoom: 24,
                css_overrides: []
            }
        });
    };

    const addOverride = () => {
        setEditingRule(prev => {
            if (!prev) return null;
            const config = { ...(prev.config || {}) } as any;
            const overrides = [...(config.css_overrides || [])];
            overrides.push({ conditions: {}, css: '' });
            config.css_overrides = overrides;
            return { ...prev, config };
        });
    };

    const removeOverride = (index: number) => {
        setEditingRule(prev => {
            if (!prev) return null;
            const config = { ...(prev.config || {}) } as any;
            const overrides = [...(config.css_overrides || [])];
            overrides.splice(index, 1);
            config.css_overrides = overrides;
            return { ...prev, config };
        });
    };

    const updateOverride = (index: number, override: any) => {
        setEditingRule(prev => {
            if (!prev) return null;
            const config = { ...(prev.config || {}) } as any;
            const overrides = [...(config.css_overrides || [])];
            overrides[index] = override;
            config.css_overrides = overrides;
            return { ...prev, config };
        });
    };

    const handleAuthSubmit = async () => {
        setIsAuthenticating(true);
        setAuthError(null);
        try {
            const token = btoa(`${authUsername}:${authPassword}`);
            const res = await fetch('/api/display-rules/configs', {
                headers: { 'Authorization': `Basic ${token}` }
            });
            if (res.status === 401) {
                setAuthError('Invalid username or password');
            } else if (!res.ok) {
                setAuthError(`Server error: ${res.status}`);
            } else {
                localStorage.setItem('adminAuth', token);
                setIsAuthenticated(true);
                setAuthPassword('');
            }
        } catch (err) {
            setAuthError('Failed to connect to authentication server');
        } finally {
            setIsAuthenticating(false);
        }
    };
    
    const handleExportConfig = () => {
        if (!selectedConfigId) return;
        const config = configs.find(c => c.id === selectedConfigId);
        if (!config) return;
        
        const exportData = {
            metadata: {
                name: config.name,
                description: config.description,
                is_default: config.is_default,
                version: "1.0"
            },
            rules: rules.map(rule => ({
                name: rule.name,
                priority: rule.priority,
                enabled: rule.enabled,
                match_conditions: rule.match_conditions,
                config: rule.config
            }))
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${config.name.replace(/\s+/g, '_')}_config.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleCreateConfig = async () => {
        if (!newConfigName.trim()) return;
        try {
            const newConfig = await createDisplayConfig(newConfigName.trim());
            setConfigs(prev => [...prev, newConfig]);
            setSelectedConfigId(newConfig.id);
            setNewConfigName('');
            setIsCreatingConfig(false);
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : 'Failed to create config');
        }
    };

    const handleDeleteConfig = async () => {
        if (!selectedConfigId) return;
        const config = configs.find(c => c.id === selectedConfigId);
        if (!config) return;
        if (config.is_default) {
            setSaveError("Cannot delete the default profile.");
            return;
        }
        
        if (!window.confirm(`Are you sure you want to delete the profile "${config.name}"? This will also delete all its rules.`)) {
            return;
        }
        
        try {
            await deleteDisplayConfig(selectedConfigId);
            setConfigs(prev => prev.filter(c => c.id !== selectedConfigId));
            setSelectedConfigId(configs.find(c => c.is_default)?.id || null);
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : 'Failed to delete config');
        }
    };

    const handleImportConfig = async (file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target?.result as string);
                if (!data.metadata || !data.rules) {
                    throw new Error("Invalid format: Missing metadata or rules");
                }
                
                // 1. Create the config
                const baseName = data.metadata.name || "Imported Profile";
                let finalName = baseName;
                let counter = 1;
                while (configs.some(c => c.name === finalName)) {
                    finalName = `${baseName} (${counter++})`;
                }
                
                const newConfig = await createDisplayConfig(finalName, data.metadata.description);
                
                // 2. Import rules
                for (const ruleData of data.rules) {
                    await saveDisplayRule({
                        config_id: newConfig.id,
                        name: ruleData.name,
                        priority: ruleData.priority,
                        enabled: ruleData.enabled,
                        match_conditions: ruleData.match_conditions,
                        config: ruleData.config
                    });
                }
                
                // Refresh list and select new one
                const updatedConfigs = await fetchDisplayConfigs();
                setConfigs(updatedConfigs);
                setSelectedConfigId(newConfig.id);
            } catch (err) {
                setSaveError(e instanceof Error ? (e as any).message : 'Import failed: Invalid JSON format');
            }
        };
        reader.readAsText(file);
    };

    return (
        <Fragment>
            <AnalysisWindow
                isOpen={opened}
                onClose={onClose}
                title="Display Rules Manager"
                storageKey="display-rules-manager"
                zIndex={zIndex}
                onFocus={onFocus}
            >
            {!isAuthenticated ? (
                <Stack align="center" justify="center" h="100%" px="md">
                    <Paper withBorder p="xl" radius="md" w="100%" maw={400} style={{ background: 'rgba(0,0,0,0.5)' }}>
                        <Stack gap="md">
                            <Group justify="center">
                                <Box bg="blue.9" p="sm" style={{ borderRadius: '50%' }}>
                                    <Lock size={24} color="white" />
                                </Box>
                            </Group>
                            <Text fw={700} ta="center" size="lg">Rules Engine Sign In</Text>
                            <Text size="sm" c="dimmed" ta="center">
                                Authentication is required to configure display rules.
                            </Text>
                            
                            {authError && (
                                <Alert icon={<AlertCircle size={16} />} color="red" variant="light">
                                    {authError}
                                </Alert>
                            )}

                            <form onSubmit={(e) => { e.preventDefault(); handleAuthSubmit(); }}>
                                <Stack gap="md">
                                    <TextInput 
                                        label="Username" 
                                        placeholder="Admin username" 
                                        required 
                                        value={authUsername}
                                        onChange={(e) => setAuthUsername(e.currentTarget.value)}
                                    />
                                    <PasswordInput 
                                        label="Password" 
                                        placeholder="Admin password" 
                                        required 
                                        value={authPassword}
                                        onChange={(e) => setAuthPassword(e.currentTarget.value)}
                                    />
                                    <Button type="submit" fullWidth loading={isAuthenticating} color="blue" mt="sm">
                                        Sign In
                                    </Button>
                                </Stack>
                            </form>
                        </Stack>
                    </Paper>
                </Stack>
            ) : (
                <Stack gap="md" h="100%">
                {configError && (
                    <Alert icon={<AlertCircle size={16} />} title="Backend Error" color="red" variant="light">
                        {configError}
                    </Alert>
                )}
                {saveError && (
                    <Alert icon={<AlertCircle size={16} />} title="Save Error" color="red" variant="light" withCloseButton onClose={() => setSaveError(null)}>
                        {saveError}
                    </Alert>
                )}
                {isCreatingConfig ? (
                    <Group gap="xs" align="flex-end">
                        <TextInput 
                            label="New Profile Name"
                            placeholder="Enter profile name..."
                            value={newConfigName}
                            onChange={(e) => setNewConfigName(e.currentTarget.value)}
                            style={{ flex: 1 }}
                            size="xs"
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateConfig()}
                        />
                        <Button size="xs" onClick={handleCreateConfig} disabled={!newConfigName.trim()}>Create</Button>
                        <Button size="xs" variant="light" color="gray" onClick={() => { setIsCreatingConfig(false); setNewConfigName(''); }}>Cancel</Button>
                    </Group>
                ) : (
                    <Group justify="space-between" align="flex-end" wrap="nowrap">
                        <Select
                            label="Configuration Profile"
                            placeholder="Select a profile"
                            data={Array.isArray(configs) ? configs.map(c => ({ value: c.id.toString(), label: c.name + (c.is_default ? ' (Default)' : '') })) : []}
                            value={selectedConfigId?.toString()}
                            onChange={(val) => setSelectedConfigId(val ? parseInt(val) : null)}
                            style={{ flex: 1 }}
                            size="xs"
                            comboboxProps={{ zIndex: zIndex + 1000 }}
                        />
                        <Group gap="xs" align="center">
                            <Button
                                variant="light"
                                color="blue"
                                size="xs"
                                disabled={!selectedConfigId || configs.find(c => c.id === selectedConfigId)?.is_default}
                                onClick={() => selectedConfigId && handleSetDefault(selectedConfigId)}
                            >
                                Set Default
                            </Button>
                            
                            <Menu shadow="md" width={200} zIndex={zIndex + 1100}>
                                <Menu.Target>
                                    <ActionIcon variant="light" color="gray" size="md">
                                        <MoreVertical size={18} />
                                    </ActionIcon>
                                </Menu.Target>

                                <Menu.Dropdown>
                                    <Menu.Label>Profile Options</Menu.Label>
                                    <Menu.Item 
                                        leftSection={<Plus style={{ width: rem(14), height: rem(14) }} />}
                                        onClick={() => setIsCreatingConfig(true)}
                                    >
                                        New Profile
                                    </Menu.Item>
                                    
                                    <FileButton onChange={handleImportConfig} accept="application/json">
                                        {(props) => (
                                            <Menu.Item 
                                                {...props}
                                                leftSection={<Upload style={{ width: rem(14), height: rem(14) }} />}
                                            >
                                                Import JSON
                                            </Menu.Item>
                                        )}
                                    </FileButton>

                                    <Menu.Item 
                                        leftSection={<Download style={{ width: rem(14), height: rem(14) }} />}
                                        disabled={!selectedConfigId}
                                        onClick={handleExportConfig}
                                    >
                                        Export JSON
                                    </Menu.Item>

                                    <Menu.Divider />

                                    <Menu.Label>Danger zone</Menu.Label>
                                    <Menu.Item
                                        color="red"
                                        leftSection={<Trash2 style={{ width: rem(14), height: rem(14) }} />}
                                        disabled={!selectedConfigId || configs.find(c => c.id === selectedConfigId)?.is_default}
                                        onClick={handleDeleteConfig}
                                    >
                                        Delete Profile
                                    </Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Group>
                    </Group>
                )}

                <Divider label="Rules Priority" labelPosition="center" />

                <Paper withBorder p="xs" style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)' }}>
                    {editingRule ? (
                        <Stack gap="sm">
                            <Group justify="space-between">
                                <Group gap="xs">
                                    <ActionIcon 
                                        variant="subtle" 
                                        size="xs" 
                                        onClick={() => setEditingRule(null)}
                                        title="Back to list"
                                    >
                                        <ArrowLeft size={14} />
                                    </ActionIcon>
                                    <Text fw={700} size="xs">{editingRule.id ? "Edit Rule" : "Add New Rule"}</Text>
                                </Group>
                                <ActionIcon variant="subtle" size="xs" onClick={() => setEditingRule(null)}>
                                    <X size={14} />
                                </ActionIcon>
                            </Group>
                            <Fieldset legend={<Text size="xs" fw={700}>Identity & Matching</Text>} variant="unstyled" style={{ padding: '4px 0' }}>
                                <Stack gap="xs">
                                    <TextInput
                                        label={
                                            <Group gap={4} wrap="nowrap">
                                                <Text size="xs" fw={500}>Rule Name</Text>
                                                <Tooltip label="Human-readable name for this display rule." position="top-start" withArrow withinPortal zIndex={zIndex + 1000}>
                                                    <Info size={12} style={{ opacity: 0.6, cursor: 'help' }} />
                                                </Tooltip>
                                            </Group>
                                        }
                                        placeholder="e.g. Substation Regulators"
                                        value={editingRule?.name || ''}
                                        onChange={(e) => setEditingRule(prev => prev ? { ...prev, name: e.target.value } : null)}
                                        size="xs"
                                    />
                                    <Group grow align="flex-end">
                                        <TextInput
                                            label={
                                                <Group gap={4} wrap="nowrap">
                                                    <Text size="xs" fw={500}>Visual Type</Text>
                                                    <Tooltip label="The logical category for this rule (e.g., Transformer, Meter). Matches the 'type' field in the topology JSON." position="top-start" withArrow withinPortal zIndex={zIndex + 1000}>
                                                        <Info size={12} style={{ opacity: 0.6, cursor: 'help' }} />
                                                    </Tooltip>
                                                </Group>
                                            }
                                            placeholder="e.g. Transformer"
                                            value={editingRule?.config?.visual_type || ''}
                                            onChange={(e) => setEditingRule(prev => prev ? { 
                                                ...prev, 
                                                config: { ...(prev.config || {}), visual_type: e.target.value } as any
                                            } : null)}
                                            size="xs"
                                        />
                                        <NumberInput
                                            label={
                                                <Group gap={4} wrap="nowrap">
                                                    <Text size="xs" fw={500}>Priority</Text>
                                                    <Tooltip label="Controls matching order. Higher priority rules are evaluated first." position="top-start" withArrow withinPortal zIndex={zIndex + 1000}>
                                                        <Info size={12} style={{ opacity: 0.6, cursor: 'help' }} />
                                                    </Tooltip>
                                                </Group>
                                            }
                                            value={editingRule?.priority || 0}
                                            onChange={(val) => setEditingRule(prev => prev ? { ...prev, priority: typeof val === 'number' ? val : 0 } : null)}
                                            size="xs"
                                        />
                                    </Group>

                                    <Stack gap={4}>
                                        <Group justify="space-between" align="center">
                                            <Group gap={4} wrap="nowrap">
                                                <Text size="xs" fw={500}>Match Conditions</Text>
                                                <Tooltip label="Logic used to identify assets from the topology that this rule should apply to." position="top-start" withArrow withinPortal zIndex={zIndex + 1000}>
                                                    <Info size={12} style={{ opacity: 0.6, cursor: 'help' }} />
                                                </Tooltip>
                                            </Group>
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
                                                value={typeof editingRule?.match_conditions === 'string' ? editingRule.match_conditions : JSON.stringify(editingRule?.match_conditions || {})}
                                                onChange={(val) => setEditingRule(prev => prev ? { ...prev, match_conditions: val } : null)}
                                            />
                                        ) : (
                                            <JsonInput
                                                placeholder='{"equipment_type": "PowerTransformer", "properties": {"name": "Regulator"}}'
                                                validationError="Invalid JSON"
                                                formatOnBlur
                                                autosize
                                                minRows={4}
                                                value={typeof editingRule?.match_conditions === 'string' ? editingRule.match_conditions : JSON.stringify(editingRule?.match_conditions || {}, null, 2)}
                                                onChange={(val) => setEditingRule(prev => prev ? { ...prev, match_conditions: val } : null)}
                                                size="xs"
                                            />
                                        )}
                                    </Stack>
                                </Stack>
                            </Fieldset>

                            <Paper withBorder p="md" style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                                <Stack gap="md">
                                    <Text size="xs" fw={700} tt="uppercase" c="dimmed">Visual Settings</Text>
                                    
                                    <Grid gutter="md">
                                        <Grid.Col span={9}>
                                            <Stack gap="sm">
                                                <Grid gutter="xs" align="flex-end">
                                                    <Grid.Col span={4}>
                                                        <NumberInput
                                                            label={
                                                                <Group gap={4} wrap="nowrap">
                                                                    <Text size="xs" fw={500}>Size</Text>
                                                                    <Tooltip label="Scaling factor applied to icons or line widths." position="top-start" withArrow withinPortal zIndex={zIndex + 1000}>
                                                                        <Info size={12} style={{ opacity: 0.6, cursor: 'help' }} />
                                                                    </Tooltip>
                                                                </Group>
                                                            }
                                                            placeholder="1.0"
                                                            step={0.1}
                                                            decimalScale={1}
                                                            value={editingRule?.config?.size || 1.0}
                                                            onChange={(val) => setEditingRule(prev => prev ? { 
                                                                ...prev, 
                                                                config: { ...(prev.config || {}), size: typeof val === 'number' ? val : 1.0 } as any
                                                            } : null)}
                                                            size="xs"
                                                        />
                                                    </Grid.Col>
                                                    <Grid.Col span={8}>
                                                        <TextInput
                                                            label={
                                                                <Group gap={4} wrap="nowrap">
                                                                    <Text size="xs" fw={500}>Label</Text>
                                                                    <Tooltip label="Static text that will appear in the node's label on the map view." position="top-start" withArrow withinPortal zIndex={zIndex + 1000}>
                                                                        <Info size={12} style={{ opacity: 0.6, cursor: 'help' }} />
                                                                    </Tooltip>
                                                                </Group>
                                                            }
                                                            placeholder="Label..."
                                                            value={editingRule?.config?.label || ''}
                                                            onChange={(e) => setEditingRule(prev => prev ? { 
                                                                ...prev, 
                                                                config: { ...(prev.config || {}), label: e.target.value } as any
                                                            } : null)}
                                                            size="xs"
                                                        />
                                                    </Grid.Col>
                                                </Grid>

                                                <Stack gap={4}>
                                                    <Text size="xs" fw={500}>SVG Icon</Text>
                                                    <Group gap="xs" wrap="nowrap">
                                                        <FileButton onChange={handleFileUpload} accept="image/svg+xml">
                                                            {(props) => (
                                                                <Button {...props} variant="light" size="xs" leftSection={<Upload size={14} />}>
                                                                    Upload
                                                                </Button>
                                                            )}
                                                        </FileButton>
                                                        <Button 
                                                            variant="light" 
                                                            size="xs" 
                                                            leftSection={<Maximize2 size={14} />}
                                                            onClick={openEditor}
                                                            style={{ flex: 1 }}
                                                        >
                                                            {isMobile ? "Live" : "Live Editor"}
                                                        </Button>
                                                    </Group>
                                                </Stack>

                                                <Grid gutter="xs">
                                                    <Grid.Col span={6}>
                                                        <NumberInput
                                                            label="Min Zoom"
                                                            placeholder="0"
                                                            min={0} max={24} step={0.5}
                                                            value={editingRule?.config?.min_zoom ?? 0}
                                                            onChange={(val) => setEditingRule(prev => prev ? { 
                                                                ...prev, config: { ...(prev.config || {}), min_zoom: typeof val === 'number' ? val : 0 } as any
                                                            } : null)}
                                                            size="xs"
                                                        />
                                                    </Grid.Col>
                                                    <Grid.Col span={6}>
                                                        <NumberInput
                                                            label="Max Zoom"
                                                            placeholder="24"
                                                            min={0} max={24} step={0.5}
                                                            value={editingRule?.config?.max_zoom ?? 24}
                                                            onChange={(val) => setEditingRule(prev => prev ? { 
                                                                ...prev, config: { ...(prev.config || {}), max_zoom: typeof val === 'number' ? val : 24 } as any
                                                            } : null)}
                                                            size="xs"
                                                        />
                                                    </Grid.Col>
                                                </Grid>

                                                <Stack gap="xs">
                                                    <Group justify="space-between">
                                                        <Group gap="xs">
                                                            <Switch 
                                                                label={<Text size="xs" fw={500}>Geospatial Clustering</Text>}
                                                                size="xs"
                                                                checked={editingRule?.config?.cluster_enabled || false}
                                                                onChange={(e) => setEditingRule(prev => prev ? { 
                                                                    ...prev, 
                                                                    config: { ...(prev.config || {}), cluster_enabled: e.currentTarget.checked } as any
                                                                } : null)}
                                                            />
                                                        </Group>
                                                    </Group>

                                                    {editingRule?.config?.cluster_enabled && (
                                                        <Group grow gap="xs">
                                                            <NumberInput
                                                                label="Radius"
                                                                size="xs"
                                                                value={editingRule?.config?.cluster_radius || 50}
                                                                onChange={(val) => setEditingRule(prev => prev ? { 
                                                                    ...prev, 
                                                                    config: { ...(prev.config || {}), cluster_radius: typeof val === 'number' ? val : 50 } as any
                                                                } : null)}
                                                            />
                                                            <NumberInput
                                                                label="Max Zoom"
                                                                size="xs"
                                                                value={editingRule?.config?.cluster_max_zoom || 14}
                                                                onChange={(val) => setEditingRule(prev => prev ? { 
                                                                    ...prev, 
                                                                    config: { ...(prev.config || {}), cluster_max_zoom: typeof val === 'number' ? val : 14 } as any
                                                                } : null)}
                                                            />
                                                            <NumberInput
                                                                label="Min Pts"
                                                                size="xs"
                                                                value={editingRule?.config?.cluster_min_points || 2}
                                                                onChange={(val) => setEditingRule(prev => prev ? { 
                                                                    ...prev, 
                                                                    config: { ...(prev.config || {}), cluster_min_points: typeof val === 'number' ? val : 2 } as any
                                                                } : null)}
                                                            />
                                                        </Group>
                                                    )}
                                                </Stack>

                                                <Group gap="md">
                                                    <Switch 
                                                        label={<Text size="xs" fw={500}>Rotate to Edge</Text>} 
                                                        size="xs"
                                                        checked={editingRule?.config?.rotate_to_edge || false}
                                                        onChange={(e) => setEditingRule(prev => prev ? { 
                                                            ...prev, 
                                                            config: { ...(prev.config || {}), rotate_to_edge: e.currentTarget.checked } as any
                                                        } : null)}
                                                    />
                                                </Group>
                                            </Stack>
                                        </Grid.Col>
                                        
                                        <Grid.Col span={3}>
                                            <Stack align="center" justify="center" h="100%">
                                                <Text size="xs" fw={500} c="dimmed">Preview</Text>
                                                {editingRule?.config?.icon && (editingRule.config.icon.trim().startsWith('<svg') || editingRule.config.icon.includes('<svg')) ? (
                                                    <Box style={{ 
                                                        width: 80, 
                                                        height: 80, 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        background: 'rgba(255,255,255,0.05)',
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: 8,
                                                        overflow: 'hidden',
                                                        padding: 8
                                                    }}>
                                                        <div 
                                                            style={{ 
                                                                width: '100%', 
                                                                height: '100%', 
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}
                                                            className="svg-preview-container"
                                                            dangerouslySetInnerHTML={{ __html: editingRule.config.icon.replace(/<svg/, '<svg style="width: 100%; height: 100%; display: block;"') }} 
                                                        />
                                                    </Box>
                                                ) : (
                                                    <Box style={{ 
                                                        width: 80, 
                                                        height: 80, 
                                                        border: '1px dashed rgba(255,255,255,0.2)', 
                                                        borderRadius: 8,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}>
                                                        <Eye size={24} style={{ opacity: 0.2 }} />
                                                    </Box>
                                                )}
                                            </Stack>
                                        </Grid.Col>
                                    </Grid>
                                </Stack>
                            </Paper>

                            <Divider label="SVG CSS Overrides" labelPosition="center" />
                            
                            <Stack gap="xs">
                                {editingRule?.config?.css_overrides?.map((override: any, index: number) => (
                                    <Paper key={index} withBorder p="xs" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <Stack gap="xs">
                                            <Group justify="space-between">
                                                <Text size="xs" fw={700}>Override #{index + 1}</Text>
                                                <ActionIcon color="red" variant="subtle" size="xs" onClick={() => removeOverride(index)}>
                                                    <Trash2 size={14} />
                                                </ActionIcon>
                                            </Group>
                                            <Group gap={4} wrap="nowrap">
                                                <Text size="xs" fw={500}>Conditions</Text>
                                                <Tooltip label="Logic to target specific assets for this CSS override." position="top-start" withArrow withinPortal zIndex={zIndex + 1000}>
                                                    <Info size={12} style={{ opacity: 0.6, cursor: 'help' }} />
                                                </Tooltip>
                                            </Group>
                                            <CimRuleBuilder 
                                                value={typeof override.conditions === 'string' ? override.conditions : JSON.stringify(override.conditions)}
                                                onChange={(val) => updateOverride(index, { ...override, conditions: val })}
                                            />
                                            <Textarea
                                                label={
                                                    <Group gap={4} wrap="nowrap">
                                                        <Text size="xs" fw={500}>CSS</Text>
                                                        <Tooltip label="Raw CSS rules injected into the SVG icon. Use to change styles based on conditions." position="top-start" withArrow withinPortal zIndex={zIndex + 1000}>
                                                            <Info size={12} style={{ opacity: 0.6, cursor: 'help' }} />
                                                        </Tooltip>
                                                    </Group>
                                                }
                                                placeholder=".my-class { visibility: hidden; }"
                                                description="Applied when the rule above matches"
                                                size="xs"
                                                value={override.css}
                                                onChange={(e) => updateOverride(index, { ...override, css: e.currentTarget.value })}
                                                autosize
                                                minRows={2}
                                            />
                                        </Stack>
                                    </Paper>
                                ))}
                                <Button 
                                    variant="subtle" 
                                    size="xs" 
                                    leftSection={<Plus size={14} />} 
                                    onClick={addOverride}
                                    fullWidth
                                >
                                    Add CSS Override
                                </Button>
                            </Stack>
                            <Group justify="flex-end" mt="md">
                                <Button variant="outline" size="xs" onClick={() => setEditingRule(null)}>Cancel</Button>
                                <Button color="blue" size="xs" onClick={handleSaveRule}>Save Rule</Button>
                            </Group>
                        </Stack>
                    ) : (
                        <Stack gap="xs">
                            <Group justify="space-between" wrap="wrap" gap="xs">
                                <Text fw={700} size="xs" c="dimmed">PROCESSING ORDER (HIGH TO LOW)</Text>
                                <Group gap="xs">
                                    <Menu shadow="md" width={200} position="bottom-end">
                                        <Menu.Target>
                                            <Button variant="subtle" size="xs" leftSection={<Filter size={14} />}>
                                                Display Options
                                            </Button>
                                        </Menu.Target>
                                        <Menu.Dropdown>
                                            <Menu.Label>Group By</Menu.Label>
                                            <Box px="xs" pb="xs">
                                                <SegmentedControl
                                                    fullWidth
                                                    size="xs"
                                                    value={groupBy}
                                                    onChange={(val) => setGroupBy(val as any)}
                                                    data={[
                                                        { label: 'None', value: 'none' },
                                                        { label: 'CIM Class', value: 'cim_class' }
                                                    ]}
                                                />
                                            </Box>
                                            <Menu.Divider />
                                            <Menu.Label>Sort By</Menu.Label>
                                            <Menu.Item 
                                                leftSection={sortBy === 'priority' ? <ListOrdered size={14} /> : <div style={{width: 14}} />} 
                                                onClick={() => setSortBy('priority')}
                                            >
                                                Priority
                                            </Menu.Item>
                                            <Menu.Item 
                                                leftSection={sortBy === 'name' ? <ArrowDownAZ size={14} /> : <div style={{width: 14}} />} 
                                                onClick={() => setSortBy('name')}
                                            >
                                                Name
                                            </Menu.Item>
                                            <Menu.Divider />
                                            <Menu.Label>Order</Menu.Label>
                                            <Box px="xs" pb="xs">
                                                <SegmentedControl
                                                    fullWidth
                                                    size="xs"
                                                    value={sortOrder}
                                                    onChange={(val) => setSortOrder(val as any)}
                                                    data={[
                                                        { label: 'Asc', value: 'asc' },
                                                        { label: 'Desc', value: 'desc' }
                                                    ]}
                                                />
                                            </Box>
                                        </Menu.Dropdown>
                                    </Menu>
                                    <Button size="compact-xs" leftSection={<Plus size={14} />} onClick={handleAddRule}>
                                        Add Rule
                                    </Button>
                                </Group>
                            </Group>

                            {isMobile ? (
                                <Stack gap="xs">
                                    {processedRules.map(group => (
                                        <Fragment key={group.groupName || 'flat'}>
                                            {group.groupName && (
                                                <Divider 
                                                    label={
                                                        <Group gap={4}>
                                                            <Package size={12} />
                                                            <Text size="xs" fw={700}>{group.groupName}</Text>
                                                        </Group>
                                                    } 
                                                    labelPosition="left" 
                                                    mt="xs"
                                                />
                                            )}
                                            {group.rules.map(rule => (
                                                <Paper 
                                                    key={rule.id} 
                                                    withBorder 
                                                    p="xs" 
                                                    style={{ 
                                                        background: 'rgba(255,255,255,0.02)', 
                                                        transition: 'background 0.2s ease'
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                                >
                                                    <Stack gap={5}>
                                                        <Group justify="space-between" wrap="nowrap">
                                                    <Text 
                                                        fw={700} 
                                                        size="sm" 
                                                        truncate="end" 
                                                        onClick={() => setEditingRule(rule)}
                                                        style={{ cursor: 'pointer', flex: 1 }}
                                                    >
                                                        {rule.name}
                                                    </Text>
                                                    <Group gap={4} wrap="nowrap">
                                                        <ActionIcon 
                                                            size="md" 
                                                            variant="subtle" 
                                                            color="blue" 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDuplicateRule(rule.id);
                                                            }}
                                                            title="Duplicate rule"
                                                        >
                                                            <Copy size={18} />
                                                        </ActionIcon>
                                                        <ActionIcon 
                                                            size="md" 
                                                            variant="subtle" 
                                                            color="red" 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteRule(rule.id);
                                                            }}
                                                            title="Delete rule"
                                                        >
                                                            <Trash2 size={18} />
                                                        </ActionIcon>
                                                    </Group>
                                                </Group>
                                                <Group justify="space-between">
                                                    <Group gap={4}>
                                                        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                                                            <Switch 
                                                                size="xs" 
                                                                checked={rule.enabled}
                                                                onChange={async (e) => {
                                                                    const updatedRule = { ...rule, enabled: e.currentTarget.checked };
                                                                    await saveDisplayRule(updatedRule);
                                                                    if (selectedConfigId) loadRules(selectedConfigId);
                                                                    onRulesChanged?.();
                                                                }}
                                                            />
                                                        </div>
                                                        <Group gap={4} onClick={() => setEditingRule(rule)} style={{ cursor: 'pointer' }}>
                                                            {rule.config?.color_hex && <ColorSwatch color={rule.config.color_hex} size={10} />}
                                                            <Badge color="blue" variant="light" size="xs" style={{ textTransform: 'none' }}>
                                                                {rule.config?.visual_type}
                                                                {rule.config?.size && ` (${rule.config.size})`}
                                                            </Badge>
                                                            {rule.config?.label && <Badge color="gray" variant="outline" size="xs">{rule.config.label}</Badge>}
                                                        </Group>
                                                    </Group>
                                                    <Text size="xs" c="dimmed" onClick={() => setEditingRule(rule)} style={{ cursor: 'pointer' }}>Pri: {rule.priority}</Text>
                                                </Group>
                                                <Text 
                                                    size="xs" 
                                                    c="dimmed" 
                                                    fs="italic"
                                                    onClick={() => setEditingRule(rule)}
                                                    style={{ cursor: 'pointer' }}
                                                >
                                                    {(() => {
                                                        try {
                                                            const conds = typeof rule.match_conditions === 'string' 
                                                                ? JSON.parse(rule.match_conditions) 
                                                                : rule.match_conditions;
                                                             if (conds && conds.target_class) {
                                                                 const count = (conds.conditions || []).length;
                                                                 return `${conds.target_class}${count > 0 ? ` (+${count})` : ''}`;
                                                             }
                                                             if (conds && conds.conditions && conds.conditions.length > 0) {
                                                                 return `All Classes (${conds.conditions.length})`;
                                                             }
                                                             return 'All Classes';
                                                        } catch {
                                                            return 'Invalid JSON';
                                                        }
                                                    })()}
                                                </Text>
                                            </Stack>
                                        </Paper>
                                    ))}
                                </Fragment>
                            ))}
                            {rules.length === 0 && (
                                <Paper withBorder p="xl" style={{ borderStyle: 'dashed', background: 'transparent' }}>
                                    <Text size="xs" c="dimmed" ta="center">No rules defined for this profile.</Text>
                                </Paper>
                            )}
                        </Stack>
                            ) : (
                                <Table striped highlightOnHover verticalSpacing="xs">
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Name</Table.Th>
                                            <Table.Th>Visuals</Table.Th>
                                            <Table.Th>Conditions</Table.Th>
                                            <Table.Th>Pri</Table.Th>
                                            <Table.Th style={{ width: 120, textAlign: 'right' }}>Actions</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {processedRules.map(group => (
                                            <Fragment key={group.groupName || 'flat'}>
                                                {group.groupName && (
                                                    <Table.Tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                                        <Table.Td colSpan={5}>
                                                            <Group gap="xs">
                                                                <Package size={14} opacity={0.6} />
                                                                <Text size="xs" fw={700} c="blue.4">{group.groupName}</Text>
                                                                <Badge size="xs" variant="outline" color="gray">{group.rules.length} Rules</Badge>
                                                            </Group>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                )}
                                                {group.rules.map(rule => (
                                                    <Table.Tr key={rule.id}>
                                                        <Table.Td 
                                                            onClick={() => setEditingRule(rule)}
                                                            style={{ cursor: 'pointer', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                        >
                                                            {rule.name}
                                                        </Table.Td>
                                                        <Table.Td onClick={() => setEditingRule(rule)} style={{ cursor: 'pointer' }}>
                                                            <Group gap={4}>
                                                                {rule.config?.color_hex && <ColorSwatch color={rule.config.color_hex} size={10} />}
                                                                <Badge color="blue" variant="light" size="xs" style={{ textTransform: 'none' }}>
                                                                    {rule.config?.visual_type}
                                                                    {rule.config?.size && ` (${rule.config.size})`}
                                                                </Badge>
                                                                {rule.config?.label && <Badge color="gray" variant="outline" size="xs">{rule.config.label}</Badge>}
                                                            </Group>
                                                        </Table.Td>
                                                        <Table.Td onClick={() => setEditingRule(rule)} style={{ cursor: 'pointer' }}>
                                                            <Text size="xs" c="dimmed" truncate="end" style={{ maxWidth: 150 }}>
                                                                {(() => {
                                                                    try {
                                                                        const conds = typeof rule.match_conditions === 'string' 
                                                                            ? JSON.parse(rule.match_conditions) 
                                                                            : rule.match_conditions;
                                                                         if (conds && conds.target_class) {
                                                                             const count = (conds.conditions || []).length;
                                                                             return `${conds.target_class}${count > 0 ? ` (+${count})` : ''}`;
                                                                         }
                                                                         if (conds && conds.conditions && conds.conditions.length > 0) {
                                                                             return `All Classes (${conds.conditions.length})`;
                                                                         }
                                                                         return 'All Classes';
                                                                    } catch {
                                                                        return 'Invalid JSON';
                                                                    }
                                                                })()}
                                                            </Text>
                                                        </Table.Td>
                                                        <Table.Td onClick={() => setEditingRule(rule)} style={{ cursor: 'pointer' }}>
                                                            {rule.priority}
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Group gap={4} wrap="nowrap" justify="flex-end">
                                                                <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                                                                    <Switch 
                                                                        size="xs" 
                                                                        checked={rule.enabled}
                                                                        onChange={async (e) => {
                                                                            const updatedRule = { ...rule, enabled: e.currentTarget.checked };
                                                                            await saveDisplayRule(updatedRule);
                                                                            if (selectedConfigId) loadRules(selectedConfigId);
                                                                            onRulesChanged?.();
                                                                        }}
                                                                        title="Toggle Enabled"
                                                                    />
                                                                </div>
                                                                <ActionIcon 
                                                                    size="md" 
                                                                    variant="subtle" 
                                                                    color="blue" 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDuplicateRule(rule.id);
                                                                    }}
                                                                    title="Duplicate rule"
                                                                >
                                                                    <Copy size={18} />
                                                                </ActionIcon>
                                                                <ActionIcon 
                                                                    size="md" 
                                                                    variant="subtle" 
                                                                    color="red" 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDeleteRule(rule.id);
                                                                    }}
                                                                    title="Delete rule"
                                                                >
                                                                    <Trash2 size={18} />
                                                                </ActionIcon>
                                                            </Group>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                ))}
                                            </Fragment>
                                        ))}
                                        {rules.length === 0 && (
                                            <Table.Tr>
                                                <Table.Td colSpan={5} align="center" style={{ padding: 20 }}>
                                                    <Text size="xs" c="dimmed">No rules defined for this profile.</Text>
                                                </Table.Td>
                                            </Table.Tr>
                                        )}
                                    </Table.Tbody>
                                </Table>
                            )}
                        </Stack>
                    )}
                </Paper>
            </Stack>
            )}
        </AnalysisWindow>

        <AnalysisWindow
            isOpen={isEditorOpen}
            onClose={() => setIsEditorOpen(false)}
            title="SVG Live Editor"
            storageKey="svg-live-editor"
            zIndex={zIndex + 1}
            onFocus={onFocus}
        >
            <Stack gap="md" h="100%">
                <Grid gutter="md" style={{ flex: 1, minHeight: 0 }}>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Stack gap={5} h="100%">
                            <Group gap="xs">
                                <Code size={14} />
                                <Text size="xs" fw={700}>SVG Code</Text>
                            </Group>
                            <Textarea
                                placeholder='<svg ...>...</svg>'
                                value={editorValue}
                                onChange={(e) => setEditorValue(e.currentTarget.value)}
                                minRows={isMobile ? 8 : 15}
                                autosize
                                styles={{ input: { fontFamily: 'monospace', fontSize: '11px', flex: 1 } }}
                                style={{ flex: 1 }}
                            />
                        </Stack>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Stack gap={5} h="100%">
                            <Group gap="xs">
                                <Eye size={14} />
                                <Text size="xs" fw={700}>Preview</Text>
                            </Group>
                            <Paper 
                                withBorder 
                                style={{ 
                                    width: '100%', 
                                    flex: 1, 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    background: 'rgba(255,255,255,0.05)',
                                    minHeight: 200,
                                    overflow: 'auto',
                                    padding: '10px'
                                }}
                            >
                                <div 
                                    style={{ maxWidth: '100%', maxHeight: '100%', display: 'flex' }}
                                    dangerouslySetInnerHTML={{ __html: editorValue }} 
                                />
                            </Paper>
                        </Stack>
                    </Grid.Col>
                </Grid>
                <Group justify="flex-end" py="xs" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <Button variant="outline" size="xs" onClick={() => setIsEditorOpen(false)}>Discard</Button>
                    <Button color="blue" size="xs" onClick={saveFromEditor}>Apply to Rule</Button>
                </Group>
            </Stack>
        </AnalysisWindow>
    </Fragment>
    );
};
