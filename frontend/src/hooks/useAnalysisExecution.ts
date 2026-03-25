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
}

export function useAnalysisExecution({
  dateRange,
  updateWindow,
  setAnalysisWindows,
  bringWindowToFront
}: AnalysisExecutionProps) {

  const performConsumptionFetch = useCallback(async (
    windowId: string, 
    nodeIds: string[], 
    start: string, 
    end: string
  ) => {
    try {
      const resp = await fetchConsumption(nodeIds, start, end);
      updateWindow(windowId, { data: resp.time_series, loading: false });
    } catch (e) {
      console.error('Consumption fetch failed', e);
      updateWindow(windowId, { loading: false });
    }
  }, [updateWindow]);

  const performVoltageFetch = useCallback(async (
    windowId: string, 
    nodeIds: string[], 
    start: string, 
    end: string, 
    degrees: number
  ) => {
    try {
      const resp = await fetchVoltageDistribution(nodeIds, start, end, degrees);
      updateWindow(windowId, { 
        data: resp.distribution || [], 
        scatterData: resp.scatter || [], 
        timeSeriesData: resp.timeseries || [], 
        loading: false 
      });
    } catch (e) {
      console.error('Voltage fetch failed', e);
      updateWindow(windowId, { loading: false });
    }
  }, [updateWindow]);

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
    const est = await fetchConsumptionEstimate(nodeIds, start, end);
    
    if (est.estimated_rows > 50000) {
      updateWindow(id, { 
        loading: false, 
        isPaused: true, 
        estimatedRows: est.estimated_rows,
        pendingRequest: { nodeIds, start, end } 
      });
    } else {
      await performConsumptionFetch(id, nodeIds, start, end);
    }
  }, [dateRange, performConsumptionFetch, setAnalysisWindows, bringWindowToFront, updateWindow]);

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
    const est = await fetchVoltageEstimate(nodeIds, start, end, degrees);

    if (est.estimated_rows > 50000) {
      updateWindow(id, { 
        loading: false, 
        isPaused: true, 
        estimatedRows: est.estimated_rows,
        pendingRequest: { nodeIds, start, end, degrees } 
      });
    } else {
      await performVoltageFetch(id, nodeIds, start, end, degrees);
    }
  }, [dateRange, performVoltageFetch, setAnalysisWindows, bringWindowToFront, updateWindow]);

  return {
    handleRunConsumption,
    handleRunVoltageMap,
    performConsumptionFetch,
    performVoltageFetch
  };
}
