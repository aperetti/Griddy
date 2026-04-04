import { Network } from 'lucide-react';
import { createElement } from 'react';
import type { SdkPluginDefinition } from '@plugin-sdk';
import { DiagnosticExplorerWindow } from './components/DiagnosticExplorerWindow';

export const diagnosticExplorerPlugin: SdkPluginDefinition = {
    type: 'diagnostic_explorer',
    category: 'system',
    label: 'Diagnostic Explorer',
    description: 'Explore CIM relationships and attributes in a force-directed graph.',
    icon: Network,
    color: 'blue',

    appliesToNodes: () => true,

    handleRun(ctx) {
        const selectedId = ctx.selectedNodes[0]?.id || null;
        const reportName = selectedId ? `Explore: ${ctx.selectedNodes[0].name || selectedId}` : 'Diagnostic Explorer';
        
        const windowId = ctx.openAnalysisWindow('diagnostic_explorer', reportName);
        
        // Ensure initialized state
        ctx.updateWindowProps(windowId, { loading: false });
    },

    renderWindow(instance, callbacks) {
        // Our component handles the display logic
        return createElement(DiagnosticExplorerWindow, { 
            instance: instance as any, 
            onClose: callbacks.onClose, 
            onMinimize: callbacks.onMinimize,
            onFocus: () => {} 
        });
    },
};

export default diagnosticExplorerPlugin;
