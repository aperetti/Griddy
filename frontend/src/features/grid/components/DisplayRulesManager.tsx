import React, { useState, useMemo } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { Filter, ArrowDownAZ } from 'lucide-react';
import { 
    Button, Group, Stack, 
    Paper, Box, Tooltip, Menu
} from '@mantine/core';
import { AnalysisWindow } from '../../../shared/components/AnalysisWindow';

import { useDisplayRules } from '../hooks/useDisplayRules';
import { RuleEditor } from './display-rules/RuleEditor';
import { SvgLiveEditor } from './display-rules/SvgLiveEditor';
import { ConfirmationModal } from './display-rules/ConfirmationModal';
import { InputModal } from './display-rules/InputModal';

// New Sub-components
import { RuleAuthOverlay } from './display-rules/RuleAuthOverlay';
import { ConfigToolbar } from './display-rules/ConfigToolbar';
import { RuleTable } from './display-rules/RuleTable';

// Model Logic
import { processRules } from '../model/rules';
import { fetchDisplayConfigs } from '../../../shared/api/displayRules';

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

    // Realignment: Use pure Model function for processing rules
    const processedRules = useMemo(() => 
        processRules(rules, groupBy, sortBy, sortOrder),
    [rules, groupBy, sortBy, sortOrder]);

    const handleLogin = async (username: string, password: string) => {
        setIsAuthenticating(true);
        const token = window.btoa(`${username}:${password}`);
        localStorage.setItem('adminAuth', token);

        try {
            await fetchDisplayConfigs();
            setIsAuthenticated(true);
            setAuthError(null);
        } catch (err) {
            localStorage.removeItem('adminAuth');
            setAuthError('Invalid credentials');
        } finally {
            setIsAuthenticating(false);
        }
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
            <RuleAuthOverlay 
                onClose={onClose}
                onLogin={handleLogin}
                error={authError}
                isAuthenticating={isAuthenticating}
                zIndex={zIndex}
            />
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
                            <ConfigToolbar 
                                configs={configs}
                                selectedConfigId={selectedConfigId}
                                onSelectConfig={setSelectedConfigId}
                                onSetDefault={handleSetDefault}
                                onDeleteConfig={(config) => setConfirmModal({
                                    opened: true,
                                    title: 'Delete Profile',
                                    message: `Are you sure you want to delete the profile "${config.name}" and all its rules? This action cannot be undone.`,
                                    onConfirm: () => deleteConfig(config.id),
                                    color: 'red'
                                })}
                                onCreateConfig={() => setInputModal({
                                    opened: true,
                                    title: 'New Profile',
                                    label: 'Profile Name',
                                    placeholder: 'e.g. Planning Scenarios',
                                    onSubmit: (name) => createConfig(name)
                                })}
                                onRenameConfig={(config) => setInputModal({
                                    opened: true,
                                    title: 'Rename Profile',
                                    label: 'New Name',
                                    initialValue: config.name,
                                    placeholder: 'e.g. New Profile Name',
                                    onSubmit: (name) => renameConfig(config.id, name)
                                })}
                                onExportConfig={handleExportConfig}
                                onImportConfig={(data) => {
                                    try {
                                        handleImportConfig(data);
                                        setGeneralError(null);
                                    } catch (err) {
                                        setGeneralError("Invalid JSON file provided for import.");
                                    }
                                }}
                                onAddRule={handleAddRule}
                                generalError={generalError}
                            />

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

                            <RuleTable 
                                groups={processedRules}
                                isMobile={isMobile}
                                onEditRule={setEditingRule}
                                onDuplicateRule={handleDuplicateRule}
                                onDeleteRule={(rule) => setConfirmModal({
                                    opened: true,
                                    title: 'Delete Rule',
                                    message: `Are you sure you want to delete the rule "${rule.name}"?`,
                                    onConfirm: () => handleDeleteRule(rule.id),
                                    color: 'red'
                                })}
                            />
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
