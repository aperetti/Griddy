import React, { useMemo, useState, useEffect, useRef } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, PathLayer, IconLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import { WebMercatorViewport } from '@deck.gl/core';
import type { Node, Edge } from '../../../shared/types';

interface GridMapProps {
    nodes: Node[];
    edges: Edge[];
    onNodeClick: (node: Node, multiSelect: boolean) => void;
    onEdgeClick?: (edge: Edge, multiSelect: boolean) => void;
    highlightedNodes?: Set<string>;
    highlightedEdges?: Set<string>;
    selectedNodeIds?: string[];
    nodeAverages?: Record<string, number> | null;
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
    goToLocation?: { longitude: number; latitude: number } | null;
}
const stringToColor = (str: string): [number, number, number] => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Generate subtle colors (hue, saturation ~50%, lightness ~60%)
    // Converted to simple RGB hash
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    const hex = "00000".substring(0, 6 - c.length) + c;

    // Mix with gray to make it subtle
    const r = Math.floor((parseInt(hex.substring(0, 2), 16) + 150) / 2);
    const g = Math.floor((parseInt(hex.substring(2, 4), 16) + 150) / 2);
    const b = Math.floor((parseInt(hex.substring(4, 6), 16) + 150) / 2);

    return [r, g, b];
};

// Switch and breaker edge_type values
const SWITCH_EDGE_TYPES = new Set(['Breaker', 'LoadBreakSwitch', 'Fuse', 'Disconnector', 'Recloser']);

const SVG_CACHE = new Map<string, string>();
const SVG_DIM_CACHE = new Map<string, { width: number, height: number }>();

const OPEN_SWITCH_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><line x1="30" y1="10" x2="30" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /><line x1="70" y1="10" x2="70" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /></svg>`;
const CLOSE_SWITCH_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><line x1="30" y1="10" x2="30" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /><line x1="70" y1="10" x2="70" y2="90" stroke="currentColor" stroke-width="8" stroke-linecap="round" /><line x1="15" y1="65" x2="85" y2="35" stroke="currentColor" stroke-width="8" stroke-linecap="round" /></svg>`;
const TRANSFORMER_SVG = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><polygon points="50,15 15,85 85,85" stroke="currentColor" fill="none" stroke-width="8" stroke-linejoin="round" /></svg>`;
const CAPACITOR_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="currentColor" font-family="Arial, sans-serif" font-weight="bold" font-size="12">C</text></svg>`;

