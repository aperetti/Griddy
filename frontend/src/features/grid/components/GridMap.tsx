import React, { useMemo, useState, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { WebMercatorViewport } from '@deck.gl/core';
import type { Node, Edge } from '../../../shared/types';
import { useSpriteMap } from '../hooks/useSpriteMap';
import { useCimTooltip } from '../hooks/useCimTooltip';
import { useViewState } from '../hooks/useViewState';
import { useClustering } from '../hooks/useClustering';
import { useLayers } from '../hooks/useLayers';
import { renderRuleTooltip, getTooltipContent } from '../model/tooltipRenderer';

interface GridMapProps {
    nodes: Node[];
    edges: Edge[];
    onNodeClick: (node: Node, multiSelect: boolean) => void;
    onEdgeClick?: (edge: Edge, multiSelect: boolean) => void;
    highlightedNodes?: Set<string>;
    highlightedEdges?: Set<string>;
    selectedNodeIds?: string[];
    nodeAverages?: Record<string, number> | null;
    edgeAverages?: Record<string, number> | null;
    nodeCurrents?: Record<string, { a: number, b: number, c: number }> | null;
    onMapClick?: () => void;
    voltageScale?: {
        criticalHigh: number;
        highWarning: number;
        lowWarning: number;
        criticalLow: number;
        baseVoltage: number;
    };
    fitHighlightedNodesTrigger?: number;
    skipGlobalFit?: boolean;
    onViewStateChange?: (viewState: any) => void;
    goToLocation?: { longitude: number; latitude: number; zoom?: number } | null;
    spriteVersion?: number;
    edgeColorBase?: 'circuit' | 'model';
}

export const GridMap = React.memo((props: GridMapProps) => {
    const {
        nodes,
        edges,
        onNodeClick,
        onEdgeClick,
        highlightedNodes = new Set(),
        highlightedEdges = new Set(),
        selectedNodeIds = [],
        nodeAverages = null,
        edgeAverages = null,
        nodeCurrents = null,
        onMapClick,
        voltageScale,
        fitHighlightedNodesTrigger = 0,
        skipGlobalFit = false,
        onViewStateChange,
        goToLocation,
        spriteVersion = 0,
        edgeColorBase = 'circuit',
    } = props;

    const selectedNodeIdsSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

    const [mounted, setMounted] = useState(false);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const isDraggingRef = useRef(false);
    const lastDragTime = useRef(0);
    const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

    const spriteMap = useSpriteMap(spriteVersion);
    const { cimCache, hoverInfo, onTooltipHover } = useCimTooltip();
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

    const { viewState, setViewState, handleViewStateChange } = useViewState({
        nodes, dimensions, highlightedNodes, fitHighlightedNodesTrigger, skipGlobalFit, goToLocation, onViewStateChange,
    });

    const { clusteredData, nodePositions, visualEdgePaths, offsetEdges } = useClustering({ nodes, edges, viewState, dimensions });

    const layers = useLayers({
        clusteredData, visualEdgePaths, offsetEdges, nodes, edges, nodePositions, spriteMap, viewState,
        hoveredNodeId, hoveredEdgeId, highlightedNodes, highlightedEdges, selectedNodeIdsSet,
        nodeAverages, edgeAverages, voltageScale, isDraggingRef,
        onNodeClick, onEdgeClick, setHoveredNodeId, setHoveredEdgeId, onTooltipHover, setViewState,
        edgeColorBase,
    });

    useEffect(() => {
        setMounted(true);
        const updateSize = () => setDimensions({
            width: window.innerWidth,
            height: window.innerHeight >= 500 ? window.innerHeight : 500,
        });
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    const tooltipCtx = { nodeAverages, nodeCurrents };

    const persistentTooltip = useMemo(() => {
        if (selectedNodeIds.length !== 1 || !dimensions.width) return null;
        const node = nodes.find(n => n.id === selectedNodeIds[0]);
        if (!node) return null;

        const viewport = new WebMercatorViewport({ width: dimensions.width, height: dimensions.height, ...viewState });
        const [x, y] = viewport.project(nodePositions[node.id] || node.position);
        if (x < 0 || x > dimensions.width || y < 0 || y > dimensions.height) return null;

        const tooltip = getTooltipContent(node, tooltipCtx);
        if (!tooltip) return null;

        return (
            <div
                className="persistent-grid-tooltip"
                style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -105%)', zIndex: 1000, pointerEvents: 'auto', cursor: 'default' }}
                dangerouslySetInnerHTML={{ __html: tooltip.html }}
                onClick={(e) => e.stopPropagation()}
            />
        );
    }, [selectedNodeIds, nodes, viewState, dimensions, nodeAverages, nodeCurrents, voltageScale, nodePositions]);

    return (
        <div style={{ position: 'relative', width: '100vw', height: '100vh', minHeight: '500px', background: '#141517' }}>
            {mounted && dimensions.width > 0 && dimensions.height > 0 && (
                <>
                    <DeckGL
                        width={dimensions.width}
                        height={dimensions.height}
                        useDevicePixels={false}
                        onWebGLInitialized={(gl) => { if (!gl) console.error('WebGL context failed to initialize.'); }}
                        initialViewState={viewState}
                        viewState={viewState}
                        onViewStateChange={handleViewStateChange}
                        onInteractionStateChange={({ isDragging, isPanning, isZooming }) => {
                            if (isDragging || isPanning || isZooming) {
                                isDraggingRef.current = true;
                                lastDragTime.current = Date.now();
                            } else if (!isDragging && !isPanning && !isZooming) {
                                setTimeout(() => { isDraggingRef.current = false; }, 250);
                            }
                        }}
                        onDragStart={(info) => { mouseDownPos.current = { x: info.x, y: info.y }; }}
                        onDragEnd={() => {}}
                        getCursor={({ isHovering }) => isHovering ? 'pointer' : (isDraggingRef.current ? 'grabbing' : 'grab')}
                        onClick={(info, event) => {
                            const timeSinceDrag = Date.now() - lastDragTime.current;
                            const srcEvent = (event as any)?.srcEvent || (event as any)?.nativeEvent;
                            const target = srcEvent?.target as HTMLElement;
                            if (target && (target.closest('.grid-map-tooltip') || target.closest('.persistent-grid-tooltip'))) {
                                console.log('[GridMap] Click on tooltip detected, ignoring background click');
                                mouseDownPos.current = null;
                                return;
                            }
                            let isActualClick = true;
                            if (mouseDownPos.current) {
                                const dx = info.x - mouseDownPos.current.x;
                                const dy = info.y - mouseDownPos.current.y;
                                console.log('[GridMap] onClick check - dist:', Math.sqrt(dx * dx + dy * dy).toFixed(1), 'isDragging:', isDraggingRef.current);
                                if (Math.sqrt(dx * dx + dy * dy) > 7) isActualClick = false;
                            }
                            if (isDraggingRef.current || timeSinceDrag < 200 || !isActualClick) {
                                console.log('[GridMap] Skipping selection clear due to drag/movement detection.');
                                mouseDownPos.current = null;
                                return;
                            }
                            mouseDownPos.current = null;
                            if (!info.object && onMapClick) {
                                console.log('[GridMap] Background click - CLEARING SELECTION');
                                onMapClick();
                            }
                        }}
                        controller={{ dragRotate: false, doubleClickZoom: true, touchRotate: false }}
                        layers={layers}
                        getTooltip={info => {
                            if (selectedNodeIds.length === 1 && info.object?.id === selectedNodeIds[0]) return null;
                            if (info.object?.display_tooltip) return null;
                            return getTooltipContent(info.object, tooltipCtx);
                        }}
                    />
                    {persistentTooltip}
                    {hoverInfo && (() => {
                        const html = renderRuleTooltip(hoverInfo.obj, cimCache[hoverInfo.obj.id ?? '']);
                        if (!html) return null;
                        return (
                            <div
                                style={{ position: 'absolute', left: hoverInfo.x + 12, top: hoverInfo.y + 12, zIndex: 500, pointerEvents: 'none' }}
                                dangerouslySetInnerHTML={{ __html: html }}
                            />
                        );
                    })()}
                </>
            )}
        </div>
    );
});
