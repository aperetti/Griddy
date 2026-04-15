import { useMemo, type MutableRefObject } from 'react';
import { ScatterplotLayer, PathLayer, IconLayer, TextLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import type { Node, Edge } from '../../../shared/types';
import { getBearing, stringToColor, getVisualType, getNodeColor, getEdgeColor, edgeMidpoint, getPathMidpoint } from '../model/mapUtils';

interface UseLayersParams {
    clusteredData: { nodesToRender: Node[]; clusters: any[] };
    visualEdgePaths: any[];
    offsetEdges: Edge[];
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
    edgeAverages: Record<string, number> | null;
    voltageScale: any;
    isDraggingRef: MutableRefObject<boolean>;
    onNodeClick: (node: Node, multiSelect: boolean) => void;
    onEdgeClick?: (edge: Edge, multiSelect: boolean) => void;
    setHoveredNodeId: (id: string | null) => void;
    setHoveredEdgeId: (id: string | null) => void;
    onTooltipHover: (obj: Node | Edge | null, x: number, y: number) => void;
    setViewState: (updater: (prev: any) => any) => void;
    edgeColorBase?: 'circuit' | 'model';
}

export function useLayers(p: UseLayersParams) {
    const nodeBearings = useMemo(() => {
        const bearings: Record<string, number> = {};
        p.nodes.forEach(node => {
            if (!node.display_rotate_to_edge) return;
            const edge = p.offsetEdges.find(e => e.source === node.id || e.target === node.id);
            if (edge) bearings[node.id] = getBearing(edge.sourcePosition, edge.targetPosition);
        });
        return bearings;
    }, [p.nodes, p.offsetEdges]);

    const edgeBearings = useMemo(() => {
        const bearings: Record<string, number> = {};
        p.offsetEdges.forEach(edge => {
            if (edge.display_rotate_to_edge || edge.display_center_icon_rotate) {
                const key = edge.id || `${edge.source}-${edge.target}`;
                if (edge.waypoints && edge.waypoints.length >= 2) {
                    bearings[key] = getPathMidpoint(edge.waypoints).bearing;
                } else {
                    bearings[key] = getBearing(edge.sourcePosition, edge.targetPosition);
                }
            }
        });
        return bearings;
    }, [p.offsetEdges]);

    const propagatedNodeAverages = useMemo(() => {
        if (!p.nodeAverages) return null;
        
        const averages = { ...p.nodeAverages };
        const adjacency = new Map<string, string[]>();
        p.offsetEdges.forEach(e => {
            if (!adjacency.has(e.source)) adjacency.set(e.source, []);
            adjacency.get(e.source)!.push(e.target);
        });
        // ... (rest of function unchanged but using p.offsetEdges)

        const memo = new Map<string, number | null>();

        const getPropagatedValue = (id: string, visited: Set<string>): number | null => {
            if (averages[id] !== undefined) return averages[id];
            if (memo.has(id)) return memo.get(id)!;
            if (visited.has(id)) return null;
            
            visited.add(id);
            const targets = adjacency.get(id) || [];
            if (targets.length === 0) return null;

            let sum = 0;
            let count = 0;
            for (const target of targets) {
                const val = getPropagatedValue(target, new Set(visited));
                if (val !== null) {
                    sum += val;
                    count++;
                }
            }

            const res = count > 0 ? sum / count : null;
            memo.set(id, res);
            return res;
        };

        const result: Record<string, number> = {};
        p.nodes.forEach(node => {
            const val = getPropagatedValue(node.id, new Set());
            if (val !== null) result[node.id] = val;
        });

        return result;
    }, [p.nodeAverages, p.edges, p.nodes]);

    const uniqueVisualEdgePaths = useMemo(() => {
        return p.visualEdgePaths.filter(e => !e.is_rule_clone);
    }, [p.visualEdgePaths]);

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
            data: uniqueVisualEdgePaths,
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
            data: uniqueVisualEdgePaths,
            getPath: (d: any) => d.path,
            getColor: (d: Edge) => {
                // 1. Voltage-based coloring (Node averages) - Per Unit (PU)
                const nodeAvg = propagatedNodeAverages?.[d.target];
                if (nodeAvg !== undefined && p.voltageScale) {
                    const { criticalHigh, highWarning, lowWarning, criticalLow, baseVoltage } = p.voltageScale;
                    const nodeAvgPU = nodeAvg / (baseVoltage || 230.0);
                    
                    if (nodeAvgPU > criticalHigh) return [255, 107, 107, 200]; // Critical High - Red
                    if (nodeAvgPU >= highWarning) return [250, 150, 80, 200]; // High - Orange
                    if (nodeAvgPU >= lowWarning)  return [46, 204, 113, 200]; // Normal - Green
                    if (nodeAvgPU >= criticalLow) return [241, 196, 15, 200]; // Low - Yellow
                    return [142, 68, 173, 200]; // Critical Low - Purple
                }
                
                // 2. Loading-based coloring (Edge averages) - % of capacity
                const edgeKey = d.id || `${d.source}-${d.target}`;
                if (p.edgeAverages && p.edgeAverages[edgeKey] !== undefined) {
                    const load = p.edgeAverages[edgeKey];
                    if (load > 100) return [255, 30, 30, 255]; // Red - Overload
                    if (load > 85) return [255, 140, 0, 255]; // Dark Orange - High
                    if (load > 60) return [255, 215, 0, 255]; // Gold - Normal High
                    if (load > 30) return [144, 238, 144, 255]; // Light Green - Normal
                    return [34, 139, 34, 255]; // Forest Green - Low
                }

                // 3. Status/Highlight colors
                const isHighlighted = p.highlightedEdges.has(d.id || '') || p.highlightedEdges.has(`${d.source}-${d.target}`);
                if (isHighlighted) return [255, 200, 50, 255]; // Amber/Yellow selection color
                if (p.hoveredEdgeId === (d.id || `${d.source}-${d.target}`)) return [255, 255, 255, 255];

                // 4. Rule-assigned fixed color
                if (d.display_color) {
                    const hex = d.display_color.replace('#', '');
                    if (hex.length === 6)
                        return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 220] as [number, number, number, number];
                }

                // 5. Base color strategy (global toggle: by zone or by feeder)
                const edgeColorBase = p.edgeColorBase ?? 'circuit';
                const baseId = edgeColorBase === 'model' ? (d.model_id ?? d.circuit_id) : d.circuit_id;
                return baseId && baseId !== 'unknown'
                    ? [...stringToColor(baseId), 120] as [number, number, number, number]
                    : [150, 150, 150, 150];
            },
            getWidth: (d: Edge) => {
                const edgeKey = d.id || `${d.source}-${d.target}`;
                const isHovered = p.hoveredEdgeId === edgeKey;
                const isHighlighted = p.highlightedEdges.has(d.id || '') || p.highlightedEdges.has(edgeKey);

                if (isHovered) return 4;
                if (d.display_line_weight !== undefined)
                    return d.display_line_weight + (isHighlighted ? 2 : 0);
                const realPhases = d.phases ? d.phases.filter(ph => !['N', 'Neutral'].includes(ph)) : ['A', 'B', 'C'];
                let width = 1 + (Math.max(1, realPhases.length) - 1) * 0.75;
                if (p.nodeAverages && p.nodeAverages[d.target] !== undefined) width += 1;
                if (p.edgeAverages && p.edgeAverages[edgeKey] !== undefined) width += 2;
                if (isHighlighted) width += 3;
                return width;
            },
            widthUnits: 'pixels',
            getDashArray: (d: Edge) => {
                if (d.display_line_style === 'solid')  return [0, 0];
                if (d.display_line_style === 'dashed') return [8, 4];
                if (d.display_line_style === 'dotted') return [2, 4];
                const count = d.phases ? d.phases.length : 3;
                if (count === 1) return [4, 4];
                if (count === 2) return [12, 6];
                return [0, 0];
            },
            dashJustified: true,
            extensions: [new PathStyleExtension({ dash: true })],
            pickable: false,
            updateTriggers: {
                getColor: [p.highlightedEdges, p.nodeAverages, p.edgeAverages, p.voltageScale, p.hoveredEdgeId, propagatedNodeAverages, p.edgeColorBase],
                getWidth: [p.highlightedEdges, p.hoveredEdgeId, p.nodeAverages, p.edgeAverages],
            },
        }),
        new ScatterplotLayer({
            id: 'grid-buses',
            data: p.clusteredData.nodesToRender.filter(n => (getVisualType(n) === 'Bus' || n.type === 'ConnectivityNode') && !n.display_icon),
            getPosition: (d: Node) => p.nodePositions[d.id],
            getFillColor: (d: Node) => {
                if (p.selectedNodeIdsSet.has(d.id)) return [255, 200, 50, 255];
                
                const nodeAvg = propagatedNodeAverages?.[d.id];
                if (nodeAvg !== undefined && p.voltageScale) {
                    const { criticalHigh, highWarning, lowWarning, criticalLow, baseVoltage } = p.voltageScale;
                    const nodeAvgPU = nodeAvg / (baseVoltage || 230.0);
                    
                    if (nodeAvgPU > criticalHigh) return [255, 107, 107, 200];
                    if (nodeAvgPU >= highWarning) return [250, 150, 80, 200];
                    if (nodeAvgPU >= lowWarning)  return [46, 204, 113, 200];
                    if (nodeAvgPU >= criticalLow) return [241, 196, 15, 200];
                    return [142, 68, 173, 200];
                }
                return [150, 150, 150, 150];
            },
            getRadius: (d: Node) => (p.hoveredNodeId === d.id || p.selectedNodeIdsSet.has(d.id)) ? 4 : 2,
            updateTriggers: {
                getRadius: [p.hoveredNodeId, p.selectedNodeIdsSet],
                getFillColor: [p.highlightedNodes, p.selectedNodeIdsSet, propagatedNodeAverages, p.voltageScale],
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
                getPixelOffset: (d: Node) => d.display_pixel_offset || [0, 0],
                iconAtlas: p.spriteMap.atlasUrl,
                iconMapping: p.spriteMap.mapping,
                getIcon: (d: Node) => d.display_icon!,
                getColor: (d: Node) => {
                    if (p.selectedNodeIdsSet.has(d.id)) return [255, 200, 50];
                    
                    const nodeAvg = propagatedNodeAverages?.[d.id];
                    if (nodeAvg !== undefined && p.voltageScale) {
                        const { criticalHigh, highWarning, lowWarning, criticalLow, baseVoltage } = p.voltageScale;
                        const nodeAvgPU = nodeAvg / (baseVoltage || 230.0);
                        
                        if (nodeAvgPU > criticalHigh) return [255, 107, 107];
                        if (nodeAvgPU >= highWarning) return [250, 150, 80];
                        if (nodeAvgPU >= lowWarning)  return [46, 204, 113];
                        if (nodeAvgPU >= criticalLow) return [241, 196, 15];
                        return [142, 68, 173];
                    }
                    
                    return getNodeColor(d, getVisualType(d), p.highlightedNodes.has(d.id), p.selectedNodeIdsSet.has(d.id), d.circuit_id);
                },
                getSize: (d: Node) => {
                    const sizeAttr = (d.display_size ?? 1.0) * 32;
                    let size = p.hoveredNodeId === d.id ? sizeAttr * 1.5 : sizeAttr;
                    if (p.highlightedNodes.has(d.id)) size *= 1.2;
                    return size;
                },
                sizeScale: Math.pow(1.2, (p.viewState.zoom || 14) - 14),
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
                    getColor: [p.highlightedNodes, p.selectedNodeIdsSet, p.nodes, propagatedNodeAverages],
                    getAngle: [nodeBearings],
                },
                getAngle: (d: Node) => nodeBearings[d.id] || 0,
            }),
            new IconLayer<Edge>({
                id: 'grid-custom-edge-icons',
                data: p.offsetEdges.filter(e => {
                    const hasIcon = (e.display_icon || e.display_center_icon_enabled) && !!p.spriteMap.mapping[e.display_icon || 'circle'];
                    if (!hasIcon) return false;

                    const zoom = p.viewState?.zoom ?? 14;
                    const minZ = e.display_min_zoom ?? 0;
                    const maxZ = (e.display_max_zoom === 0 || e.display_max_zoom === undefined) ? 24 : e.display_max_zoom;
                    
                    return zoom >= minZ && zoom <= maxZ;
                }),
                getPosition: (d: Edge) => edgeMidpoint(d),
                getPixelOffset: (d: Edge) => d.display_pixel_offset || [0, 0],
                iconAtlas: p.spriteMap.atlasUrl,
                iconMapping: p.spriteMap.mapping,
                getIcon: (d: Edge) => d.display_icon || 'circle',
                getColor: (d: Edge) => getEdgeColor(d, p.highlightedEdges.has(d.id || ''), p.hoveredEdgeId === d.id, d.circuit_id),
                getSize: (d: Edge) => {
                    const baseSize = d.display_center_icon_size ?? d.display_size ?? 1.0;
                    const sizeAttr = baseSize * 32;
                    let size = p.hoveredEdgeId === d.id ? sizeAttr * 1.5 : sizeAttr;
                    if (p.highlightedEdges.has(d.id || '')) size *= 1.2;
                    return size;
                },
                sizeScale: Math.pow(1.2, (p.viewState.zoom || 14) - 14),
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
                    getSize: [p.hoveredEdgeId, p.highlightedEdges, p.offsetEdges],
                    getIcon: [p.offsetEdges, p.spriteMap],
                    getColor: [p.highlightedEdges, p.hoveredEdgeId, p.offsetEdges],
                    getAngle: [edgeBearings],
                },
                getAngle: (d: Edge) => {
                    if (d.display_center_icon_rotate === false) return 0;
                    return edgeBearings[d.id || `${d.source}-${d.target}`] || 0;
                },
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
    ], [p.clusteredData, p.visualEdgePaths, p.hoveredNodeId, p.hoveredEdgeId, p.highlightedNodes, p.highlightedEdges, p.selectedNodeIdsSet, p.nodeAverages, p.edgeAverages, p.voltageScale, p.onNodeClick, p.onEdgeClick, p.viewState.zoom, p.nodePositions, p.nodes, p.edges, p.offsetEdges, p.spriteMap, nodeBearings, edgeBearings, propagatedNodeAverages]);
}
