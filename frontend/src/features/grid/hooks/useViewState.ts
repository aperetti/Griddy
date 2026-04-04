import { useState, useRef, useEffect } from 'react';
import { WebMercatorViewport } from '@deck.gl/core';
import type { Node } from '../../../shared/types';

interface UseViewStateParams {
    nodes: Node[];
    dimensions: { width: number; height: number };
    highlightedNodes: Set<string>;
    fitHighlightedNodesTrigger: number;
    skipGlobalFit: boolean;
    goToLocation?: { longitude: number; latitude: number; zoom?: number } | null;
    onViewStateChange?: (viewState: any) => void;
}

export function useViewState({
    nodes,
    dimensions,
    highlightedNodes,
    fitHighlightedNodesTrigger,
    skipGlobalFit,
    goToLocation,
    onViewStateChange,
}: UseViewStateParams) {
    const [viewState, setViewState] = useState<any>({
        longitude: -118.2437,
        latitude: 34.0522,
        zoom: 14,
        pitch: 0,
        bearing: 0,
    });

    const lastModelIdsRef = useRef<Set<string>>(new Set());
    const lastHandledTrigger = useRef(0);
    const lastGoTo = useRef<{ longitude: number; latitude: number; zoom?: number } | null>(null);

    useEffect(() => {
        if (nodes.length > 0 && dimensions.width > 0 && !skipGlobalFit) {
            const currentModelIds = new Set(nodes.map(n => n.model_id).filter(Boolean) as string[]);
            const modelIdsChanged = currentModelIds.size !== lastModelIdsRef.current.size ||
                Array.from(currentModelIds).some(id => !lastModelIdsRef.current.has(id));

            const isInitialFit = lastModelIdsRef.current.size === 0;
            const isManualFit = fitHighlightedNodesTrigger > lastHandledTrigger.current;
            const shouldFit = isInitialFit || isManualFit || modelIdsChanged;
            if (!shouldFit) return;

            if (isManualFit) lastHandledTrigger.current = fitHighlightedNodesTrigger;
            lastModelIdsRef.current = currentModelIds;

            const nodesToFit = highlightedNodes.size > 0
                ? nodes.filter(n => highlightedNodes.has(n.id))
                : nodes;
            if (nodesToFit.length === 0) return;

            const viewport = new WebMercatorViewport({ width: dimensions.width, height: dimensions.height, ...viewState });

            if (highlightedNodes.size > 1) {
                const allVisible = nodesToFit.every(n => {
                    const [x, y] = viewport.project(n.position);
                    return x >= dimensions.width * 0.1 && x <= dimensions.width * 0.9 &&
                           y >= dimensions.height * 0.1 && y <= dimensions.height * 0.9;
                });
                if (allVisible) {
                    console.log('[GridMap] All nodes already visible, skipping zoom transition');
                    return;
                }
            }

            let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
            nodesToFit.forEach(n => {
                const [lon, lat] = n.position;
                if (!isNaN(lon) && !isNaN(lat)) {
                    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
                    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
                }
            });
            if (minLon === Infinity) return;

            let targetLon, targetLat, targetZoom;
            if (nodesToFit.length === 1) {
                targetLon = nodesToFit[0].position[0];
                targetLat = nodesToFit[0].position[1];
                targetZoom = Math.max(viewState.zoom, 18);
            } else {
                const bounds = viewport.fitBounds(
                    [[minLon, minLat], [maxLon, maxLat]],
                    { padding: Math.min(dimensions.width, dimensions.height) * 0.2, maxZoom: 18 }
                );
                targetLon = bounds.longitude;
                targetLat = bounds.latitude;
                targetZoom = bounds.zoom;
            }

            setViewState((prev: any) => ({ ...prev, longitude: targetLon, latitude: targetLat, zoom: targetZoom, transitionDuration: 1000 }));
        }
    }, [nodes, dimensions.width, dimensions.height, fitHighlightedNodesTrigger, highlightedNodes, skipGlobalFit]);

    useEffect(() => {
        if (goToLocation && (
            goToLocation.longitude !== lastGoTo.current?.longitude || 
            goToLocation.latitude !== lastGoTo.current?.latitude ||
            goToLocation.zoom !== lastGoTo.current?.zoom
        )) {
            lastGoTo.current = goToLocation;
            setViewState((prev: any) => ({ 
                ...prev, 
                longitude: goToLocation.longitude, 
                latitude: goToLocation.latitude, 
                zoom: goToLocation.zoom ?? prev.zoom,
                transitionDuration: 1000 // Smooth move
            }));
        }
    }, [goToLocation]);

    const handleViewStateChange = ({ viewState: vs }: any) => {
        setViewState(vs);
        onViewStateChange?.(vs);
    };

    return { viewState, setViewState, handleViewStateChange };
}
