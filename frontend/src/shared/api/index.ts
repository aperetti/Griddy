/**
 * API barrel — re-exports domain modules to preserve all existing import paths.
 * Individual modules can be imported directly for tree-shaking.
 */

// Topology / feeder management
export { fetchTopology, fetchModels, loadModel, unloadModel, resolveNodeModel } from './topology';
export type { TopologyResponse, ModelInfo } from './topology';

// Analytics (consumption, voltage, phase balance, alarms)
export { runPhaseAnalytics, fetchConsumption, fetchConsumptionEstimate, fetchVoltageDistribution, fetchVoltageEstimate, fetchMapVoltage, fetchMapVoltageEstimate, fetchAlarms } from './analytics';
export type { ConsumptionResponse, VoltageDistributionResponse, MapVoltageResponse, Alarm, PhaseBalanceResponse } from './analytics';

// CIM diagnostics
export { fetchCimEquipment, fetchCimNode, fetchCimProperties, fetchCimNeighbors, searchCim, fetchCimSchema, fetchConductingEquipmentClasses, fetchRootableClasses, fetchAdjacentClasses, fetchCimEquipmentExpanded, fetchCimConnections } from './cim';

// Display rules CRUD
export { fetchActiveDisplayRules, fetchDisplayConfigs, fetchDisplayRules, createDisplayConfig, updateDisplayConfig, deleteDisplayConfig, setDefaultDisplayConfig, saveDisplayRule, deleteDisplayRule, duplicateDisplayRule, exportDisplayConfig, importDisplayConfig, testDisplayRule, ADMIN_API_BASE } from './displayRules';
export type { DisplayConfig, RuleConfig, DisplayRule, RuleTestResponse } from './displayRules';

// --- Remaining misc functions ---

const API_BASE = '/api';

export const nlQuery = async (query: string): Promise<any> => {
    const res = await fetch(`${API_BASE}/agent/query`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) {
        throw new Error('Query failed');
    }
    return res.json();
};

export const fetchPluginRegistry = async (): Promise<Array<{name: string, enabled: boolean}>> => {
    const response = await fetch(`${API_BASE}/plugins/registry`);
    if (!response.ok) throw new Error('Failed to fetch plugin registry');
    return response.json();
};

export const fetchConfigOverrides = async (): Promise<Array<{key: string, value: string}>> => {
    const response = await fetch(`${API_BASE}/cim/config`);
    if (!response.ok) throw new Error('Failed to fetch configuration overrides');
    return response.json();
};
