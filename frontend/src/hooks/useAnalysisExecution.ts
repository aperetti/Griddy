import { useCallback } from 'react';
import {
  fetchConsumptionEstimate,
  fetchVoltageEstimate,
  fetchConsumption,
  fetchVoltageDistribution
} from '../shared/api';
import { type AnalysisInstance } from './useAnalyticsState';

interface AnalysisExecutionProps {
  dateRange: { start: string, end: string };
  updateWindow: (id: string, updates: Partial<AnalysisInstance>) => void;
  setAnalysisWindows: React.Dispatch<React.SetStateAction<AnalysisInstance[]>>;
  bringWindowToFront: (id: string) => void;
  systemConfig: Record<string, string>;
  setHighlightedNodes?: React.Dispatch<React.SetStateAction<Set<string>>>;
  setHighlightedEdges?: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useAnalysisExecution({
  dateRange,
  updateWindow,
  setAnalysisWindows,
  bringWindowToFront,
  systemConfig,
  setHighlightedNodes,
  setHighlightedEdges
}: AnalysisExecutionProps) {

  const updateHighlights = useCallback((nodeIds: string[], edgeIds: string[]) => {
    if (setHighlightedNodes && nodeIds?.length > 0) {
      setHighlightedNodes(prev => {
        const next = new Set(prev);
        nodeIds.forEach(id => next.add(id));
        return next;
      });
    }
    if (setHighlightedEdges && edgeIds?.length > 0) {
      setHighlightedEdges(prev => {
        const next = new Set(prev);
        edgeIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [setHighlightedNodes, setHighlightedEdges]);

  const performConsumptionFetch = useCallback(async (
    windowId: string,
    nodeIds: string[],
    start: string,
    end: string
  ) => {
    updateWindow(windowId, { loading: true, isPaused: false });
    try {
      const resp = await fetchConsumption(nodeIds, start, end);
      updateWindow(windowId, { data: resp.time_series, loading: false });
      
      // Highlight downstream nodes and edges
      if (resp.downstream_node_ids || resp.downstream_edge_ids) {
        updateHighlights(resp.downstream_node_ids || [], resp.downstream_edge_ids || []);
      }
    } catch (e) {
      console.error('Consumption fetch failed', e);
      updateWindow(windowId, { loading: false });
    }
  }, [updateWindow, updateHighlights]);

  const performVoltageFetch = useCallback(async (
    windowId: string,
    nodeIds: string[],
    start: string,
    end: string,
    degrees: number
  ) => {
    updateWindow(windowId, { loading: true, isPaused: false });
    try {
      const resp = await fetchVoltageDistribution(nodeIds, start, end, degrees);
      updateWindow(windowId, {
        data: resp.distribution || [],
        scatterData: resp.scatter || [],
        timeSeriesData: resp.timeseries || [],
        loading: false
      });

      // Highlight downstream nodes and edges
      if (resp.downstream_node_ids || resp.downstream_edge_ids) {
        updateHighlights(resp.downstream_node_ids || [], resp.downstream_edge_ids || []);
      }
    } catch (e) {
      console.error('Voltage fetch failed', e);
      updateWindow(windowId, { loading: false });
    }
  }, [updateWindow, updateHighlights]);

  const handleRunConsumption = useCallback(async (nodeIds: string[], nodeName: string) => {
    if (nodeIds.length === 0) return;
    const id = `consumption-${Date.now()}`;
    const newWindow: AnalysisInstance = {
      id,
      type: 'consumption',
      nodeIds,
      nodeName,
      isOpen: true,
      isMinimized: false,
      loading: true,
      data: [],
      zIndex: 1000
    };

    setAnalysisWindows(prev => [...prev, newWindow]);
    bringWindowToFront(id);

    const { start, end } = dateRange;
    try {
      const est = await fetchConsumptionEstimate(nodeIds, start, end);
      
      // Update highlights from estimate immediately
      if (est.downstream_node_ids || est.downstream_edge_ids) {
        updateHighlights(est.downstream_node_ids || [], est.downstream_edge_ids || []);
      }

      const threshold = Number(systemConfig['analytics_threshold'] || 2000000);
      if (est.estimated_rows > threshold) {
        updateWindow(id, {
          loading: false,
          isPaused: true,
          estimatedRows: est.estimated_rows,
          pendingRequest: { nodeIds, start, end }
        });
      } else {
        await performConsumptionFetch(id, nodeIds, start, end);
      }
    } catch (err) {
      console.error('Estimate fetch failed:', err);
      updateWindow(id, { loading: false });
    }
  }, [dateRange, performConsumptionFetch, setAnalysisWindows, bringWindowToFront, updateWindow, systemConfig, updateHighlights]);

  const handleRunVoltageMap = useCallback(async (nodeIds: string[], nodeName: string, degrees: number = 5) => {
    if (nodeIds.length === 0) return;
    const id = `voltage-${Date.now()}`;
    const newWindow: AnalysisInstance = {
      id,
      type: 'voltage',
      nodeIds,
      nodeName,
      isOpen: true,
      isMinimized: false,
      loading: true,
      data: [],
      degrees,
      zIndex: 1000
    };

    setAnalysisWindows(prev => [...prev, newWindow]);
    bringWindowToFront(id);

    const { start, end } = dateRange;
    try {
      const est = await fetchVoltageEstimate(nodeIds, start, end, degrees);
      
      // Update highlights from estimate immediately
      if (est.downstream_node_ids || est.downstream_edge_ids) {
        updateHighlights(est.downstream_node_ids || [], est.downstream_edge_ids || []);
      }

      const threshold = Number(systemConfig['analytics_threshold'] || 2000000);
      if (est.estimated_rows > threshold) {
        updateWindow(id, {
          loading: false,
          isPaused: true,
          estimatedRows: est.estimated_rows,
          pendingRequest: { nodeIds, start, end, degrees }
        });
      } else {
        await performVoltageFetch(id, nodeIds, start, end, degrees);
      }
    } catch (err) {
      console.error('Estimate fetch failed:', err);
      updateWindow(id, { loading: false });
    }
  }, [dateRange, performVoltageFetch, setAnalysisWindows, bringWindowToFront, updateWindow, systemConfig, updateHighlights]);

  return {
    handleRunConsumption,
    handleRunVoltageMap,
    performConsumptionFetch,
    performVoltageFetch
  };
}
