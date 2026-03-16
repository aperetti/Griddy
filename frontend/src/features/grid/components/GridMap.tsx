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

// Derive a visual category from node.type and attached_equipment.
// After the CIM refactor, node.type is only "Bus" | "Substation"; richer
// categories come from what equipment is attached at the node.
const getVisualType = (node: Node): string => {
    if (node.type === 'Substation') return 'Substation';
    const attached = node.attached_equipment ?? [];
    if (attached.some(eq => eq.type === 'EnergySource')) return 'Substation';
    if (attached.some(eq => eq.type === 'EnergyConsumer')) return 'Meter';
    if (attached.some(eq => eq.type === 'Capacitor')) return 'Capacitor';
    return 'Bus';
};

const getNodeColor = (visualType: string, isHighlighted: boolean, isSelected: boolean, circuitId?: string): [number, number, number] => {
    if (isSelected) return [255, 200, 50];
    if (isHighlighted) return [60, 160, 240];

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
        default:
            return [200, 200, 200];
    }
};

const edgeMidpoint = (d: Edge): [number, number] => [
    (d.sourcePosition[0] + d.targetPosition[0]) / 2,
    (d.sourcePosition[1] + d.targetPosition[1]) / 2,
];

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
    fitHighlightedNodesTrigger = 0
}) => {
    const selectedNodeIdsSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
    const [mounted, setMounted] = useState(false);
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
    const [centered, setCentered] = useState(false);
    const lastHandledTrigger = useRef(0);

    useEffect(() => {
        if (!centered && nodes.length > 0) {
            const avgLon = nodes.reduce((sum, n) => sum + n.position[0], 0) / nodes.length;
            const avgLat = nodes.reduce((sum, n) => sum + n.position[1], 0) / nodes.length;
            setViewState((prev: any) => ({ ...prev, longitude: avgLon, latitude: avgLat }));
            setCentered(true);
        }
    }, [nodes, centered]);

    useEffect(() => {
        if (fitHighlightedNodesTrigger > 0 && 
            fitHighlightedNodesTrigger > lastHandledTrigger.current && 
            highlightedNodes.size > 0 && 
            dimensions.width > 0) {
            
            lastHandledTrigger.current = fitHighlightedNodesTrigger;
            
            const nodesToFit = nodes.filter(n => highlightedNodes.has(n.id));
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

    // Edges that carry switch/breaker equipment (for icon rendering)
    const switchEdgesOpen = useMemo(
        () => edges.filter(e => SWITCH_EDGE_TYPES.has(e.edge_type ?? '') && e.is_open),
        [edges]
    );
    const switchEdgesClosed = useMemo(
        () => edges.filter(e => SWITCH_EDGE_TYPES.has(e.edge_type ?? '') && !e.is_open),
        [edges]
    );
    const transformerEdges = useMemo(
        () => edges.filter(e => e.edge_type === 'PowerTransformer' && !e.is_regulator),
        [edges]
    );
    const regulatorEdges = useMemo(
        () => edges.filter(e => e.edge_type === 'PowerTransformer' && e.is_regulator),
        [edges]
    );

    const layers = useMemo(() => [
        new ScatterplotLayer({
            id: 'selection-halo',
            data: nodes.filter(n => selectedNodeIdsSet.has(n.id)),
            getPosition: (d: Node) => d.position,
            getFillColor: [255, 255, 255, 80],
            getRadius: (d: Node) => {
                const vt = getVisualType(d);
                const baseRadius = vt === 'Meter' || vt === 'Bus' ? 5 : 10;
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
            id: 'grid-lines',
            data: edges,
            getPath: (d: Edge) => [d.sourcePosition, d.targetPosition],
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
                if (isHovered) return 3;
                if (nodeAverages && nodeAverages[d.target] !== undefined) return 2;
                if (highlightedEdges.has(d.id || '') || highlightedEdges.has(`${d.source}-${d.target}`)) return 2;
                return 1;
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
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 100],
            onHover: (info) => {
                setHoveredEdgeId(info.object ? (info.object.id || `${info.object.source}-${info.object.target}`) : null);
            },
            onClick: (info, event) => {
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent && onEdgeClick) {
                    onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            },
            updateTriggers: {
                getColor: [highlightedEdges, nodeAverages, voltageScale],
                getWidth: [highlightedEdges, hoveredEdgeId, nodeAverages]
            }
        }),
        new ScatterplotLayer({
            id: 'grid-nodes',
            data: nodes.filter(n => getVisualType(n) !== 'Bus'),
            getPosition: (d: Node) => d.position,
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
                const color = getNodeColor(vt, highlightedNodes.has(d.id), false, d.circuit_id);
                return [color[0], color[1], color[2], 255];
            },
            getRadius: (d: Node) => {
                const isHovered = hoveredNodeId === d.id;
                const isHighlighted = highlightedNodes.has(d.id);
                const isSelected = selectedNodeIdsSet.has(d.id);
                const vt = getVisualType(d);
                const baseRadius = vt === 'Meter' ? 3 : 8;
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
            iconAtlas: '/open-switch.svg',
            iconMapping: {
                marker: { x: 0, y: 0, width: 100, height: 100, anchorY: 50, mask: false }
            },
            getIcon: () => 'marker',
            getSize: (d: Edge) => highlightedEdges.has(d.id ?? '') ? 36 : 24,
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            updateTriggers: { getSize: [highlightedEdges] },
            pickable: true,
            autoHighlight: false,
            onHover: (info) => {
                setHoveredEdgeId(info.object ? (info.object.id ?? null) : null);
            },
            onClick: (info, event) => {
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
            iconAtlas: '/close-switch.svg',
            iconMapping: {
                marker: { x: 0, y: 0, width: 100, height: 100, anchorY: 50, mask: false }
            },
            getIcon: () => 'marker',
            getSize: (d: Edge) => highlightedEdges.has(d.id ?? '') ? 36 : 24,
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            updateTriggers: { getSize: [highlightedEdges] },
            pickable: true,
            autoHighlight: false,
            onHover: (info) => {
                setHoveredEdgeId(info.object ? (info.object.id ?? null) : null);
            },
            onClick: (info, event) => {
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent && onEdgeClick) {
                    onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            }
        }),
        new IconLayer({
            id: 'grid-transformers',
            data: transformerEdges,
            getPosition: (d: Edge) => edgeMidpoint(d),
            iconAtlas: '/transformer.svg',
            iconMapping: {
                marker: { x: 0, y: 0, width: 100, height: 100, anchorY: 50, mask: false }
            },
            getIcon: () => 'marker',
            getSize: (d: Edge) => highlightedEdges.has(d.id ?? '') ? 20 : 16,
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            updateTriggers: { getSize: [highlightedEdges] },
            pickable: true,
            autoHighlight: false,
            onHover: (info) => {
                setHoveredEdgeId(info.object ? (info.object.id ?? null) : null);
            },
            onClick: (info, event) => {
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent && onEdgeClick) {
                    onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            }
        }),
        new IconLayer({
            id: 'grid-regulators',
            data: regulatorEdges,
            getPosition: (d: Edge) => edgeMidpoint(d),
            iconAtlas: '/regulator.svg',
            iconMapping: {
                marker: { x: 0, y: 0, width: 100, height: 100, anchorY: 50, mask: false }
            },
            getIcon: () => 'marker',
            getSize: (d: Edge) => highlightedEdges.has(d.id ?? '') ? 50 : 30,
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            updateTriggers: { getSize: [highlightedEdges] },
            pickable: true,
            autoHighlight: false,
            onHover: (info) => {
                setHoveredEdgeId(info.object ? (info.object.id ?? null) : null);
            },
            onClick: (info, event) => {
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent && onEdgeClick) {
                    onEdgeClick(info.object as Edge, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            }
        }),
        new IconLayer({
            id: 'grid-capacitors',
            data: nodes.filter(n => getVisualType(n) === 'Capacitor'),
            getPosition: (d: Node) => d.position,
            iconAtlas: '/capacitor.svg',
            iconMapping: {
                marker: { x: 0, y: 0, width: 100, height: 100, anchorY: 50, mask: false }
            },
            getIcon: () => 'marker',
            getSize: (d: Node) => hoveredNodeId === d.id ? 50 : 30,
            sizeScale: Math.pow(1.5, (viewState.zoom || 14) - 14),
            sizeMinPixels: 1,
            updateTriggers: { getSize: [hoveredNodeId] },
            pickable: true,
            autoHighlight: false,
            onHover: (info) => {
                setHoveredNodeId(info.object ? (info.object.id ?? null) : null);
            },
            onClick: (info, event) => {
                const srcEvent = (event as any).srcEvent as MouseEvent;
                if (info.object && srcEvent) {
                    onNodeClick(info.object, srcEvent.shiftKey || srcEvent.ctrlKey);
                }
            }
        })
    ], [nodes, edges, hoveredNodeId, hoveredEdgeId, highlightedNodes, highlightedEdges, selectedNodeIdsSet, switchEdgesOpen, switchEdgesClosed, transformerEdges, regulatorEdges, nodeAverages, voltageScale, onNodeClick, onEdgeClick, viewState.zoom]);

    return (
        <div
            style={{ position: 'relative', width: '100vw', height: '100vh', minHeight: '500px', background: '#141517' }}
        >
            {mounted && dimensions.width > 0 && dimensions.height > 0 && (
                <DeckGL
                    width={dimensions.width}
                    height={dimensions.height}
                    useDevicePixels={false}
                    onWebGLInitialized={(gl) => {
                        if (!gl) console.error("WebGL context failed to initialize.");
                    }}
                    initialViewState={viewState}
                    viewState={viewState}
                    onViewStateChange={({ viewState }) => setViewState(viewState)}
                    onDragStart={() => {
                        // We track drag starts but don't block them with 'return false'
                        // as that can interfere with click propagation in some environments
                    }}
                    getCursor={({ isHovering }) => isHovering ? 'pointer' : 'grabbing'}
                    onClick={(info) => {
                        if (!info.object && onMapClick) {
                            console.log('[GridMap] Background click - clearing selection');
                            onMapClick();
                        }
                    }}
                    controller={{
                        dragRotate: false,
                        doubleClickZoom: true,
                        touchRotate: false
                    }}
                    layers={layers}
                    getTooltip={({ object }) => {
                        if (!object) return null;
                        if ('type' in object) {
                            return {
                                html: `
                                <div style="padding: 10px; background: #25262b; border: 1px solid #373A40; border-radius: 8px; color: #fff;">
                                <strong>ID:</strong> ${object.id}<br/>
                                <strong>Type:</strong> ${object.type}<br/>
                                <strong>Name:</strong> ${object.name}
                                </div>
                            `,
                                style: { backgroundColor: 'transparent', fontSize: '13px' }
                            };
                        } else {
                            const edgeObj = object as Edge;
                            const extraLine = edgeObj.transformer_kva
                                ? `<br/><strong>Size:</strong> ${edgeObj.transformer_kva.toFixed(1)} kVA`
                                : edgeObj.is_open !== undefined && edgeObj.edge_type && SWITCH_EDGE_TYPES.has(edgeObj.edge_type)
                                    ? `<br/><strong>State:</strong> ${edgeObj.is_open ? 'Open' : 'Closed'}`
                                    : edgeObj.length_m
                                        ? `<br/><strong>Length:</strong> ${edgeObj.length_m.toFixed(1)} m`
                                        : '';

                            // Calculate apparent power for transformers if we have currents
                            let powerLine = '';
                            if (edgeObj.edge_type === 'PowerTransformer' && nodeCurrents && nodeCurrents[edgeObj.target] && nodeAverages && nodeAverages[edgeObj.target]) {
                                const currents = nodeCurrents[edgeObj.target];
                                const voltage = nodeAverages[edgeObj.target];
                                // S = V * (Ia + Ib + Ic) for balanced or single-phase voltage assumption
                                // If we only have one voltage reading (voltage_a average), we use it for all phases
                                const totalS = (voltage * (currents.a + currents.b + currents.c)) / 1000.0;
                                powerLine = `<br/><strong>Apparent Power:</strong> ${totalS.toFixed(1)} kVA`;
                            }

                            return {
                                html: `
                                <div style="padding: 10px; background: #25262b; border: 1px solid #373A40; border-radius: 8px; color: #fff;">
                                <strong>ID:</strong> ${edgeObj.id || `${edgeObj.source}-${edgeObj.target}`}<br/>
                                <strong>Type:</strong> ${edgeObj.edge_type ?? 'Edge'}<br/>
                                <strong>Phases:</strong> ${edgeObj.phases ? edgeObj.phases.join('') : 'ABC'}${extraLine}${powerLine}
                                </div>
                            `,
                                style: { backgroundColor: 'transparent', fontSize: '13px' }
                            };
                        }
                    }}
                />
            )}
        </div>
    );
});
