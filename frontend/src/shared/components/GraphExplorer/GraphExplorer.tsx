import { useRef, useEffect, useState } from 'react';
import { useSelection, type GraphCanvasRef } from 'reagraph';
import { Portal } from '@mantine/core';
import { useGraphExplorer, type GraphPathStep } from '../../hooks/useGraphExplorer';
import { DesktopExplorer } from './layouts/DesktopExplorer';
import { MobileExplorer } from './layouts/MobileExplorer';
import { GraphPopOut } from './components/GraphPopOut';
import { NodeTooltip } from './components/NodeTooltip';

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
    const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

    const {
        nodes, edges, detailCache, selectedId, hoveredId, loadingIds, pendingExpansion,
        loadRoot, expandNode, selectNode, pinTerminals, hoverNode, unhoverNode, reset, getPathTo,
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

    // After each expansion that added Terminal nodes, wait for the force simulation
    // to settle then pin each terminal's fx/fy close to its parent CN.
    useEffect(() => {
        const hasUnpinned = nodes.some(
            n => n.data?.isTerminal && n.data?.parentId && n.fx === undefined,
        );
        if (!hasUnpinned || !graphRef.current) return;
        const timer = setTimeout(() => {
            const graph = graphRef.current?.getGraph();
            if (!graph) return;
            pinTerminals(id => {
                try {
                    if (!graph.hasNode(id)) return null;
                    const a = graph.getNodeAttributes(id);
                    return typeof a.x === 'number' ? { x: a.x, y: a.y } : null;
                } catch { return null; }
            });
        }, 700);
        return () => clearTimeout(timer);
    }, [nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // On mobile: show the tooltip whenever a node is selected (no hover available).
    // Position it centered near the top of the viewport so it sits above the graph canvas.
    useEffect(() => {
        if (!isMobile) return;
        if (selectedId) {
            hoverNode(selectedId);
            setHoverPos({ x: window.innerWidth / 2 - 130, y: 70 });
        } else {
            unhoverNode();
            setHoverPos(null);
        }
    }, [selectedId, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

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
        onSelection: (ids) => {
            if (!ids[0]) return;
            selectNode(ids[0]);
            const node = nodes.find(n => n.id === ids[0]);
            if (node?.data?.cimType === 'ConnectivityNode') {
                expandNode(ids[0]);
            }
        },
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

    const handleNodePointerOver = (node: any, event?: any) => {
        if (isMobile) {
            longPressTimerRef.current = setTimeout(() => expandNode(node.id), 500);
            return;
        }
        hoverNode(node.id);
        const x = event?.clientX ?? event?.nativeEvent?.clientX ?? 0;
        const y = event?.clientY ?? event?.nativeEvent?.clientY ?? 0;
        setHoverPos({ x, y });
    };

    const handleNodePointerOut = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (!isMobile) {
            unhoverNode();
            setHoverPos(null);
        }
    };

    const selectedDetails = selectedId ? detailCache[selectedId] : null;

    // On mobile, tapping the canvas deselects — clear the tooltip too.
    const handleCanvasClick = (event: any) => {
        if (onCanvasClick) onCanvasClick(event);
        if (isMobile) {
            unhoverNode();
            setHoverPos(null);
        }
    };

    const commonProps = {
        nodes, edges, graphRef, selections, actives,
        onNodeClick, onCanvasClick: handleCanvasClick, expandNode, reset,
        setPopOut, pendingExpansion, loadingIds,
        selectedDetails, selectedId, onSelectWithPath, schema
    };

    const hoveredNode = hoveredId ? nodes.find(n => n.id === hoveredId) : null;

    return (
        <>
            {isMobile ? (
                <MobileExplorer
                    {...commonProps}
                    handleNodePointerOver={handleNodePointerOver}
                    handleNodePointerOut={handleNodePointerOut}
                />
            ) : (
                <DesktopExplorer
                    {...commonProps}
                    handleNodePointerOver={handleNodePointerOver}
                    handleNodePointerOut={handleNodePointerOut}
                />
            )}

            {hoveredId && hoverPos && (
                <Portal>
                    <NodeTooltip
                        nodeLabel={hoveredNode?.label ?? ''}
                        nodeSubLabel={hoveredNode?.subLabel}
                        details={detailCache[hoveredId] ?? null}
                        x={hoverPos.x}
                        y={hoverPos.y}
                    />
                </Portal>
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
