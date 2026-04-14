import { useMemo } from 'react';
import { WebMercatorViewport } from '@deck.gl/core';
import Supercluster from 'supercluster';
import type { Node, Edge } from '../../../shared/types';
import { SWITCH_EDGE_TYPES, edgeMidpoint, getPathMidpoint } from '../model/mapUtils';

interface UseClusteringParams {
    nodes: Node[];
    edges: Edge[];
    viewState: any;
    dimensions: { width: number; height: number };
}

export function useClustering({ nodes, edges, viewState, dimensions }: UseClusteringParams) {
    const nodePositions = useMemo(() => {
        const posMap: Record<string, [number, number]> = {};
        nodes.forEach(node => { posMap[node.id] = node.position; });
        return posMap;
    }, [nodes]);

    const offsetEdges = useMemo(() => {
        return edges.map(edge => {
            // Prioritize the edge's own terminal positions (from its Location) over derived node positions
            const sp = edge.sourcePosition || nodePositions[edge.source];
            const tp = edge.targetPosition || nodePositions[edge.target];
            
            // Preserve exact waypoints from CIM without snapping them to node icons,
            // as per user requirement to rely solely on location geometries.
            return {
                ...edge,
                sourcePosition: sp,
                targetPosition: tp,
                waypoints: edge.waypoints,
            };
        });
    }, [edges, nodePositions]);

    const visualEdgePaths = useMemo(() => {
        const OFFSET = 0.00004;
        const visibleEdges = offsetEdges.filter(e =>
            (e.display_min_zoom === undefined || viewState.zoom >= e.display_min_zoom) &&
            (e.display_max_zoom === undefined || viewState.zoom <= e.display_max_zoom)
        );
        return visibleEdges.flatMap(e => {
            const rawPath = e.waypoints && e.waypoints.length > 1
                ? e.waypoints
                : [e.sourcePosition, e.targetPosition];

            if (!e.edge_type || !SWITCH_EDGE_TYPES.has(e.edge_type)) {
                return [{ ...e, path: rawPath }];
            }

            // Calculate midpoint and local bearing along the path
            const { position: mid, bearing, segmentIndex } = getPathMidpoint(rawPath);
            
            // Calculate gap bounds based on local segment angle
            const rad = (bearing * Math.PI) / 180;
            const ux = Math.sin(rad);
            const uy = Math.cos(rad);
            const lonScale = Math.cos((mid[1] * Math.PI) / 180);
            
            const gapStart: [number, number] = [mid[0] - ux * (OFFSET / lonScale), mid[1] - uy * OFFSET];
            const gapEnd: [number, number] = [mid[0] + ux * (OFFSET / lonScale), mid[1] + uy * OFFSET];

            // Check if line is too short for a gap
            const dx = (e.targetPosition[0] - e.sourcePosition[0]) * Math.cos((e.sourcePosition[1] * Math.PI) / 180);
            const dy = e.targetPosition[1] - e.sourcePosition[1];
            if (Math.sqrt(dx * dx + dy * dy) < OFFSET * 3) {
                return [{ ...e, path: rawPath }];
            }

            // Split the path while preserving waypoints
            return [
                { ...e, path: [...rawPath.slice(0, segmentIndex + 1), gapStart] },
                { ...e, path: [gapEnd, ...rawPath.slice(segmentIndex + 1)] },
            ];
        });
    }, [offsetEdges, viewState.zoom]);

    const clusteredData = useMemo(() => {
        const zoom = Math.floor(viewState.zoom);
        const visibleNodes = nodes.filter(n =>
            (n.display_min_zoom === undefined || viewState.zoom >= n.display_min_zoom) &&
            (n.display_max_zoom === undefined || viewState.zoom <= n.display_max_zoom)
        );

        const configs = new Map<string, { nodes: Node[]; radius: number; maxZoom: number; minPoints: number }>();
        visibleNodes.forEach(node => {
            if (!node.cluster_enabled) return;
            const key = `${node.cluster_radius}-${node.cluster_max_zoom}-${node.cluster_min_points}`;
            if (!configs.has(key)) {
                configs.set(key, { nodes: [], radius: node.cluster_radius || 40, maxZoom: node.cluster_max_zoom || 20, minPoints: node.cluster_min_points || 2 });
            }
            configs.get(key)!.nodes.push(node);
        });

        const allClusteredNodes = new Set<string>();
        const clusters: any[] = [];
        const unclusteredNodes: Node[] = [];

        configs.forEach(cfg => {
            const sc = new Supercluster({ radius: cfg.radius, maxZoom: cfg.maxZoom, minPoints: cfg.minPoints });
            const points = cfg.nodes.map((n: Node) => ({
                type: 'Feature' as const,
                properties: { nodeId: n.id, node: n },
                geometry: { type: 'Point' as const, coordinates: n.position },
            }));
            sc.load(points);

            let bounds: any = [-180, -85, 180, 85];
            if (dimensions.width > 0) {
                try {
                    const viewport = new WebMercatorViewport({ width: dimensions.width, height: dimensions.height, ...viewState });
                    bounds = viewport.getBounds();
                } catch (e) {}
            }

            sc.getClusters(bounds, zoom).forEach(feat => {
                if (feat.properties.cluster) {
                    clusters.push({
                        id: `cluster-${feat.id}`,
                        position: feat.geometry.coordinates,
                        pointCount: feat.properties.point_count,
                        pointCountAbbreviated: feat.properties.point_count_abbreviated,
                        config: cfg,
                    });
                } else {
                    unclusteredNodes.push(feat.properties.node);
                }
            });
            cfg.nodes.forEach(n => allClusteredNodes.add(n.id));
        });

        const staticNodes = visibleNodes.filter(n => !n.cluster_enabled);
        return { nodesToRender: [...staticNodes, ...unclusteredNodes], clusters };
    }, [nodes, viewState.zoom, viewState.longitude, viewState.latitude, dimensions]);

    return { clusteredData, nodePositions, visualEdgePaths, offsetEdges };
}
