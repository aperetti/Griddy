/**
 * Manages navigation to nodes/edges on the map: finding within loaded
 * topology, activating models for unloaded targets, and handling
 * pending navigation after topology changes.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { resolveNodeModel } from '../shared/api';
import type { Node, Edge } from '../shared/types';

interface NavigationDeps {
    nodes: Node[];
    edges: Edge[];
    topologyLoading: boolean;
    activeModelIds: string[];
    setActiveModelIds: (fn: (prev: string[]) => string[]) => void;
    setHighlightedNodes: (nodes: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
    setHighlightedEdges: (edges: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
}

export function useNavigation(topology: NavigationDeps) {
    const [targetLocation, setTargetLocation] = useState<{ longitude: number, latitude: number, zoom?: number } | null>(null);
    const [fitTrigger, setFitTrigger] = useState(0);
    const pendingNavigationRef = useRef<{ id: string, name?: string, zoom?: number } | null>(null);
    const [navTrigger, setNavTrigger] = useState(0);

    // Fulfill pending navigation once topology is loaded
    useEffect(() => {
        if (pendingNavigationRef.current && !topology.topologyLoading) {
            const { id, zoom } = pendingNavigationRef.current;
            
            // Try Node
            const node = topology.nodes.find(n => 
                n.id === id || n.name === id || n.attached_equipment?.some(eq => eq.mrid === id || eq.name === id)
            );
            if (node) {
                topology.setHighlightedNodes(new Set([node.id]));
                topology.setHighlightedEdges(new Set());
                setTargetLocation({ longitude: node.position[0], latitude: node.position[1], zoom });
                pendingNavigationRef.current = null;
                return;
            }

            // Try Edge
            const edge = topology.edges.find(e => e.id === id || e.name === id || `${e.source}-${e.target}` === id);
            if (edge) {
                topology.setHighlightedNodes(new Set());
                topology.setHighlightedEdges(new Set([edge.id || `${edge.source}-${edge.target}`]));
                const midLon = (edge.sourcePosition[0] + edge.targetPosition[0]) / 2;
                const midLat = (edge.sourcePosition[1] + edge.targetPosition[1]) / 2;
                setTargetLocation({ longitude: midLon, latitude: midLat, zoom });
                pendingNavigationRef.current = null;
            }
        }
    }, [topology.nodes, topology.edges, topology.topologyLoading, navTrigger]);

    const selectAndNavigateToNode = useCallback(async (targetId: string | string[], hintModelId?: string, clearPrevious: boolean = true) => {
        const ids = Array.isArray(targetId) ? targetId : [targetId];

        if (ids.length === 1) {
            const id = ids[0];

            // 1. Try finding as a Node (or attached equipment on a node)
            const node = topology.nodes.find(n =>
                n.id === id ||
                n.name === id ||
                n.attached_equipment?.some(eq => eq.mrid === id || eq.name === id)
            );

            if (node) {
                topology.setHighlightedNodes(new Set([node.id]));
                if (clearPrevious) topology.setHighlightedEdges(new Set());
                setTargetLocation({ longitude: node.position[0], latitude: node.position[1], zoom: 18 });
                return;
            }

            // 2. Try finding as an Edge (e.g. PowerTransformer edge)
            const edge = topology.edges.find(e => e.id === id || e.name === id || `${e.source}-${e.target}` === id);
            if (edge) {
                if (clearPrevious) topology.setHighlightedNodes(new Set());
                topology.setHighlightedEdges(new Set([edge.id || `${edge.source}-${edge.target}`]));

                // Center on edge midpoint
                const midLon = (edge.sourcePosition[0] + edge.targetPosition[0]) / 2;
                const midLat = (edge.sourcePosition[1] + edge.targetPosition[1]) / 2;
                setTargetLocation({ longitude: midLon, latitude: midLat, zoom: 18 });
                return;
            }

            // 3. Not found in currently loaded models — activate the model then navigate
            try {
                let feeder_id = hintModelId;
                if (!feeder_id) {
                    const res = await resolveNodeModel(id);
                    feeder_id = res.feeder_id;
                }

                pendingNavigationRef.current = { id, zoom: 18 };

                if (!topology.activeModelIds.includes(feeder_id)) {
                    topology.setActiveModelIds(prev => [...new Set([...prev, feeder_id!])]);
                } else {
                    // Model already active but node not yet visible — trigger re-check
                    setNavTrigger(prev => prev + 1);
                }
            } catch (err) {
                console.error('[App] Failed to resolve target for navigation:', err);
            }
        } else if (ids.length > 1) {
            topology.setHighlightedNodes(new Set(ids));
            if (clearPrevious) topology.setHighlightedEdges(new Set());
            setFitTrigger(prev => prev + 1);
            setTargetLocation(null);
        }
    }, [topology.nodes, topology.edges, topology.activeModelIds]);

    return {
        targetLocation,
        setTargetLocation,
        fitTrigger,
        selectAndNavigateToNode,
    };
}
