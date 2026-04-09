import { useRef, useEffect, useState } from 'react';
import { useSelection, type GraphCanvasRef } from 'reagraph';
import { useGraphExplorer, type GraphPathStep } from '../../hooks/useGraphExplorer';
import { DesktopExplorer } from './layouts/DesktopExplorer';
import { MobileExplorer } from './layouts/MobileExplorer';
import { GraphPopOut } from './components/GraphPopOut';

interface GraphExplorerProps {
    rootId: string;
    onSelectAttribute: (path: string, value: any, operator?: string, graphPath?: GraphPathStep[]) => void;
    schema: Record<string, any>;
    isMobile: boolean;
    /** Called whenever the selected node changes. Receives the ordered CIM class chain
     *  from the root node to the selected node, e.g. ['ConnectivityNode','Terminal','PowerElectronicsConnection'].
     *  Use this to auto-populate path steps in the rule builder. */
    onNodePathChange?: (cimClassChain: string[]) => void;
}

export function GraphExplorer({ rootId, onSelectAttribute, schema, isMobile, onNodePathChange }: GraphExplorerProps) {
    const graphRef = useRef<GraphCanvasRef | null>(null);
    const modalGraphRef = useRef<GraphCanvasRef | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [popOut, setPopOut] = useState(false);

    const {
        nodes, edges, detailCache, selectedId, loadingIds, pendingExpansion,
        loadRoot, expandNode, selectNode, reset, getPathTo,
    } = useGraphExplorer();

    // Wrap onSelectAttribute to inject the graph path when the selected node
    // is not the root — gives the query builder the exact traversal hops.
    const onSelectWithPath = (path: string, value: any, operator?: string) => {
        const graphPath = selectedId ? (getPathTo(selectedId) ?? undefined) : undefined;
        onSelectAttribute(path, value, operator, graphPath);
    };

    useEffect(() => {
        if (rootId) loadRoot(rootId);
    }, [rootId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fire onNodePathChange whenever the selected node changes so consumers
    // (e.g. PathStepBuilder) can auto-populate the graph path.
    useEffect(() => {
        if (!onNodePathChange) return;
        const rootNode = nodes.find(n => n.data?.isRoot);
        if (!rootNode) return;
        const rootClass = rootNode.data?.cimType ?? rootNode.label ?? '';
        if (!selectedId || selectedId === rootNode.id) {
            onNodePathChange([rootClass]);
            return;
        }
        const hops = getPathTo(selectedId);
        if (hops) {
            onNodePathChange([rootClass, ...hops.map(h => h.label)]);
        }
    }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

    const { selections, actives, onNodeClick, onCanvasClick } = useSelection({
        ref: graphRef,
        nodes,
        edges,
        focusOnSelect: 'singleOnly',
        type: 'single',
        onSelection: (ids) => { if (ids[0]) selectNode(ids[0]); },
    });

    const {
        selections: modalSelections,
        actives: modalActives,
        onNodeClick: modalOnNodeClick,
        onCanvasClick: modalOnCanvasClick
    } = useSelection({
        ref: modalGraphRef,
        nodes,
        edges,
        focusOnSelect: 'singleOnly',
        type: 'single',
        onSelection: (ids) => { if (ids[0]) selectNode(ids[0]); },
    });

    const handleNodePointerOver = (node: any) => {
        if (!isMobile) return;
        longPressTimerRef.current = setTimeout(() => expandNode(node.id), 500);
    };

    const handleNodePointerOut = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const selectedDetails = selectedId ? detailCache[selectedId] : null;

    const commonProps = {
        nodes, edges, graphRef, selections, actives,
        onNodeClick, onCanvasClick, expandNode, reset,
        setPopOut, pendingExpansion, loadingIds,
        selectedDetails, selectedId, onSelectWithPath, schema
    };

    return (
        <>
            {isMobile ? (
                <MobileExplorer 
                    {...commonProps}
                    handleNodePointerOver={handleNodePointerOver}
                    handleNodePointerOut={handleNodePointerOut}
                />
            ) : (
                <DesktopExplorer {...commonProps} />
            )}

            <GraphPopOut
                opened={popOut}
                onClose={() => setPopOut(false)}
                graphRef={modalGraphRef}
                nodes={nodes}
                edges={edges}
                selections={modalSelections}
                actives={modalActives}
                onNodeClick={modalOnNodeClick}
                onCanvasClick={modalOnCanvasClick}
                expandNode={expandNode}
            />
        </>
    );
}