const getSvgDataUrl = (svg: string, color?: string, css?: string) => {
    if (!svg) return '';
    const cacheKey = `${svg}_${color || ''}_${css || ''}`;
    if (SVG_CACHE.has(cacheKey)) return SVG_CACHE.get(cacheKey)!;
    
    let processedSvg = svg;

    // Inject CSS if provided
    if (css && css.trim()) {
        const styleBlock = `<style>${css}</style>`;
        if (processedSvg.includes('</svg>')) {
            processedSvg = processedSvg.replace('</svg>', `${styleBlock}</svg>`);
        } else {
            processedSvg = `${processedSvg}${styleBlock}`;
        }
    }

    if (color) {
        // Replace currentColor with actual color
        processedSvg = processedSvg.replace(/currentColor/g, color);
        
        // Inject color into fill and stroke attributes, skipping "none"
        processedSvg = processedSvg.replace(/fill=["'](?!none)[^"']+["']/g, `fill="${color}"`)
                                   .replace(/stroke=["'](?!none)[^"']+["']/g, `stroke="${color}"`);
                          
        // Also handle cases where there's no fill/stroke (use defaults)
        if (processedSvg === svg && !css) { // Don't force-inject if we added custom CSS which might handle its own colors
            processedSvg = processedSvg.replace('<svg', `<svg fill="${color}" stroke="${color}"`);
        }
    }

    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(processedSvg)}`;
    SVG_CACHE.set(cacheKey, url);
    return url;
};

const getSvgDimensions = (svg: string): { width: number, height: number } => {
    if (!svg) return { width: 128, height: 128 };
    if (SVG_DIM_CACHE.has(svg)) return SVG_DIM_CACHE.get(svg)!;
    
    try {
        // Try to find width/height attributes
        const widthMatch = svg.match(/width=["']([\d.]+)/);
        const heightMatch = svg.match(/height=["']([\d.]+)/);
        
        // Try to find viewBox
        const viewBoxMatch = svg.match(/viewBox=["'][\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)/);
        
        let width = 24;
        let height = 24;
        
        if (widthMatch && heightMatch) {
            width = parseFloat(widthMatch[1]);
            height = parseFloat(heightMatch[1]);
        } else if (viewBoxMatch) {
            width = parseFloat(viewBoxMatch[1]);
            height = parseFloat(viewBoxMatch[2]);
        }
        
        const res = { width, height };
        SVG_DIM_CACHE.set(svg, res);
        return res;
    } catch (e) {
        return { width: 24, height: 24 };
    }
};

// Derive a visual category from node.type and attached_equipment.
// After the CIM refactor, node.type is only "Bus" | "Substation"; richer
// categories come from what equipment is attached at the node.
const getVisualType = (node: Node): string => {
    if (node.display_type) return node.display_type;
    if (node.type === 'Substation') return 'Substation';
    const attached = node.attached_equipment ?? [];
    if (attached.some(eq => eq.type === 'EnergySource')) return 'Substation';
    if (attached.some(eq => eq.type === 'EnergyConsumer')) return 'Meter';
    if (attached.some(eq => eq.type === 'Capacitor')) return 'Capacitor';
    return 'Bus';
};

const getNodeColor = (node: Node, visualType: string, isHighlighted: boolean, isSelected: boolean, circuitId?: string): [number, number, number] => {
    if (isSelected) return [255, 200, 50];
    if (isHighlighted) return [60, 160, 240];

    if (node.display_color) {
        const hex = node.display_color.replace('#', '');
        if (hex.length === 6) {
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return [r, g, b];
        }
    }

    if (circuitId && circuitId !== 'unknown') {
        return stringToColor(circuitId);
    }

    switch (visualType) {
        case 'Substation':
            return [255, 50, 50];
        case 'Meter':
            return [100, 255, 100];
        case 'Capacitor':
            return [255, 210, 80];
        case 'Regulator':
            return [255, 120, 0];
        case 'Recloser':
            return [0, 200, 255];
        default:
            return [200, 200, 200];
    }
};

const getEdgeColor = (edge: Edge, isHighlighted: boolean, isHovered: boolean, circuitId?: string): [number, number, number] => {
    if (isHighlighted) return [60, 160, 240];
    if (isHovered) return [255, 255, 255];

    if (edge.display_color) {
        const hex = edge.display_color.replace('#', '');
        if (hex.length === 6) {
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return [r, g, b];
        }
    }

    // Default coloring for switches if no rule override
    if (edge.edge_type && SWITCH_EDGE_TYPES.has(edge.edge_type)) {
        return edge.is_open ? [255, 107, 107] : [105, 219, 124]; // Red for open, Green for closed
    }

    if (circuitId && circuitId !== 'unknown') {
        return stringToColor(circuitId);
    }

    return [150, 150, 150];
};

const edgeMidpoint = (d: Edge): [number, number] => [
    (d.sourcePosition[0] + d.targetPosition[0]) / 2,
    (d.sourcePosition[1] + d.targetPosition[1]) / 2,
];

const getBearing = (source: [number, number], target: [number, number]) => {
    // Distort longitude by latitude for geographic bearing
    const dx = (target[0] - source[0]) * Math.cos((source[1] * Math.PI) / 180);
    const dy = target[1] - source[1];
    // Return degrees clockwise from North
    return 90 - (Math.atan2(dy, dx) * 180) / Math.PI;
};

export const GridMap = React.memo<GridMapProps>(({
    nodes,
    edges,
    onNodeClick,
    onEdgeClick,
    highlightedNodes = new Set(),
    highlightedEdges = new Set(),
    selectedNodeIds = [],
    nodeAverages = null,
    nodeCurrents = null,
    onMapClick,
    voltageScale,
    fitHighlightedNodesTrigger = 0,
    skipGlobalFit = false,
    onViewStateChange,
    goToLocation,
}) => {
    const selectedNodeIdsSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
    const [mounted, setMounted] = useState(false);
    const isDraggingRef = useRef(false);
    const lastDragTime = useRef(0);
    const mouseDownPos = useRef<{x: number, y: number} | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    const [viewState, setViewState] = useState<any>({
        longitude: -118.2437,
        latitude: 34.0522,
        zoom: 14,
        pitch: 0,
        bearing: 0
    });
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
    const lastFittedNodes = useRef<Node[] | null>(null);

    useEffect(() => {
        if (nodes.length > 0 && dimensions.width > 0 && nodes !== lastFittedNodes.current && !skipGlobalFit) {
            console.log('[GridMap] Fitting to extent of', nodes.length, 'nodes');
            lastFittedNodes.current = nodes;
            
            let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
            nodes.forEach(n => {
                const [lon, lat] = n.position;
                if (!isNaN(lon) && !isNaN(lat)) {
                    minLon = Math.min(minLon, lon);
                    maxLon = Math.max(maxLon, lon);
                    minLat = Math.min(minLat, lat);
                    maxLat = Math.max(maxLat, lat);
                }
            });

            if (minLon === Infinity) return;

            const viewport = new WebMercatorViewport({
                width: dimensions.width,
                height: dimensions.height,
                ...viewState
            });

            const bounds = viewport.fitBounds(
                [[minLon, minLat], [maxLon, maxLat]],
                {
                    padding: Math.min(dimensions.width, dimensions.height) * 0.1,
                    maxZoom: 18
                }
            );

            setViewState((prev: any) => ({
                ...prev,
                longitude: bounds.longitude,
                latitude: bounds.latitude,
                zoom: bounds.zoom,
                transitionDuration: 1000
            }));
        }
    }, [nodes, dimensions.width, dimensions.height]);

    // Handle external navigation from minimap
    const lastGoTo = useRef<{ longitude: number; latitude: number } | null>(null);
    useEffect(() => {
        if (goToLocation && goToLocation !== lastGoTo.current) {
            lastGoTo.current = goToLocation;
            setViewState((prev: any) => ({
                ...prev,
                longitude: goToLocation.longitude,
                latitude: goToLocation.latitude,
                transitionDuration: 300
            }));
        }
    }, [goToLocation]);

    const lastHandledTrigger = useRef(0);

    useEffect(() => {
        if (fitHighlightedNodesTrigger > 0 && 
            fitHighlightedNodesTrigger > lastHandledTrigger.current && 
            highlightedNodes.size > 0 && 
            dimensions.width > 0) {
            
            lastHandledTrigger.current = fitHighlightedNodesTrigger;
            
            const nodesToFit = nodes.filter(n => 
                highlightedNodes.has(n.id) && 
                !isNaN(n.position[0]) && 
                !isNaN(n.position[1])
            );
            if (nodesToFit.length === 0) return;

            const viewport = new WebMercatorViewport({
                width: dimensions.width,
                height: dimensions.height,
                ...viewState
            });

            // If more than one node is highlighted, check if they are all visible
            if (highlightedNodes.size > 1) {
                const allVisible = nodesToFit.every(n => {
                    const [x, y] = viewport.project(n.position);
                    const paddingX = dimensions.width * 0.1;
                    const paddingY = dimensions.height * 0.1;
                    return (
                        x >= paddingX &&
                        x <= dimensions.width - paddingX &&
                        y >= paddingY &&
                        y <= dimensions.height - paddingY
                    );
                });

                if (allVisible) {
                    console.log('[GridMap] All nodes already visible, skipping zoom transition');
                    return;
                }
            }

            let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
            nodesToFit.forEach(n => {
                const [lon, lat] = n.position;
                minLon = Math.min(minLon, lon);
                maxLon = Math.max(maxLon, lon);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            });

            let targetLon, targetLat, targetZoom;

            if (nodesToFit.length === 1) {
                targetLon = nodesToFit[0].position[0];
                targetLat = nodesToFit[0].position[1];
                targetZoom = Math.max(viewState.zoom, 17); // Focus in but don't zoom out
            } else {
                const bounds = viewport.fitBounds(
                    [[minLon, minLat], [maxLon, maxLat]],
                    {
                        padding: Math.min(dimensions.width, dimensions.height) * 0.2,
                        maxZoom: 18
                    }
                );
                targetLon = bounds.longitude;
                targetLat = bounds.latitude;
                targetZoom = bounds.zoom;
            }

            setViewState((prev: any) => ({
                ...prev,
                longitude: targetLon,
                latitude: targetLat,
                zoom: targetZoom,
                transitionDuration: 1000
            }));
        }
    }, [fitHighlightedNodesTrigger, highlightedNodes, nodes, dimensions]);

    useEffect(() => {
        setMounted(true);
        const updateSize = () => {
            setDimensions({
                width: window.innerWidth,
                height: window.innerHeight >= 500 ? window.innerHeight : 500
            });
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    const nodePositions = useMemo(() => {
        const groups: Record<string, Node[]> = {};
        nodes.forEach(node => {
            // Using toFixed(6) to handle floating point precision for grouping (~10cm)
            const key = `${node.position[0].toFixed(6)},${node.position[1].toFixed(6)}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(node);
        });

        const posMap: Record<string, [number, number]> = {};
        Object.values(groups).forEach(group => {
            if (group.length <= 1) {
                group.forEach(node => {
                    posMap[node.id] = node.position;
                });
                return;
            }

            const magnitude = Math.max(...group.map(n => n.display_offset || 0));
            if (magnitude === 0) {
                group.forEach(node => {
                    posMap[node.id] = node.position;
                });
                return;
            }

            group.forEach((node, i) => {
                const angle = (i / group.length) * 2 * Math.PI;
                const latRad = (node.position[1] * Math.PI) / 180;
                posMap[node.id] = [
                    node.position[0] + (Math.cos(angle) * magnitude) / Math.cos(latRad),
                    node.position[1] + Math.sin(angle) * magnitude
                ];
            });
        });
        return posMap;
    }, [nodes]);

    const offsetEdges = useMemo(() => {
        return edges.map(edge => ({
            ...edge,
            sourcePosition: nodePositions[edge.source] || edge.sourcePosition,
            targetPosition: nodePositions[edge.target] || edge.targetPosition
        }));
    }, [edges, nodePositions]);

    // Edges that carry switch/breaker equipment (for icon rendering)
    const switchEdgesOpen = useMemo(() => offsetEdges.filter(e => SWITCH_EDGE_TYPES.has(e.edge_type ?? '') && e.is_open && !e.display_icon), [offsetEdges]);
    const switchEdgesClosed = useMemo(() => offsetEdges.filter(e => SWITCH_EDGE_TYPES.has(e.edge_type ?? '') && !e.is_open && !e.display_icon), [offsetEdges]);
    const transformerEdges = useMemo(() => 
        offsetEdges.filter(e => (e.edge_type === 'PowerTransformer' || e.edge_type === 'TransformerTank') && !e.display_icon), 
    [offsetEdges]);

    const visualEdgePaths = useMemo(() => {
        const OFFSET = 0.00004; // ~4-5 meters
        return offsetEdges.flatMap(e => {
            const isSwitch = (e.edge_type && SWITCH_EDGE_TYPES.has(e.edge_type));
            if (!isSwitch) return [{ ...e, path: [e.sourcePosition, e.targetPosition] }];

            const mid = edgeMidpoint(e);
            const dx = (e.targetPosition[0] - e.sourcePosition[0]) * Math.cos((e.sourcePosition[1] * Math.PI) / 180);
            const dy = e.targetPosition[1] - e.sourcePosition[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < OFFSET * 3) return [{ ...e, path: [e.sourcePosition, e.targetPosition] }];

            const ux = (e.targetPosition[0] - e.sourcePosition[0]) / Math.sqrt(Math.pow(e.targetPosition[0] - e.sourcePosition[0], 2) + Math.pow(e.targetPosition[1] - e.sourcePosition[1], 2));
            const uy = (e.targetPosition[1] - e.sourcePosition[1]) / Math.sqrt(Math.pow(e.targetPosition[0] - e.sourcePosition[0], 2) + Math.pow(e.targetPosition[1] - e.sourcePosition[1], 2));

            return [
                { ...e, path: [e.sourcePosition, [mid[0] - ux * (OFFSET / Math.cos((mid[1] * Math.PI) / 180)), mid[1] - uy * OFFSET]] },
                { ...e, path: [[mid[0] + ux * (OFFSET / Math.cos((mid[1] * Math.PI) / 180)), mid[1] + uy * OFFSET], e.targetPosition] }
            ];
        });
    }, [offsetEdges]);

    const layers = useMemo(() => [
        new ScatterplotLayer({
            id: 'selection-halo',
            data: nodes.filter(n => selectedNodeIdsSet.has(n.id)),
            getPosition: (d: Node) => nodePositions[d.id],
            getFillColor: [255, 255, 255, 80],
            getRadius: (d: Node) => {
                const vt = getVisualType(d);
                const baseRadius = vt === 'Meter' || vt === 'Bus' ? 4 : 8;
                return baseRadius * 1.1;
            },
            radiusUnits: 'pixels',
            radiusScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            radiusMinPixels: 2,
            pickable: false,
            updateTriggers: {
                getRadius: [selectedNodeIdsSet, viewState.zoom],
                getFillColor: [selectedNodeIdsSet]
            }
        }),
        new PathLayer({
            id: 'grid-lines-hit-area',
            data: visualEdgePaths,
            getPath: (d: any) => d.path,
            getColor: () => [0, 0, 0, 0],
            getWidth: () => 15, // Large hit area
            widthUnits: 'pixels',
            pickable: true,
            autoHighlight: false,
            onHover: (info) => {
                setHoveredEdgeId(info.object ? (info.object.id || `${info.object.source}-${info.object.target}`) : null);
            },
            onClick: (info, event) => {
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent && onEdgeClick) {
                    onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            }
        }),
        new PathLayer({
            id: 'grid-lines',
            data: visualEdgePaths,
            getPath: (d: any) => d.path,
            getColor: (d: Edge) => {
                if (nodeAverages && nodeAverages[d.target] !== undefined && voltageScale) {
                    const voltage = nodeAverages[d.target];
                    const pu = voltage / (voltageScale.baseVoltage || 120);
                    // Soft coral for critical high
                    if (pu > voltageScale.criticalHigh) return [255, 107, 107, 200];
                    // Muted orange for high warning
                    if (pu >= voltageScale.highWarning) return [250, 150, 80, 200];
                    // Emerald green for low warning (since it's inverted from normal logic, this is 'in band' here)
                    if (pu >= voltageScale.lowWarning) return [46, 204, 113, 200];
                    // Soft gold for critical low (since it's warning)
                    if (pu >= voltageScale.criticalLow) return [241, 196, 15, 200];
                    // Periwinkle/Indigo for extreme low
                    return [142, 68, 173, 200];
                }
                if (highlightedEdges.has(d.id || '') || highlightedEdges.has(`${d.source}-${d.target}`)) return [60, 160, 240, 200];
                return d.circuit_id && d.circuit_id !== 'unknown' ? [...stringToColor(d.circuit_id), 120] as [number, number, number, number] : [150, 150, 150, 150];
            },
            getWidth: (d: Edge) => {
                const isHovered = (d.id && hoveredEdgeId === d.id) || hoveredEdgeId === `${d.source}-${d.target}`;
                if (isHovered) return 4;
                
                // Base width: scale from 1.0 to 2.5 based on primary phase count
                const realPhases = d.phases ? d.phases.filter(p => !['N', 'Neutral'].includes(p)) : ['A', 'B', 'C'];
                const phaseCount = Math.max(1, realPhases.length);
                let width = 1 + (phaseCount - 1) * 0.75; // 1.0, 1.75, 2.5
                
                if (nodeAverages && nodeAverages[d.target] !== undefined) width += 1;
                if (highlightedEdges.has(d.id || '') || highlightedEdges.has(`${d.source}-${d.target}`)) width += 1;
                
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
                getColor: [highlightedEdges, nodeAverages, voltageScale],
                getWidth: [highlightedEdges, hoveredEdgeId, nodeAverages]
            }
        }),
        new ScatterplotLayer({
            id: 'grid-nodes',
            data: nodes.filter(n => getVisualType(n) !== 'Bus' && !n.display_icon),
            getPosition: (d: Node) => nodePositions[d.id],
            getFillColor: (d: Node) => {
                if (selectedNodeIdsSet.has(d.id)) return [255, 200, 50, 255];

                if (nodeAverages && nodeAverages[d.id] !== undefined && voltageScale) {
                    const voltage = nodeAverages[d.id];
                    const pu = voltage / (voltageScale.baseVoltage || 120);
                    if (pu > voltageScale.criticalHigh) return [255, 107, 107, 200];
                    if (pu >= voltageScale.highWarning) return [250, 150, 80, 200];
                    if (pu >= voltageScale.lowWarning) return [46, 204, 113, 200];
                    if (pu >= voltageScale.criticalLow) return [241, 196, 15, 200];
                    return [142, 68, 173, 200];
                }

                const vt = getVisualType(d);
                const color = getNodeColor(d, vt, highlightedNodes.has(d.id), false, d.circuit_id);
                return [color[0], color[1], color[2], 255];
            },
            getRadius: (d: Node) => {
                const isHovered = hoveredNodeId === d.id;
                const isHighlighted = highlightedNodes.has(d.id);
                const isSelected = selectedNodeIdsSet.has(d.id);
                const baseRadius = 2;
                let radius = isHovered ? baseRadius * 2.5 : baseRadius;
                if (isHighlighted) radius *= 1.5;
                if (isSelected) radius *= 1.1;
                return radius;
            },
            updateTriggers: {
                getRadius: [hoveredNodeId, highlightedNodes, selectedNodeIdsSet],
                getFillColor: [highlightedNodes, selectedNodeIdsSet, nodeAverages, voltageScale]
            },
            radiusUnits: 'pixels',
            radiusScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            radiusMinPixels: 1,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 50],
            onHover: (info) => {
                setHoveredNodeId(info.object ? info.object.id : null);
            },
            onClick: (info, event) => {
                if (isDraggingRef.current) return;
                const srcEvent = (event as any).srcEvent as MouseEvent;
                console.log('[GridMap] Interaction:', info.object?.id, 'Shift:', srcEvent?.shiftKey);
                if (info.object && srcEvent) {
                    onNodeClick(info.object, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            }
        }),
        new IconLayer({
            id: 'grid-switches-open',
            data: switchEdgesOpen,
            getPosition: (d: Edge) => edgeMidpoint(d),
            getIcon: (d: Edge) => {
                const colorArr = getEdgeColor(d, highlightedEdges.has(d.id ?? ''), hoveredEdgeId === d.id, d.circuit_id);
                const colorHex = `#${colorArr.map(c => c.toString(16).padStart(2, '0')).join('')}`;
                return {
                    url: getSvgDataUrl(OPEN_SWITCH_SVG, colorHex),
                    width: 100,
                    height: 100,
                    anchorY: 50,
                    mask: false
                };
            },
            getAngle: (d: Edge) => getBearing(d.sourcePosition, d.targetPosition) + 90,
            getSize: (d: Edge) => highlightedEdges.has(d.id ?? '') ? 36 : 24,
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            updateTriggers: { 
                getSize: [highlightedEdges],
                getIcon: [highlightedEdges, hoveredEdgeId]
            },
            pickable: true,
            autoHighlight: false,
            onHover: (info) => {
                setHoveredEdgeId(info.object ? (info.object.id ?? null) : null);
            },
            onClick: (info, event) => {
                if (isDraggingRef.current) return;
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent && onEdgeClick) {
                    onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            }
        }),
        new IconLayer({
            id: 'grid-switches-closed',
            data: switchEdgesClosed,
            getPosition: (d: Edge) => edgeMidpoint(d),
            getIcon: (d: Edge) => {
                const colorArr = getEdgeColor(d, highlightedEdges.has(d.id ?? ''), hoveredEdgeId === d.id, d.circuit_id);
                const colorHex = `#${colorArr.map(c => c.toString(16).padStart(2, '0')).join('')}`;
                return {
                    url: getSvgDataUrl(CLOSE_SWITCH_SVG, colorHex),
                    width: 100,
                    height: 100,
                    anchorY: 50,
                    mask: false
                };
            },
            getAngle: (d: Edge) => getBearing(d.sourcePosition, d.targetPosition) + 90,
            getSize: (d: Edge) => highlightedEdges.has(d.id ?? '') ? 36 : 24,
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            updateTriggers: { 
                getSize: [highlightedEdges],
                getIcon: [highlightedEdges, hoveredEdgeId]
            },
            pickable: true,
            autoHighlight: false,
            onHover: (info) => {
                setHoveredEdgeId(info.object ? (info.object.id ?? null) : null);
            },
            onClick: (info, event) => {
                if (isDraggingRef.current) return;
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent && onEdgeClick) {
                    onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            }
        }),
        new IconLayer({
            id: 'grid-transformers',
            data: transformerEdges,
            getPosition: (d: Edge) => d.targetPosition,
            getIcon: (d: Edge) => {
                const colorArr = getEdgeColor(d, highlightedEdges.has(d.id ?? ''), hoveredEdgeId === d.id, d.circuit_id);
                const colorHex = `#${colorArr.map(c => c.toString(16).padStart(2, '0')).join('')}`;
                return {
                    url: getSvgDataUrl(TRANSFORMER_SVG, colorHex),
                    width: 100,
                    height: 100,
                    anchorY: 50,
                    mask: false
                };
            },
            getSize: (d: Edge) => highlightedEdges.has(d.id ?? '') ? 20 : 16,
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            updateTriggers: { 
                getSize: [highlightedEdges],
                getIcon: [highlightedEdges, hoveredEdgeId]
            },
            pickable: true,
            autoHighlight: false,
            onHover: (info) => {
                setHoveredEdgeId(info.object ? (info.object.id ?? null) : null);
            },
            onClick: (info, event) => {
                if (isDraggingRef.current) return;
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent && onEdgeClick) {
                    onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            }
        }),
        new IconLayer({
            id: 'grid-capacitors',
            data: nodes.filter(n => getVisualType(n) === 'Capacitor' && !n.display_icon),
            getPosition: (d: Node) => nodePositions[d.id],
            getIcon: (d: Node) => {
                const colorArr = getNodeColor(d, getVisualType(d), highlightedNodes.has(d.id), selectedNodeIdsSet.has(d.id), d.circuit_id);
                const colorHex = `#${colorArr.map(c => c.toString(16).padStart(2, '0')).join('')}`;
                return {
                    url: getSvgDataUrl(CAPACITOR_SVG, colorHex),
                    width: 100,
                    height: 100,
                    anchorY: 50,
                    mask: false
                };
            },
            getSize: (d: Node) => hoveredNodeId === d.id ? 50 : 30,
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            updateTriggers: { 
                getSize: [hoveredNodeId],
                getIcon: [highlightedNodes, selectedNodeIdsSet, hoveredNodeId]
            },
            pickable: true,
            autoHighlight: false,
            onHover: (info) => {
                setHoveredNodeId(info.object ? (info.object.id ?? null) : null);
            },
            onClick: (info, event) => {
                if (isDraggingRef.current) return;
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent) {
                    onNodeClick(info.object, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            }
        }),
        new IconLayer({
            id: 'grid-custom-node-icons',
            data: nodes.filter(n => n.display_icon),
            getPosition: (d: Node) => nodePositions[d.id],
            getIcon: (d: Node) => {
                const dims = getSvgDimensions(d.display_icon!);
                const isHighlighted = highlightedNodes.has(d.id);
                const isSelected = selectedNodeIdsSet.has(d.id);
                const colorArr = getNodeColor(d, getVisualType(d), isHighlighted, isSelected, d.circuit_id);
                const colorHex = `#${colorArr.map(c => c.toString(16).padStart(2, '0')).join('')}`;
                
                return {
                    url: getSvgDataUrl(d.display_icon!, colorHex, d.display_css),
                    width: dims.width,
                    height: dims.height,
                    anchorY: dims.height / 2,
                    mask: false
                };
            },
            getColor: (d: Node) => getNodeColor(d, getVisualType(d), highlightedNodes.has(d.id), selectedNodeIdsSet.has(d.id), d.circuit_id),
            getSize: (d: Node) => {
                const isHovered = hoveredNodeId === d.id;
                const isHighlighted = highlightedNodes.has(d.id);
                const sizeAttr = d.display_size ?? 1.0;
                const baseSize = sizeAttr;
                let size = isHovered ? baseSize * 1.5 : baseSize;
                if (isHighlighted) size *= 1.2;
                
                return size;
            },
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            pickable: true,
            onHover: (info) => {
                setHoveredNodeId(info.object ? info.object.id : null);
            },
            onClick: (info, event) => {
                if (isDraggingRef.current) return;
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent) {
                    onNodeClick(info.object, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            },
            updateTriggers: {
                getSize: [hoveredNodeId, highlightedNodes, nodes],
                getIcon: [highlightedNodes, selectedNodeIdsSet, nodes, nodes.map(n => n.display_css)],
                getColor: [highlightedNodes, selectedNodeIdsSet, nodes]
            }
        }),
        new IconLayer({
            id: 'grid-custom-edge-icons',
            data: edges.filter(e => e.display_icon),
            getPosition: (d: Edge) => edgeMidpoint(d),
            getIcon: (d: Edge) => {
                const dims = getSvgDimensions(d.display_icon!);
                const isHighlighted = highlightedEdges.has(d.id || '') || highlightedEdges.has(`${d.source}-${d.target}`);
                const isHovered = hoveredEdgeId === d.id;
                const colorArr = getEdgeColor(d, isHighlighted, isHovered, d.circuit_id);
                const colorHex = `#${colorArr.map(c => c.toString(16).padStart(2, '0')).join('')}`;

                return {
                    url: getSvgDataUrl(d.display_icon!, colorHex, d.display_css),
                    width: dims.width,
                    height: dims.height,
                    anchorY: dims.height / 2,
                    mask: false
                };
            },
            getColor: (d: Edge) => getEdgeColor(d, highlightedEdges.has(d.id || ''), hoveredEdgeId === d.id, d.circuit_id),
            getSize: (d: Edge) => {
                const isHovered = hoveredEdgeId === d.id;
                const isHighlighted = highlightedEdges.has(d.id || '');
                const sizeAttr = d.display_size ?? 1.0;
                const baseSize = sizeAttr;
                let size = isHovered ? baseSize * 1.5 : baseSize;
                if (isHighlighted) size *= 1.2;
                return size;
            },
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            pickable: true,
            onHover: (info) => {
                setHoveredEdgeId(info.object ? (info.object.id ?? null) : null);
            },
            onClick: (info, event) => {
                if (isDraggingRef.current) return;
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent && onEdgeClick) {
                    onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            },
            updateTriggers: {
                getSize: [hoveredEdgeId, highlightedEdges, edges],
                getIcon: [highlightedEdges, hoveredEdgeId, edges, edges.map(e => e.display_css)],
                getColor: [highlightedEdges, hoveredEdgeId, edges]
            }
        })
    ], [nodes, edges, visualEdgePaths, hoveredNodeId, hoveredEdgeId, highlightedNodes, highlightedEdges, selectedNodeIdsSet, switchEdgesOpen, switchEdgesClosed, transformerEdges, nodeAverages, voltageScale, onNodeClick, onEdgeClick, viewState.zoom, nodePositions]);

    const getTooltipContent = (object: any) => {
        if (!object) return null;
        
        // Node detected (Nodes have 'position' and 'type', but not 'source')
        if ('position' in object && !('source' in object)) {
            const node = object as Node;
            let attachedInfo = '';
            if (node.attached_equipment && node.attached_equipment.length > 0) {
                attachedInfo = `<div style="margin-top: 8px; border-top: 1px solid #373A40; padding-top: 5px;">`;
                node.attached_equipment.forEach(eq => {
                    attachedInfo += `<div style="margin-top: 2px;">• <strong>${eq.type}:</strong> ${eq.name}`;
                    if (eq.active_power_w != null) {
                        attachedInfo += `<br/>&nbsp;&nbsp;Rating: ${(eq.active_power_w / 1000).toFixed(1)} kVA`;
                    }
                    if (eq.phases) {
                        attachedInfo += `<br/>&nbsp;&nbsp;Phases: ${eq.phases.join('')}`;
                    }
                    attachedInfo += `</div>`;
                });
                attachedInfo += `</div>`;
            }
            
            return {
                html: `
                <div class="grid-map-tooltip" style="padding: 10px; background: #1A1B1E; border: 1px solid #373A40; border-radius: 8px; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.5); min-width: 150px; pointer-events: auto;">
                    <div style="font-size: 14px; font-weight: 700; margin-bottom: 5px; color: #4dabf7;">${node.name || 'Unnamed Node'}</div>
                    <div style="opacity: 0.8; font-size: 12px; margin-bottom: 8px;">${node.id}</div>
                    <div style="display: flex; gap: 10px; font-size: 13px;">
                        <span><strong>Type:</strong> ${node.type || 'ConnectivityNode'}</span>
                        <span><strong>Phases:</strong> ${Array.isArray(node.phases) ? node.phases.join('') : (node.phases || 'ABC')}</span>
                    </div>
                    ${attachedInfo}
                </div>
                `,
                style: { backgroundColor: 'transparent', fontSize: '12px' }
            };
        } 
        
        // Edge detected
        const edgeObj = object as Edge;
        const phaseData = Array.isArray(edgeObj.phases) ? edgeObj.phases.join('') : (edgeObj.phases || 'ABC');
        
        let details = '';
        if (edgeObj.transformer_kva && edgeObj.transformer_kva > 0) {
            details = `<div style="margin-top: 5px; color: #ffd43b;"><strong>Rating:</strong> ${edgeObj.transformer_kva.toFixed(1)} kVA</div>`;
        } else if (edgeObj.is_open !== undefined && edgeObj.edge_type && SWITCH_EDGE_TYPES.has(edgeObj.edge_type)) {
            details = `<div style="margin-top: 5px; color: ${edgeObj.is_open ? '#ff6b6b' : '#69db7c'};"><strong>State:</strong> ${edgeObj.is_open ? 'OPEN' : 'CLOSED'}</div>`;
        } else if (edgeObj.length_m) {
            details = `<div style="margin-top: 5px;"><strong>Length:</strong> ${edgeObj.length_m.toFixed(1)} m</div>`;
        }

        let powerStats = '';
        if ((edgeObj.edge_type === 'PowerTransformer' || edgeObj.is_regulator) && nodeCurrents && nodeCurrents[edgeObj.target] && nodeAverages && nodeAverages[edgeObj.target]) {
            const currents = nodeCurrents[edgeObj.target];
            const voltage = nodeAverages[edgeObj.target];
            const totalS = (voltage * (currents.a + currents.b + currents.c)) / 1000.0;
            powerStats = `<div style="margin-top: 8px; border-top: 1px solid #373A40; padding-top: 5px; color: #91a7ff;"><strong>Apparent Power:</strong> ${totalS.toFixed(1)} kVA</div>`;
        }

        return {
            html: `
            <div class="grid-map-tooltip" style="padding: 10px; background: #1A1B1E; border: 1px solid #373A40; border-radius: 8px; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.5); min-width: 150px; pointer-events: auto;">
                <div style="font-size: 14px; font-weight: 700; margin-bottom: 5px; color: #4dabf7;">${edgeObj.name || (edgeObj.edge_type ?? 'Edge')}</div>
                <div style="opacity: 0.8; font-size: 12px; margin-bottom: 8px;">${edgeObj.id || `${edgeObj.source} → ${edgeObj.target}`}</div>
                <div style="display: flex; gap: 10px; font-size: 13px;">
                    <span><strong>Type:</strong> ${edgeObj.edge_type || 'Line'}</span>
                    <span><strong>Phases:</strong> ${phaseData}</span>
                </div>
                ${details}
                ${powerStats}
            </div>
            `,
            style: { backgroundColor: 'transparent', fontSize: '12px' }
        };
    };

    const persistentTooltip = useMemo(() => {
        if (selectedNodeIds.length !== 1 || !dimensions.width) return null;
        
        const nodeId = selectedNodeIds[0];
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return null;

        const viewport = new WebMercatorViewport({
            width: dimensions.width,
            height: dimensions.height,
            ...viewState
        });

        const [x, y] = viewport.project(nodePositions[node.id] || node.position);
        
        // Don't show if off screen
        if (x < 0 || x > dimensions.width || y < 0 || y > dimensions.height) return null;

        const tooltip = getTooltipContent(node);
        if (!tooltip) return null;

        return (
            <div
                className="persistent-grid-tooltip"
                style={{
                    position: 'absolute',
                    left: x,
                    top: y,
                    transform: 'translate(-50%, -105%)',
                    zIndex: 1000,
                    pointerEvents: 'auto',
                    cursor: 'default'
                }}
                dangerouslySetInnerHTML={{ __html: tooltip.html }}
                onClick={(e) => e.stopPropagation()}
            />
        );
    }, [selectedNodeIds, nodes, viewState, dimensions, nodeAverages, nodeCurrents, voltageScale, nodePositions]);

    return (
        <div
            style={{ position: 'relative', width: '100vw', height: '100vh', minHeight: '500px', background: '#141517' }}
        >
            {mounted && dimensions.width > 0 && dimensions.height > 0 && (
                <>
                <DeckGL
                    width={dimensions.width}
                    height={dimensions.height}
                    useDevicePixels={false}
                    onWebGLInitialized={(gl) => {
                        if (!gl) console.error("WebGL context failed to initialize.");
                    }}
                    initialViewState={viewState}
                    viewState={viewState}
                    onViewStateChange={({ viewState: vs }) => {
                        setViewState(vs);
                        onViewStateChange?.(vs);
                    }}
                    onInteractionStateChange={({ isDragging, isPanning, isZooming }) => {
                        if (isDragging || isPanning || isZooming) {
                            isDraggingRef.current = true;
                            lastDragTime.current = Date.now();
                        } else if (!isDragging && !isPanning && !isZooming) {
                            // Delay slightly to give onClick handles a chance to see the dragging state
                            setTimeout(() => {
                                isDraggingRef.current = false;
                            }, 250);
                        }
                    }}
                    onDragStart={(info) => {
                        mouseDownPos.current = { x: info.x, y: info.y };
                    }}
                    onDragEnd={() => {
                        // Position check is handled in onClick, but we can clear here too
                        // Don't clear mouseDownPos yet, onClick needs it
                    }}
                    getCursor={({ isHovering }) => isHovering ? 'pointer' : (isDraggingRef.current ? 'grabbing' : 'grab')}
                    onClick={(info, event) => {
                        const now = Date.now();
                        const timeSinceDrag = now - lastDragTime.current;
                        
                        // Prevent deselection if click was on the tooltip overlay
                        const srcEvent = (event as any)?.srcEvent || (event as any)?.nativeEvent;
                        const target = srcEvent?.target as HTMLElement;
                        if (target && (target.closest('.grid-map-tooltip') || (target as any).dataset?.gridMapTooltip || target.closest('.persistent-grid-tooltip'))) {
                            console.log('[GridMap] Click on tooltip detected, ignoring background click');
                            mouseDownPos.current = null;
                            return;
                        }

                        // Check distance to distinguish click from micro-drag
                        let isActualClick = true;
                        if (mouseDownPos.current) {
                            const dx = info.x - mouseDownPos.current.x;
                            const dy = info.y - mouseDownPos.current.y;
                            const dist = Math.sqrt(dx * dx + dy * dy);
                            console.log('[GridMap] onClick check - dist:', dist.toFixed(1), 'isDragging:', isDraggingRef.current);
                            if (dist > 7) isActualClick = false;
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
                    controller={{
                        dragRotate: false,
                        doubleClickZoom: true,
                        touchRotate: false
                    }}
                    layers={layers}
                    getTooltip={info => {
                        // If selecting, don't show hover tooltip if it's the same node
                        if (selectedNodeIds.length === 1 && info.object && info.object.id === selectedNodeIds[0]) {
                            return null;
                        }
                        return getTooltipContent(info.object);
                    }}
                />
                {persistentTooltip}
                </>
            )}
        </div>
    );
});
