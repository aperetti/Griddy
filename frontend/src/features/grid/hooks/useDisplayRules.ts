import { useState, useEffect, useCallback } from 'react';
import { 
    fetchDisplayConfigs, 
    fetchDisplayRules,
    saveDisplayRule as apiSaveDisplayRule, 
    deleteDisplayRule as apiDeleteDisplayRule,
    duplicateDisplayRule as apiDuplicateDisplayRule,
    setDefaultDisplayConfig as apiSetDefaultDisplayConfig,
    createDisplayConfig as apiCreateDisplayConfig,
    deleteDisplayConfig as apiDeleteDisplayConfig,
    updateDisplayConfig as apiUpdateDisplayConfig,
    testDisplayRule as apiTestDisplayRule,
    exportDisplayConfig as apiExportDisplayConfig,
    importDisplayConfig as apiImportDisplayConfig,
    type DisplayConfig, 
    type DisplayRule,
    type RuleTestResponse
} from '../../../shared/api';

export const useDisplayRules = (opened: boolean, onRulesChanged?: () => void) => {
    const [configs, setConfigs] = useState<DisplayConfig[]>([]);
    const [selectedConfigId, setSelectedConfigId] = useState<number | null>(null);
    const [rules, setRules] = useState<DisplayRule[]>([]);
    const [editingRule, setEditingRule] = useState<Partial<DisplayRule> | null>(null);
    const [configError, setConfigError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('adminAuth'));

    const loadConfigs = useCallback(async () => {
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
            } else {
                setConfigError(err.message || 'Failed to connect to display service.');
            }
        }
    }, [selectedConfigId]);

    const loadRules = useCallback(async (configId: number) => {
        try {
            const data = await fetchDisplayRules(configId);
            setRules(data);
        } catch (err) {
            console.error('Failed to load rules', err);
        }
    }, []);

    useEffect(() => {
        if (opened && isAuthenticated) {
            loadConfigs();
        }
    }, [opened, isAuthenticated, loadConfigs]);

    useEffect(() => {
        if (selectedConfigId) {
            loadRules(selectedConfigId);
        }
    }, [selectedConfigId, loadRules]);

    const handleSetDefault = async (configId: number) => {
        try {
            await apiSetDefaultDisplayConfig(configId);
            await loadConfigs();
            onRulesChanged?.();
        } catch (err) {
            console.error('Failed to set default', err);
        }
    };

    const handleSaveRule = async () => {
        if (!editingRule || !selectedConfigId) return;
        try {
            setSaveError(null);
            await apiSaveDisplayRule({ ...editingRule, config_id: selectedConfigId });
            setEditingRule(null);
            await loadRules(selectedConfigId);
            onRulesChanged?.();
        } catch (err: any) {
            console.error('Failed to save rule', err);
            setSaveError(err.message || 'Failed to save rule. Check JSON format and required fields.');
        }
    };

    const handleDeleteRule = async (ruleId: number) => {
        try {
            await apiDeleteDisplayRule(ruleId);
            if (selectedConfigId) {
                await loadRules(selectedConfigId);
                onRulesChanged?.();
            }
        } catch (err) {
            console.error('Failed to delete rule', err);
        }
    };

    const handleToggleRule = async (ruleId: number, enabled: boolean) => {
        const rule = rules.find(r => r.id === ruleId);
        if (!rule || !selectedConfigId) return;
        try {
            await apiSaveDisplayRule({ ...rule, enabled: !enabled });
            await loadRules(selectedConfigId);
            onRulesChanged?.();
        } catch (err) {
            console.error('Failed to toggle rule', err);
        }
    };

    const handleDuplicateRule = async (ruleId: number) => {
        try {
            await apiDuplicateDisplayRule(ruleId);
            if (selectedConfigId) {
                await loadRules(selectedConfigId);
                onRulesChanged?.();
            }
        } catch (err) {
            console.error('Failed to duplicate rule', err);
        }
    };

    const createConfig = async (name: string) => {
        try {
            const newConfig = await apiCreateDisplayConfig(name);
            await loadConfigs();
            setSelectedConfigId(newConfig.id);
        } catch (err) {
            console.error('Failed to create config', err);
        }
    };

    const deleteConfig = async (configId: number) => {
        try {
            await apiDeleteDisplayConfig(configId);
            const data = await fetchDisplayConfigs();
            setConfigs(data);
            if (selectedConfigId === configId) {
                const def = data.find(c => c.is_default) || data[0];
                setSelectedConfigId(def?.id || null);
            }
        } catch (err) {
            console.error('Failed to delete config', err);
        }
    };

    const renameConfig = async (configId: number, newName: string) => {
        try {
            await apiUpdateDisplayConfig(configId, newName);
            await loadConfigs();
        } catch (err) {
            console.error('Failed to rename config', err);
        }
    };

    const handleTestRule = async (conditions: any, targetClass: string): Promise<RuleTestResponse> => {
        try {
            return await apiTestDisplayRule(conditions, targetClass);
        } catch (err: any) {
            return {
                query: '',
                params: {},
                match_count: 0,
                warnings: [err.message || 'Failed to test rule']
            };
        }
    };

    const handleExportConfig = async (configId: number) => {
        setSaveError(null);
        try {
            const data = await apiExportDisplayConfig(configId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `display_profile_${data.metadata?.name || configId}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to export config', err);
            setSaveError('Failed to export profile');
        }
    };

    const handleImportConfig = async (data: any) => {
        setSaveError(null);
        try {
            const newConfig = await apiImportDisplayConfig(data);
            await loadConfigs();
            setSelectedConfigId(newConfig.id);
            onRulesChanged?.();
        } catch (err) {
            console.error('Failed to import config', err);
            setSaveError('Failed to import profile: ' + (err as Error).message);
        }
    };

    return {
        configs,
        selectedConfigId,
        setSelectedConfigId,
        rules,
        editingRule,
        setEditingRule,
        configError,
        saveError,
        isAuthenticated,
        setIsAuthenticated,
        handleSetDefault,
        handleSaveRule,
        handleDeleteRule,
        handleToggleRule,
        handleDuplicateRule,
        createConfig,
        deleteConfig,
        renameConfig,
        handleTestRule,
        handleExportConfig,
        handleImportConfig,
        refreshRules: () => selectedConfigId && loadRules(selectedConfigId)
    };
};
