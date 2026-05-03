import { ChartNetwork } from 'lucide-react';
import { createElement } from 'react';
import type { SdkPluginDefinition } from '@plugin-sdk';
import { DiagnosticExplorerWindow } from './components/DiagnosticExplorerWindow';

export const diagnosticExplorerPlugin: SdkPluginDefinition = {
    type: 'diagnostic_explorer',
    category: 'system',
    label: 'Diagnostic Explorer',
    description: 'Explore CIM relationships and attributes in a force-directed graph.',
    icon: ChartNetwork,
    color: 'blue',

    appliesToNodes: () => true,

    handleRun(ctx) {
        const selectedNode = ctx.selectedNodes[0];
        const selectedEdgeId = ctx.selectedEdgeIds[0];
        
        let reportName = 'Diagnostic Explorer';
        if (selectedNode) {
            reportName = `Explore: ${selectedNode.name || selectedNode.id}`;
        } else if (selectedEdgeId) {
            // Truncate long edge IDs for readability
            const displayId = selectedEdgeId.length > 12 ? `${selectedEdgeId.slice(0, 8)}…` : selectedEdgeId;
            reportName = `Explore Edge: ${displayId}`;
        }
        
        const windowId = ctx.openAnalysisWindow('diagnostic_explorer', reportName);
        
        // Ensure initialized state
        ctx.updateWindowProps(windowId, { loading: false });
    },

    renderWindow(instance, callbacks) {
        return createElement(DiagnosticExplorerWindow, { 
            instance: instance as any, 
            onClose: callbacks.onClose, 
            onMinimize: callbacks.onMinimize,
            onFocus: callbacks.onFocus,
            onSelectAndNavigateToNode: callbacks.selectAndNavigateToNode
        });
    },
};

export default diagnosticExplorerPlugin;
