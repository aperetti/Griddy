import { Zap } from 'lucide-react';
import { createElement } from 'react';
import type { PluginDefinition } from '../types';
import type { Node } from '../../shared/types';
import { fetchTransformerLoading } from './api';
import { TransformerLoadingWindow } from './TransformerLoadingWindow';

function isTransformerNode(node: Node): boolean {
    // Nodes can carry attached_equipment with PowerTransformer entries
    if ((node.attached_equipment || []).some(eq => eq.type === 'PowerTransformer')) return true;
    // display_type is set by the display rule engine when rules match
    if (node.display_type === 'PowerTransformer') return true;
    // Fallback: node type directly named
    if (node.type === 'PowerTransformer') return true;
    return false;
}

export const transformerLoadingPlugin: PluginDefinition = {
    type: 'transformer_loading',
    label: 'Transformer Loading',
    icon: Zap,
    color: 'yellow',

    appliesToNodes: (nodes: Node[]) => nodes.some(isTransformerNode),

    handleRun({ selectedNodes, setAnalysisWindows, bringWindowToFront }) {
        const nodeIds = selectedNodes.map(n => n.id);
        const nodeName =
            nodeIds.length === 1
                ? (selectedNodes[0].name ?? 'Transformer')
                : `${nodeIds.length} Transformers`;

        const id = `transformer_loading-${Date.now()}`;

        setAnalysisWindows(prev => [...prev, {
            id,
            type: 'transformer_loading',
            nodeIds,
            nodeName,
            isOpen: true,
            isMinimized: false,
            loading: true,
            data: [],
            zIndex: 1000,
        }]);

        bringWindowToFront(id);

        fetchTransformerLoading(nodeIds)
            .then(resp =>
                setAnalysisWindows(prev =>
                    prev.map(w => w.id === id ? { ...w, loading: false, data: resp.transformers } : w)
                )
            )
            .catch(err => {
                console.error('[transformer_loading] fetch failed', err);
                setAnalysisWindows(prev =>
                    prev.map(w => w.id === id ? { ...w, loading: false } : w)
                );
            });
    },

    renderWindow(instance, { onClose, onMinimize }) {
        return createElement(TransformerLoadingWindow, { instance, onClose, onMinimize });
    },
};
