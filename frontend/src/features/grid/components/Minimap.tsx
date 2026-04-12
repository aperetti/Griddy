import React, { useRef, useEffect, useCallback, useState } from 'react';
import { WebMercatorViewport } from '@deck.gl/core';
import { Tooltip, Text, Stack } from '@mantine/core';
import { Info } from 'lucide-react';
import type { Node, Edge } from '../../../shared/types';

interface MinimapProps {
    nodes: Node[];
    edges: Edge[];
    viewState: any;
    selectedNodeIds?: string[];
    onNavigate: (longitude: number, latitude: number) => void;
    maxSize?: number;
}

/**
 * A lightweight canvas minimap showing all nodes and the current viewport rectangle.
 * Click or drag on the minimap to navigate the main map.
 */
export const Minimap = React.memo<MinimapProps>(({
    nodes,
    edges,
    viewState,
    selectedNodeIds = [],
    onNavigate,
    maxSize = 240,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Compute bounding box of all nodes
    const bounds = React.useMemo(() => {
        if (nodes.length === 0) return null;
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        for (const n of nodes) {
            const [lon, lat] = n.position;
            if (isNaN(lon) || isNaN(lat)) continue;
            minLon = Math.min(minLon, lon);
            maxLon = Math.max(maxLon, lon);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
        }
        if (minLon === Infinity) return null;
        // Add padding (5%)
        const padLon = (maxLon - minLon) * 0.05 || 0.001;
        const padLat = (maxLat - minLat) * 0.05 || 0.001;
        return {
            minLon: minLon - padLon,
            maxLon: maxLon + padLon,
            minLat: minLat - padLat,
            maxLat: maxLat + padLat,
        };
    }, [nodes]);

    // Fixed canvas size — topology is drawn at correct aspect ratio, centered, with black space around it
    const size = maxSize;

    // Compute the draw region within the fixed square that preserves geographic aspect ratio
    const drawRegion = React.useMemo(() => {
        if (!bounds) return { offsetX: 0, offsetY: 0, drawW: size, drawH: size };
        const dLon = bounds.maxLon - bounds.minLon;
        const dLat = bounds.maxLat - bounds.minLat;
        // Correct for mercator: longitude degrees are narrower at higher latitudes
        const midLat = (bounds.minLat + bounds.maxLat) / 2;
        const lonScale = Math.cos((midLat * Math.PI) / 180);
        const geoWidth = dLon * lonScale;
        const geoHeight = dLat;
        const aspect = geoWidth / geoHeight;

        let drawW: number, drawH: number;
        if (aspect >= 1) {
            drawW = size;
            drawH = Math.round(size / aspect);
        } else {
            drawH = size;
            drawW = Math.round(size * aspect);
        }
        return {
            offsetX: Math.round((size - drawW) / 2),
            offsetY: Math.round((size - drawH) / 2),
            drawW,
            drawH,
        };
    }, [bounds, size]);

    const selectedSet = React.useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

    // Map lon/lat to canvas pixel (within the draw region)
    const toCanvas = useCallback((lon: number, lat: number): [number, number] => {
        if (!bounds) return [0, 0];
        const x = drawRegion.offsetX + ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * drawRegion.drawW;
        const y = drawRegion.offsetY + ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * drawRegion.drawH;
        return [x, y];
    }, [bounds, drawRegion]);

    // Canvas pixel → lon/lat
    const fromCanvas = useCallback((cx: number, cy: number): [number, number] => {
        if (!bounds) return [0, 0];
        const lon = bounds.minLon + ((cx - drawRegion.offsetX) / drawRegion.drawW) * (bounds.maxLon - bounds.minLon);
        const lat = bounds.maxLat - ((cy - drawRegion.offsetY) / drawRegion.drawH) * (bounds.maxLat - bounds.minLat);
        return [lon, lat];
    }, [bounds, drawRegion]);

    // Draw the minimap
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !bounds) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);

        // Background
        ctx.fillStyle = 'rgba(20, 21, 23, 0.95)';
        ctx.fillRect(0, 0, size, size);

        // Draw edges as thin lines
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.lineWidth = 0.5;
        for (const edge of edges) {
            const [x1, y1] = toCanvas(edge.sourcePosition[0], edge.sourcePosition[1]);
            const [x2, y2] = toCanvas(edge.targetPosition[0], edge.targetPosition[1]);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // Draw nodes as dots
        for (const node of nodes) {
            const [x, y] = toCanvas(node.position[0], node.position[1]);
            const isSelected = selectedSet.has(node.id);

            ctx.beginPath();
            ctx.arc(x, y, isSelected ? 3 : 1.5, 0, Math.PI * 2);

            if (isSelected) {
                ctx.fillStyle = '#ffc832';
            } else if (node.type === 'Substation') {
                ctx.fillStyle = '#ff3232';
            } else {
                ctx.fillStyle = 'rgba(160, 160, 170, 0.6)';
            }
            ctx.fill();
        }

        // Draw viewport rectangle
        if (viewState && viewState.longitude != null && viewState.latitude != null) {
            try {
                const vp = new WebMercatorViewport({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    ...viewState
                });

                // Get the four corners of the current viewport in lon/lat
                const topLeft = vp.unproject([0, 0]);
                const topRight = vp.unproject([window.innerWidth, 0]);
                const bottomLeft = vp.unproject([0, window.innerHeight]);
                const bottomRight = vp.unproject([window.innerWidth, window.innerHeight]);

                const [cx1, cy1] = toCanvas(topLeft[0], topLeft[1]);
                const [cx2, cy2] = toCanvas(topRight[0], topRight[1]);
                const [cx3, cy3] = toCanvas(bottomRight[0], bottomRight[1]);
                const [cx4, cy4] = toCanvas(bottomLeft[0], bottomLeft[1]);

                ctx.strokeStyle = 'rgba(51, 154, 240, 0.8)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(cx1, cy1);
                ctx.lineTo(cx2, cy2);
                ctx.lineTo(cx3, cy3);
                ctx.lineTo(cx4, cy4);
                ctx.closePath();
                ctx.stroke();

                // Light fill
                ctx.fillStyle = 'rgba(51, 154, 240, 0.08)';
                ctx.fill();
            } catch {
                // Viewport calculation can fail at extreme zoom levels
            }
        }

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, size, size);
    }, [nodes, edges, viewState, bounds, size, toCanvas, selectedSet, drawRegion]);

    const handleCanvasInteraction = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        e.stopPropagation();
        e.preventDefault();
        const canvas = canvasRef.current;
        if (!canvas || !bounds) return;

        const rect = canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const [lon, lat] = fromCanvas(cx, cy);
        onNavigate(lon, lat);
    }, [bounds, fromCanvas, onNavigate]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        setIsDragging(true);
        handleCanvasInteraction(e);
    }, [handleCanvasInteraction]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isDragging) {
            handleCanvasInteraction(e);
        }
    }, [isDragging, handleCanvasInteraction]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        const handleGlobalMouseUp = () => setIsDragging(false);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    if (!bounds || nodes.length === 0) return null;

    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                pointerEvents: 'auto',
                cursor: isDragging ? 'grabbing' : 'crosshair',
                position: 'absolute',
                bottom: 20,
                left: 20,
                zIndex: 1000,
                backgroundColor: '#141517',
            }}
        >
            <canvas
                ref={canvasRef}
                style={{ width: size, height: size, display: 'block' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            />
            {viewState && viewState.longitude != null && viewState.latitude != null && (
                <div
                    style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        zIndex: 1001,
                        pointerEvents: 'auto',
                    }}
                >
                    <Tooltip
                        label={
                            <Stack gap={2} p={4}>
                                <Text size="xs" ff="monospace" c="dimmed" fw={700}>MAP STATUS</Text>
                                <Text size="xs" ff="monospace">LAT: {viewState.latitude.toFixed(6)}</Text>
                                <Text size="xs" ff="monospace">LON: {viewState.longitude.toFixed(6)}</Text>
                                <Text size="xs" ff="monospace">ZOOM: {viewState.zoom.toFixed(2)}</Text>
                            </Stack>
                        }
                        position="left"
                        withArrow
                    >
                        <div
                            style={{
                                color: 'rgba(255, 255, 255, 0.4)',
                                cursor: 'help',
                                padding: '4px',
                                display: 'flex',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                transition: 'all 0.2s ease',
                                border: '1px solid rgba(255, 255, 255, 0.05)',
                            }}
                        >
                            <Info size={14} />
                        </div>
                    </Tooltip>
                </div>
            )}
        </div>
    );
});
