import { useMemo } from 'react';
import { WebMercatorViewport } from '@deck.gl/core';
import Supercluster from 'supercluster';
import type { Node, Edge } from '../../../shared/types';
import { SWITCH_EDGE_TYPES, edgeMidpoint } from '../model/mapUtils';

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
        return edges.map(edge => ({
            ...edge,
            sourcePosition: nodePositions[edge.source] || edge.sourcePosition,
            targetPosition: nodePositions[edge.target] || edge.targetPosition,
        }));
    }, [edges, nodePositions]);

    const visualEdgePaths = useMemo(() => {
        const OFFSET = 0.00004;
        const visibleEdges = offsetEdges.filter(e =>
            (e.display_min_zoom === undefined || viewState.zoom >= e.display_min_zoom) &&
            (e.display_max_zoom === undefined || viewState.zoom <= e.display_max_zoom)
        );
        return visibleEdges.flatMap(e => {
            if (!e.edge_type || !SWITCH_EDGE_TYPES.has(e.edge_type)) {
                return [{ ...e, path: [e.sourcePosition, e.targetPosition] }];
            }
            const mid = edgeMidpoint(e);
            const dx = (e.targetPosition[0] - e.sourcePosition[0]) * Math.cos((e.sourcePosition[1] * Math.PI) / 180);
            const dy = e.targetPosition[1] - e.sourcePosition[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < OFFSET * 3) return [{ ...e, path: [e.sourcePosition, e.targetPosition] }];
            const mag = Math.sqrt(Math.pow(e.targetPosition[0] - e.sourcePosition[0], 2) + Math.pow(e.targetPosition[1] - e.sourcePosition[1], 2));
            const ux = (e.targetPosition[0] - e.sourcePosition[0]) / mag;
            const uy = (e.targetPosition[1] - e.sourcePosition[1]) / mag;
            return [
                { ...e, path: [e.sourcePosition, [mid[0] - ux * (OFFSET / Math.cos((mid[1] * Math.PI) / 180)), mid[1] - uy * OFFSET]] },
                { ...e, path: [[mid[0] + ux * (OFFSET / Math.cos((mid[1] * Math.PI) / 180)), mid[1] + uy * OFFSET], e.targetPosition] },
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

    return { clusteredData, nodePositions, visualEdgePaths };
}
