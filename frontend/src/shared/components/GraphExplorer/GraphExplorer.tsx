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
}

export function GraphExplorer({ rootId, onSelectAttribute, schema, isMobile }: GraphExplorerProps) {
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
