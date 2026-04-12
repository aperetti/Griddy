import React, { useState, Fragment, useMemo } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { Plus, Trash2, Copy, Lock, Filter, ArrowDownAZ, ListOrdered, FileDown, FileUp, MoreVertical, CheckCircle2, Pencil, CircleDashed } from 'lucide-react';
import { 
    Table, Button, Group, ActionIcon, Stack, Text, 
    Badge, Select, TextInput, Paper,
    Box, Tooltip, Menu, rem, PasswordInput
} from '@mantine/core';
import { AnalysisWindow } from '../../analytics/components/AnalysisWindow';

function constrainSvg(content: string): string {
    return content
        .replace(/\s+width="[^"]*"/g, '')
        .replace(/\s+height="[^"]*"/g, '')
        .replace('<svg', '<svg height="20"');
}
import { type DisplayRule } from '../../../shared/api';
import { useDisplayRules } from '../hooks/useDisplayRules';
import { RuleEditor } from './display-rules/RuleEditor';
import { SvgLiveEditor } from './display-rules/SvgLiveEditor';
import { ConfirmationModal } from './display-rules/ConfirmationModal';
import { InputModal } from './display-rules/InputModal';

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
    const {
        configs, selectedConfigId, setSelectedConfigId, rules,
        editingRule, setEditingRule, saveError,
        isAuthenticated, setIsAuthenticated,
        handleSetDefault,
        handleSaveRule, handleDeleteRule, handleDuplicateRule,
        createConfig, deleteConfig, renameConfig, handleTestRule,
        handleExportConfig, handleImportConfig
    } = useDisplayRules(opened, onRulesChanged);

    // Filter/Sort/Group local UI state
    const [groupBy, setGroupBy] = useState<'none' | 'cim_class'>('none');
    const [sortBy, setSortBy] = useState<'priority' | 'name'>('priority');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    
    // Auth local UI state
    const [authUsername, setAuthUsername] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    
    // Live Editor local UI state
    const [liveEditorData, setLiveEditorData] = useState<{
        opened: boolean;
        value: string;
        onSave: (val: string) => void;
        baseSvg?: string;
        baseColor?: string;
    }>({ opened: false, value: '', onSave: () => {} });

    // Custom Modal State
    const [confirmModal, setConfirmModal] = useState<{
        opened: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        color?: string;
    }>({ opened: false, title: '', message: '', onConfirm: () => {} });

    const [inputModal, setInputModal] = useState<{
        opened: boolean;
        title: string;
        label: string;
        placeholder: string;
        initialValue?: string;
        onSubmit: (val: string) => void;
    }>({ opened: false, title: '', label: '', placeholder: '', initialValue: '', onSubmit: () => {} });

    const [generalError, setGeneralError] = useState<string | null>(null);

    const isMobile = useMediaQuery('(max-width: 768px)');

    // Grouping/Sorting Logic
    const processedRules = useMemo(() => {
        const getCimClass = (rule: DisplayRule) => {
            try {
                const conds = typeof rule.match_conditions === 'string' 
                    ? JSON.parse(rule.match_conditions) 
                    : rule.match_conditions;
                return conds?.target_class || 'Any Class';
            } catch { return 'Any Class'; }
        };

        const sorted = [...rules].sort((a, b) => {
            let comparison = sortBy === 'priority' 
                ? a.priority - b.priority 
                : a.name.localeCompare(b.name);
            return sortOrder === 'asc' ? comparison : -comparison;
        });

        if (groupBy === 'none') return [{ groupName: null, rules: sorted }];

        const groups: Record<string, DisplayRule[]> = {};
        sorted.forEach(rule => {
            const cls = getCimClass(rule);
            if (!groups[cls]) groups[cls] = [];
            groups[cls].push(rule);
        });

        return Object.keys(groups).sort().map(name => ({ groupName: name, rules: groups[name] }));
    }, [rules, groupBy, sortBy, sortOrder]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setIsAuthenticating(true);
        // Simple hardcoded auth for admin operations
        if (authUsername === 'admin' && authPassword === 'admin') {
            const token = window.btoa(`${authUsername}:${authPassword}`);
            localStorage.setItem('adminAuth', token);
            setIsAuthenticated(true);
            setAuthError(null);
        } else {
            setAuthError('Invalid credentials');
        }
        setIsAuthenticating(false);
    };

    const handleAddRule = () => {
        setEditingRule({
            name: 'New Rule', enabled: true, priority: 0,
            match_conditions: '{}',
            config: {
                visual_type: 'Custom', color_hex: '#339af0', size: 1.0,
                label: '', cluster_enabled: false, cluster_radius: 40,
                cluster_max_zoom: 20, cluster_min_points: 2,
                min_zoom: 0, max_zoom: 24, svg_overrides: []
            }
        });
    };

    if (!opened) return null;

    if (!isAuthenticated) {
        return (
            <AnalysisWindow 
                isOpen={true}
                storageKey="display-rules-auth"
                title="Display Rules Manager Access" 
                onClose={onClose} 
                zIndex={zIndex}
                initialWidth={400} 
                initialHeight={350}
            >
                <Box p="xl">
                    <Stack align="center" gap="md" py="xl">
                        <Lock size={40} color="gray" strokeWidth={1.5} />
                        <Text fw={600} size="lg">Restricted Access</Text>
                        <Text size="sm" c="dimmed" ta="center">Authentication is required to modify network display rules.</Text>
                        
                        <form onSubmit={handleLogin} style={{ width: '100%' }}>
                            <Stack gap="xs" mt="md">
                                <TextInput label="Username" value={authUsername} onChange={(e) => setAuthUsername(e.currentTarget.value)} />
                                <PasswordInput label="Password" value={authPassword} onChange={(e) => setAuthPassword(e.currentTarget.value)} />
                                {authError && <Text c="red" size="xs">{authError}</Text>}
                                <Button type="submit" fullWidth mt="md" loading={isAuthenticating}>Sign In</Button>
                            </Stack>
                        </form>
                    </Stack>
                </Box>
            </AnalysisWindow>
        );
    }

    return (
        <>
            <AnalysisWindow 
                isOpen={true}
                storageKey="display-rules-manager"
                title={editingRule ? `Edit Rule: ${editingRule.name}` : "Display Rules Manager"} 
                onClose={onClose}
                onFocus={onFocus}
                zIndex={zIndex}
                initialWidth={isMobile ? 380 : 850}
                initialHeight={isMobile ? 600 : 700}
            >
                <Box p="md">
                    {editingRule ? (
                        <RuleEditor 
                            rule={editingRule} 
                            onChange={setEditingRule}
                            onSave={handleSaveRule}
                            onCancel={() => setEditingRule(null)}
                            onTest={handleTestRule}
                            onOpenLiveEditor={(init, save, base, color) => setLiveEditorData({ 
                                opened: true, value: init, onSave: save, baseSvg: base, baseColor: color 
                            })}
                            error={saveError}
                        />
                    ) : (
                        <Stack gap="md">
                            {/* Profile Selection & Management */}
                            <Group justify="space-between">
                                <Group gap="xs">
                                    <Select 
                                        label="Display Profile"
                                        placeholder="Select profile"
                                        value={selectedConfigId?.toString()}
                                        onChange={(v) => setSelectedConfigId(v ? parseInt(v) : null)}
                                        data={configs.map(c => ({ value: c.id.toString(), label: `${c.name}${c.is_default ? ' (Default)' : ''}` }))}
                                        style={{ width: rem(250) }}
                                        comboboxProps={{ zIndex: 2000, withinPortal: true }}
                                    />
                                    
                                    {selectedConfigId && (
                                        <>
                                            <Tooltip label={configs.find(c => c.id === selectedConfigId)?.is_default ? "Profile is Already Default" : "Set as Default Profile"}>
                                                <ActionIcon 
                                                    variant="light" 
                                                    color="green" 
                                                    size="lg" 
                                                    mt="25px"
                                                    disabled={!!configs.find(c => c.id === selectedConfigId)?.is_default}
                                                    onClick={() => handleSetDefault(selectedConfigId)}
                                                >
                                                    <CheckCircle2 size={18} />
                                                </ActionIcon>
                                            </Tooltip>

                                            <Tooltip label="Delete Current Profile">
                                                <ActionIcon 
                                                    variant="light" 
                                                    color="red" 
                                                    size="lg" 
                                                    mt="25px"
                                                    disabled={!!configs.find(c => c.id === selectedConfigId)?.is_default}
                                                    onClick={() => {
                                                        const config = configs.find(c => c.id === selectedConfigId);
                                                        if (config) {
                                                            setConfirmModal({
                                                                opened: true,
                                                                title: 'Delete Profile',
                                                                message: `Are you sure you want to delete the profile "${config.name}" and all its rules? This action cannot be undone.`,
                                                                onConfirm: () => deleteConfig(config.id),
                                                                color: 'red'
                                                            });
                                                        }
                                                    }}
                                                >
                                                    <Trash2 size={18} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </>
                                    )}

                                    <Menu shadow="md" width={180} zIndex={2000} withinPortal>
                                        <Menu.Target>
                                            <ActionIcon variant="light" size="lg" mt="25px"><MoreVertical size={18} /></ActionIcon>
                                        </Menu.Target>
                                        <Menu.Dropdown>
                                            <Menu.Item leftSection={<Plus size={14} />} onClick={() => {
                                                setInputModal({
                                                    opened: true,
                                                    title: 'New Profile',
                                                    label: 'Profile Name',
                                                    placeholder: 'e.g. Planning Scenarios',
                                                    onSubmit: (name) => createConfig(name)
                                                });
                                            }}>New Profile</Menu.Item>
                                            <Menu.Item 
                                                leftSection={<FileUp size={14} />} 
                                                onClick={() => document.getElementById('import-profile-input')?.click()}
                                            >
                                                Import Profile
                                            </Menu.Item>

                                            {selectedConfigId && (
                                                <>
                                                    <Menu.Item 
                                                        leftSection={<Pencil size={14} />}
                                                        onClick={() => {
                                                            const config = configs.find(c => c.id === selectedConfigId);
                                                            if (config) {
                                                                setInputModal({
                                                                    opened: true,
                                                                    title: 'Rename Profile',
                                                                    label: 'New Name',
                                                                    initialValue: config.name,
                                                                    placeholder: 'e.g. New Profile Name',
                                                                    onSubmit: (name) => renameConfig(config.id, name)
                                                                });
                                                            }
                                                        }}
                                                    >
                                                        Rename Profile
                                                    </Menu.Item>
                                                    <Menu.Item 
                                                        leftSection={<FileDown size={14} />} 
                                                        onClick={() => handleExportConfig(selectedConfigId)}
                                                    >
                                                        Export Profile
                                                    </Menu.Item>
                                                </>
                                            )}
                                        </Menu.Dropdown>
                                    </Menu>

                                    <input 
                                        type="file" 
                                        id="import-profile-input" 
                                        style={{ display: 'none' }} 
                                        accept=".json"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onload = (event) => {
                                                    try {
                                                        const data = JSON.parse(event.target?.result as string);
                                                        handleImportConfig(data);
                                                        setGeneralError(null);
                                                    } catch (err) {
                                                        setGeneralError("Invalid JSON file provided for import.");
                                                    }
                                                };
                                                reader.readAsText(file);
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                </Group>
                                <Group mt="25px">
                                    {generalError && <Text c="red" size="xs" mr="md" fw={500}>{generalError}</Text>}
                                    <Button variant="light" color="blue" leftSection={<Plus size={16} />} onClick={handleAddRule}>
                                        Add Rule
                                    </Button>
                                </Group>
                            </Group>

                            {/* List Filters/Controls */}
                            <Paper withBorder p="xs" bg="rgba(255, 255, 255, 0.03)" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                                <Group justify="space-between">
                                    <Group gap="xs">
                                        <Tooltip label="Group by">
                                            <Menu shadow="md" width={150} zIndex={2000} withinPortal>
                                                <Menu.Target><Button variant="subtle" size="xs" leftSection={<Filter size={14} />}>Grouping</Button></Menu.Target>
                                                <Menu.Dropdown>
                                                    <Menu.Item onClick={() => setGroupBy('none')}>None</Menu.Item>
                                                    <Menu.Item onClick={() => setGroupBy('cim_class')}>By CIM Class</Menu.Item>
                                                </Menu.Dropdown>
                                            </Menu>
                                        </Tooltip>
                                        <Tooltip label="Sort order">
                                            <Menu shadow="md" width={150} zIndex={2000} withinPortal>
                                                <Menu.Target><Button variant="subtle" size="xs" leftSection={<ArrowDownAZ size={14} />}>Sorting</Button></Menu.Target>
                                                <Menu.Dropdown>
                                                    <Menu.Item onClick={() => setSortBy('priority')}>Priority</Menu.Item>
                                                    <Menu.Item onClick={() => setSortBy('name')}>Name</Menu.Item>
                                                    <Menu.Divider />
                                                    <Menu.Item onClick={() => setSortOrder('asc')}>Ascending</Menu.Item>
                                                    <Menu.Item onClick={() => setSortOrder('desc')}>Descending</Menu.Item>
                                                </Menu.Dropdown>
                                            </Menu>
                                        </Tooltip>
                                    </Group>
                                </Group>
                            </Paper>

                            {/* Rules Table */}
                            <Box style={{ overflowX: 'auto' }}>
                                <Table verticalSpacing="xs">
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th style={{ width: rem(40) }}>Icon</Table.Th>
                                            <Table.Th>Name</Table.Th>
                                            <Table.Th>Priority</Table.Th>
                                            <Table.Th>Status</Table.Th>
                                            <Table.Th style={{ width: rem(120) }}>Actions</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {processedRules.map((group, gIdx) => (
                                            <Fragment key={gIdx}>
                                                {group.groupName && (
                                                    <Table.Tr bg="rgba(255, 255, 255, 0.05)">
                                                        <Table.Td colSpan={5} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                                            <Text size="xs" fw={700} c="blue" tt="uppercase" lts="1px">{group.groupName}</Text>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                )}
                                                {group.rules.map((rule) => (
                                                    <Table.Tr 
                                                        key={rule.id}
                                                        onClick={() => setEditingRule(rule)}
                                                        style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <Table.Td>
                                                            {rule.config?.icon && rule.config.icon.includes('<svg') ? (
                                                                <Box
                                                                    style={{
                                                                        height: 20,
                                                                        color: rule.config?.color_hex || '#ccc',
                                                                        filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.4))',
                                                                        lineHeight: 0,
                                                                    }}
                                                                    dangerouslySetInnerHTML={{ __html: constrainSvg(rule.config.icon) }}
                                                                />
                                                            ) : (
                                                                <Box style={{
                                                                    width: 14, height: 14, borderRadius: '50%',
                                                                    backgroundColor: rule.config?.color_hex || '#ccc'
                                                                }} />
                                                            )}
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Text size="sm" fw={500}>{rule.name}</Text>
                                                        </Table.Td>
                                                        <Table.Td><Text size="xs">{rule.priority}</Text></Table.Td>
                                                        <Table.Td>
                                                            {isMobile ? (
                                                                rule.enabled
                                                                    ? <CheckCircle2 size={16} color="var(--mantine-color-green-5)" />
                                                                    : <CircleDashed size={16} color="var(--mantine-color-gray-5)" />
                                                            ) : (
                                                                <Badge color={rule.enabled ? 'green' : 'gray'} size="xs" variant="dot">
                                                                    {rule.enabled ? 'Active' : 'Disabled'}
                                                                </Badge>
                                                            )}
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Group gap={8}>
                                                                <ActionIcon variant="subtle" color="blue" size="sm" onClick={(e) => { e.stopPropagation(); setEditingRule(rule); }}><ListOrdered size={14} /></ActionIcon>
                                                                <ActionIcon variant="subtle" color="blue" size="sm" onClick={(e) => { e.stopPropagation(); handleDuplicateRule(rule.id); }}><Copy size={14} /></ActionIcon>
                                                                <ActionIcon 
                                                                    variant="subtle" 
                                                                    color="red" 
                                                                    size="sm" 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setConfirmModal({
                                                                            opened: true,
                                                                            title: 'Delete Rule',
                                                                            message: `Are you sure you want to delete the rule "${rule.name}"?`,
                                                                            onConfirm: () => handleDeleteRule(rule.id),
                                                                            color: 'red'
                                                                        });
                                                                    }}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </ActionIcon>
                                                            </Group>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                ))}
                                            </Fragment>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </Box>
                        </Stack>
                    )}
                </Box>
            </AnalysisWindow>

            <SvgLiveEditor 
                opened={liveEditorData.opened}
                onClose={() => setLiveEditorData(prev => ({ ...prev, opened: false }))}
                value={liveEditorData.value}
                onChange={(val) => setLiveEditorData(prev => ({ ...prev, value: val }))}
                onSave={() => {
                    liveEditorData.onSave(liveEditorData.value);
                    setLiveEditorData(prev => ({ ...prev, opened: false }));
                }}
                baseSvg={liveEditorData.baseSvg}
                baseColor={liveEditorData.baseColor}
                zIndex={zIndex + 100}
            />

            <ConfirmationModal 
                opened={confirmModal.opened}
                onClose={() => setConfirmModal(prev => ({ ...prev, opened: false }))}
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmColor={confirmModal.color}
            />

            <InputModal 
                opened={inputModal.opened}
                onClose={() => setInputModal({ ...inputModal, opened: false })}
                title={inputModal.title}
                label={inputModal.label}
                placeholder={inputModal.placeholder}
                initialValue={inputModal.initialValue}
                onSubmit={inputModal.onSubmit}
            />
        </>
    );
};
