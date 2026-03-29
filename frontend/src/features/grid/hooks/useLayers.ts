import { useMemo, useRef, MutableRefObject } from 'react';
import { ScatterplotLayer, PathLayer, IconLayer, TextLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import type { Node, Edge } from '../../../shared/types';
import { getBearing, stringToColor, getVisualType, getNodeColor, getEdgeColor, edgeMidpoint } from '../model/mapUtils';

interface UseLayersParams {
    clusteredData: { nodesToRender: Node[]; clusters: any[] };
    visualEdgePaths: any[];
    nodes: Node[];
    edges: Edge[];
    nodePositions: Record<string, [number, number]>;
    spriteMap: any;
    viewState: any;
    hoveredNodeId: string | null;
    hoveredEdgeId: string | null;
    highlightedNodes: Set<string>;
    highlightedEdges: Set<string>;
    selectedNodeIdsSet: Set<string>;
    nodeAverages: Record<string, number> | null;
    voltageScale: any;
    isDraggingRef: MutableRefObject<boolean>;
    onNodeClick: (node: Node, multiSelect: boolean) => void;
    onEdgeClick?: (edge: Edge, multiSelect: boolean) => void;
    setHoveredNodeId: (id: string | null) => void;
    setHoveredEdgeId: (id: string | null) => void;
    onTooltipHover: (obj: Node | Edge | null, x: number, y: number) => void;
    setViewState: (updater: (prev: any) => any) => void;
}

export function useLayers(p: UseLayersParams) {
    const nodeBearings = useMemo(() => {
        const bearings: Record<string, number> = {};
        p.nodes.forEach(node => {
            if (!node.display_rotate_to_edge) return;
            const edge = p.edges.find(e => e.source === node.id || e.target === node.id);
            if (edge) bearings[node.id] = getBearing(edge.sourcePosition, edge.targetPosition);
        });
        return bearings;
    }, [p.nodes, p.edges]);

    const edgeBearings = useMemo(() => {
        const bearings: Record<string, number> = {};
        p.edges.forEach(edge => {
            if (edge.display_rotate_to_edge) {
                bearings[edge.id || `${edge.source}-${edge.target}`] = getBearing(edge.sourcePosition, edge.targetPosition);
            }
        });
        return bearings;
    }, [p.edges]);

    return useMemo(() => [
        new ScatterplotLayer({
            id: 'selection-halo',
            data: p.clusteredData.nodesToRender.filter(n => p.selectedNodeIdsSet.has(n.id)),
            getPosition: (d: Node) => p.nodePositions[d.id],
            getFillColor: [255, 255, 255, 80],
            getRadius: (d: Node) => { const vt = getVisualType(d); return vt === 'Meter' || vt === 'Bus' ? 7 : 10; },
            radiusUnits: 'pixels',
            radiusScale: 1,
            pickable: false,
            updateTriggers: { getRadius: [p.selectedNodeIdsSet], getFillColor: [p.selectedNodeIdsSet] },
        }),
        new PathLayer({
            id: 'grid-lines-hit-area',
            data: p.visualEdgePaths,
            getPath: (d: any) => d.path,
            getColor: () => [0, 0, 0, 0],
            getWidth: () => 15,
            widthUnits: 'pixels',
            pickable: true,
            autoHighlight: false,
            onHover: (info: any) => {
                const obj = info.object as Edge | null;
                p.setHoveredEdgeId(obj ? (obj.id || `${obj.source}-${obj.target}`) : null);
                p.onTooltipHover(obj, info.x, info.y);
            },
            onClick: (info: any, event: any) => {
                const srcEvent = event?.srcEvent as MouseEvent;
                if (info.object && srcEvent && p.onEdgeClick) p.onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
            },
        }),
        new PathLayer({
            id: 'grid-lines',
            data: p.visualEdgePaths,
            getPath: (d: any) => d.path,
            getColor: (d: Edge) => {
                if (p.nodeAverages && p.nodeAverages[d.target] !== undefined && p.voltageScale) {
                    const pu = p.nodeAverages[d.target] / (p.voltageScale.baseVoltage || 120);
                    if (pu > p.voltageScale.criticalHigh) return [255, 107, 107, 200];
                    if (pu >= p.voltageScale.highWarning) return [250, 150, 80, 200];
                    if (pu >= p.voltageScale.lowWarning) return [46, 204, 113, 200];
                    if (pu >= p.voltageScale.criticalLow) return [241, 196, 15, 200];
                    return [142, 68, 173, 200];
                }
                if (p.highlightedEdges.has(d.id || '') || p.highlightedEdges.has(`${d.source}-${d.target}`)) return [60, 160, 240, 200];
                return d.circuit_id && d.circuit_id !== 'unknown' ? [...stringToColor(d.circuit_id), 120] as [number, number, number, number] : [150, 150, 150, 150];
            },
            getWidth: (d: Edge) => {
                const isHovered = (d.id && p.hoveredEdgeId === d.id) || p.hoveredEdgeId === `${d.source}-${d.target}`;
                if (isHovered) return 4;
                const realPhases = d.phases ? d.phases.filter(ph => !['N', 'Neutral'].includes(ph)) : ['A', 'B', 'C'];
                let width = 1 + (Math.max(1, realPhases.length) - 1) * 0.75;
                if (p.nodeAverages && p.nodeAverages[d.target] !== undefined) width += 1;
                if (p.highlightedEdges.has(d.id || '') || p.highlightedEdges.has(`${d.source}-${d.target}`)) width += 1;
                return width;
            },
            widthUnits: 'pixels',
            getDashArray: (d: Edge) => {
                const count = d.phases ? d.phases.length : 3;
                if (count === 1) return [4, 4];
                if (count === 2) return [12, 6];
                return [0, 0];
            },
            dashJustified: true,
            extensions: [new PathStyleExtension({ dash: true })],
            pickable: false,
            updateTriggers: {
                getColor: [p.highlightedEdges, p.nodeAverages, p.voltageScale],
                getWidth: [p.highlightedEdges, p.hoveredEdgeId, p.nodeAverages],
            },
        }),
        new ScatterplotLayer({
            id: 'grid-buses',
            data: p.clusteredData.nodesToRender.filter(n => (getVisualType(n) === 'Bus' || n.type === 'ConnectivityNode') && !n.display_icon),
            getPosition: (d: Node) => p.nodePositions[d.id],
            getFillColor: (d: Node) => p.selectedNodeIdsSet.has(d.id) ? [255, 200, 50, 255] : [150, 150, 150, 150],
            getRadius: (d: Node) => (p.hoveredNodeId === d.id || p.selectedNodeIdsSet.has(d.id)) ? 4 : 2,
            updateTriggers: {
                getRadius: [p.hoveredNodeId, p.selectedNodeIdsSet],
                getFillColor: [p.highlightedNodes, p.selectedNodeIdsSet, p.nodeAverages, p.voltageScale],
            },
            radiusUnits: 'pixels',
            radiusScale: 1,
            pickable: true,
            onHover: (info: any) => {
                const obj = info.object as Node | null;
                p.setHoveredNodeId(obj ? obj.id : null);
                p.onTooltipHover(obj, info.x, info.y);
            },
            onClick: (info: any, event: any) => {
                const srcEvent = event?.srcEvent as MouseEvent;
                if (info.object && srcEvent && p.onNodeClick) p.onNodeClick(info.object as Node, srcEvent.shiftKey || srcEvent.ctrlKey);
            },
        }),
        ...(p.spriteMap ? [
            new IconLayer<Node>({
                id: 'grid-nodes-custom',
                data: p.clusteredData.nodesToRender.filter(n => !!n.display_icon && !!p.spriteMap.mapping[n.display_icon!]),
                getPosition: (d: Node) => d.position,
                iconAtlas: p.spriteMap.atlasUrl,
                iconMapping: p.spriteMap.mapping,
                getIcon: (d: Node) => d.display_icon!,
                getColor: (d: Node) => getNodeColor(d, getVisualType(d), p.highlightedNodes.has(d.id), p.selectedNodeIdsSet.has(d.id), d.circuit_id),
                getSize: (d: Node) => {
                    const sizeAttr = (d.display_size ?? 1.0) * 32;
                    let size = p.hoveredNodeId === d.id ? sizeAttr * 1.5 : sizeAttr;
                    if (p.highlightedNodes.has(d.id)) size *= 1.2;
                    return size;
                },
                sizeScale: Math.pow(1.5, (p.viewState.zoom || 14) - 14),
                sizeMinPixels: 1,
                pickable: true,
                onHover: (info: any) => {
                    const obj = info.object as Node | null;
                    p.setHoveredNodeId(obj ? obj.id : null);
                    p.onTooltipHover(obj, info.x, info.y);
                },
                onClick: (info: any, event: any) => {
                    if (p.isDraggingRef.current) return;
                    const srcEvent = event?.srcEvent as MouseEvent;
                    if (info.object && srcEvent) p.onNodeClick(info.object, srcEvent.shiftKey || srcEvent.ctrlKey);
                },
                updateTriggers: {
                    getSize: [p.hoveredNodeId, p.highlightedNodes, p.nodes],
                    getIcon: [p.nodes, p.spriteMap],
                    getColor: [p.highlightedNodes, p.selectedNodeIdsSet, p.nodes],
                    getAngle: [nodeBearings],
                },
                getAngle: (d: Node) => nodeBearings[d.id] || 0,
            }),
            new IconLayer<Edge>({
                id: 'grid-custom-edge-icons',
                data: p.edges.filter(e => e.display_icon && !!p.spriteMap.mapping[e.display_icon!]),
                getPosition: (d: Edge) => edgeMidpoint(d),
                iconAtlas: p.spriteMap.atlasUrl,
                iconMapping: p.spriteMap.mapping,
                getIcon: (d: Edge) => d.display_icon!,
                getColor: (d: Edge) => getEdgeColor(d, p.highlightedEdges.has(d.id || ''), p.hoveredEdgeId === d.id, d.circuit_id),
                getSize: (d: Edge) => {
                    const sizeAttr = d.display_size ?? 1.0;
                    let size = p.hoveredEdgeId === d.id ? sizeAttr * 1.5 : sizeAttr;
                    if (p.highlightedEdges.has(d.id || '')) size *= 1.2;
                    return size;
                },
                sizeScale: Math.pow(1.5, (p.viewState.zoom || 14) - 14),
                sizeMinPixels: 1,
                pickable: true,
                onHover: (info: any) => {
                    const obj = info.object as Edge | null;
                    p.setHoveredEdgeId(obj ? (obj.id ?? null) : null);
                    p.onTooltipHover(obj, info.x, info.y);
                },
                onClick: (info: any, event: any) => {
                    if (p.isDraggingRef.current) return;
                    const srcEvent = event?.srcEvent as MouseEvent;
                    if (info.object && srcEvent && p.onEdgeClick) p.onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
                },
                updateTriggers: {
                    getSize: [p.hoveredEdgeId, p.highlightedEdges, p.edges],
                    getIcon: [p.edges, p.spriteMap],
                    getColor: [p.highlightedEdges, p.hoveredEdgeId, p.edges],
                    getAngle: [edgeBearings],
                },
                getAngle: (d: Edge) => edgeBearings[d.id || `${d.source}-${d.target}`] || 0,
            }),
        ] : []),
        new ScatterplotLayer({
            id: 'clusters',
            data: p.clusteredData.clusters,
            getPosition: (d: any) => d.position,
            getFillColor: [40, 40, 40, 220],
            getLineColor: [100, 100, 100, 255],
            getLineWidth: 2,
            lineWidthUnits: 'pixels',
            getRadius: (d: any) => d.pointCount < 10 ? 15 : d.pointCount < 100 ? 20 : 25,
            radiusUnits: 'pixels',
            pickable: true,
            onClick: (info: any) => {
                if (info.object?.position) {
                    p.setViewState((prev: any) => ({ ...prev, longitude: info.object.position[0], latitude: info.object.position[1], zoom: prev.zoom + 2, transitionDuration: 500 }));
                }
            },
        }),
        new TextLayer({
            id: 'cluster-counts',
            data: p.clusteredData.clusters,
            getPosition: (d: any) => d.position,
            getText: (d: any) => d.pointCountAbbreviated.toString(),
            getSize: 12,
            getColor: [255, 255, 255],
            getAngle: 0,
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            updateTriggers: { getPosition: [p.clusteredData.clusters] },
        }),
    ], [p.clusteredData, p.visualEdgePaths, p.hoveredNodeId, p.hoveredEdgeId, p.highlightedNodes, p.highlightedEdges, p.selectedNodeIdsSet, p.nodeAverages, p.voltageScale, p.onNodeClick, p.onEdgeClick, p.viewState.zoom, p.nodePositions, p.nodes, p.edges, p.spriteMap, nodeBearings, edgeBearings]);
}
