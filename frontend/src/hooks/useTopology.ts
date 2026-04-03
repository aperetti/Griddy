import { useState, useCallback } from 'react';
import type { Node, Edge } from '../shared/types';

export function useTopology() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [nodeAverages, setNodeAverages] = useState<Record<string, number> | null>(null);
  const [edgeAverages, setEdgeAverages] = useState<Record<string, number> | null>(null);
  const [nodeCurrents, setNodeCurrents] = useState<Record<string, { a: number, b: number, c: number }> | null>(null);
  const [topologyLoading, setTopologyLoading] = useState(false);
  const [topologyVersion, setTopologyVersion] = useState(0);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [highlightedEdges, setHighlightedEdges] = useState<Set<string>>(new Set());
  const [activeModelIds, setActiveModelIds] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0);

  const refreshTopology = useCallback(() => {
    setIsSearching(true);
    setTopologyVersion(v => v + 1);
  }, []);

  const handleClearSelection = useCallback(() => {
    setHighlightedNodes(new Set());
    setHighlightedEdges(new Set());
  }, []);

  return {
    nodes,
    setNodes,
    edges,
    setEdges,
    nodeAverages,
    setNodeAverages,
    edgeAverages,
    setEdgeAverages,
    nodeCurrents,
    setNodeCurrents,
    topologyLoading,
    setTopologyLoading,
    topologyVersion,
    setTopologyVersion,
    refreshTopology,
    highlightedNodes,
    setHighlightedNodes,
    highlightedEdges,
    setHighlightedEdges,
    activeModelIds,
    setActiveModelIds,
    isSearching,
    setIsSearching,
    handleClearSelection,
    fitBoundsTrigger,
    setFitBoundsTrigger
  };
}
