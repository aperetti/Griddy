/**
 * Manages topology data loading lifecycle: initial load, incremental model
 * add/remove, and full topology refresh.
 *
 * Eliminates the duplicate fetchModels() call that was present when App.tsx
 * independently fetched models — now ModelSwitcher is the single source.
 */
import { useEffect, useRef } from 'react';
import { fetchTopology, fetchModels, loadModel } from '../shared/api';
import type { Node, Edge } from '../shared/types';

interface TopologyState {
    activeModelIds: string[];
    setActiveModelIds: (ids: string[] | ((prev: string[]) => string[])) => void;
    topologyVersion: number;
    topologyLoading: boolean;
    setTopologyLoading: (v: boolean) => void;
    setIsSearching: (v: boolean) => void;
    setNodes: (nodes: Node[] | ((prev: Node[]) => Node[])) => void;
    setEdges: (edges: Edge[] | ((prev: Edge[]) => Edge[])) => void;
}

export function useTopologyLoader(topology: TopologyState) {
    const lastActiveModelIds = useRef<string[]>([]);

    useEffect(() => {
        console.log('[App] useEffect triggered', { version: topology.topologyVersion, active: topology.activeModelIds });
        const load = async () => {
            // Initialize with a single model if nothing is active
            if (topology.activeModelIds.length === 0) {
                console.log('[App] No active models, fetching...');
                try {
                    const models = await fetchModels();
                    console.log('[App] Discovered models:', models);
                    if (models.length > 0) {
                        console.log('[App] Auto-activating first model:', models[0].feeder_id);
                        topology.setActiveModelIds([models[0].feeder_id]);
                        return;
                    }
                } catch (err) {
                    console.error('[App] Failed to fetch models for initialization:', err);
                }
            }

            const current = topology.activeModelIds;
            const prev = lastActiveModelIds.current;

            const added = current.filter(id => !prev.includes(id));
            const removed = prev.filter(id => !current.includes(id));

            // Force full reload if topologyVersion changes (manual refresh)
            const isRefresh = topology.topologyVersion > 0 && added.length === 0 && removed.length === 0;

            if (isRefresh) {
                try {
                    // Ensure all active models are loaded in backend memory before fetching
                    await Promise.all(current.map(id => 
                        loadModel(id).catch(err => console.error(`[App] Failed to load model ${id}:`, err))
                    ));
                    const data = await fetchTopology(current);
                    topology.setNodes(data.nodes);
                    topology.setEdges(data.edges);
                    lastActiveModelIds.current = current;
                } finally {
                    topology.setTopologyLoading(false);
                    topology.setIsSearching(false);
                }
                return;
            }

            // Incremental Update logic
            if (added.length > 0 || removed.length > 0) {
                topology.setTopologyLoading(true);
                try {
                    // Remove nodes/edges for models that are no longer active
                    if (removed.length > 0) {
                        const removedSet = new Set(removed);
                        topology.setNodes(nodes => nodes.filter(n => !n.model_id || !removedSet.has(n.model_id)));
                        topology.setEdges(edges => edges.filter(e => !e.model_id || !removedSet.has(e.model_id)));
                    }

                    // Fetch and add nodes/edges for new models
                    if (added.length > 0) {
                        const loadResults = await Promise.all(added.map(async id => {
                            try {
                                await loadModel(id);
                                return id;
                            } catch (err) {
                                console.error(`[App] Failed to load model ${id}:`, err);
                                return null;
                            }
                        }));

                        const successfulIds = loadResults.filter((id): id is string => id !== null);
                        
                        if (successfulIds.length > 0) {
                            const data = await fetchTopology(successfulIds);
                            topology.setNodes(nodes => [...nodes, ...data.nodes]);
                            topology.setEdges(edges => [...edges, ...data.edges]);
                        }
                    }

                    lastActiveModelIds.current = current;
                } catch (err) {
                    console.error('[App] Incremental topology load failed:', err);
                } finally {
                    topology.setTopologyLoading(false);
                    topology.setIsSearching(false);
                }
            }
        };
        load();
    }, [topology.topologyVersion, topology.activeModelIds]);
}
