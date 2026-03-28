import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAnalysisExecution } from './useAnalysisExecution';
import * as api from '../shared/api';

// Mock api
vi.mock('../shared/api', () => ({
  fetchConsumption: vi.fn(),
  fetchVoltageDistribution: vi.fn(),
  fetchConsumptionEstimate: vi.fn(),
  fetchVoltageEstimate: vi.fn(),
}));

// Mock React hooks to work outside of a component for testing logic
vi.mock('react', () => ({
  useCallback: (fn: any) => fn,
  useMemo: (fn: any) => fn(),
  useEffect: vi.fn(),
  useState: (initial: any) => [initial, vi.fn()],
}));

describe('useAnalysisExecution logic', () => {
  const mockProps = {
    dateRange: { start: '2023-01-01', end: '2023-01-02' },
    updateWindow: vi.fn(),
    setAnalysisWindows: vi.fn(),
    bringWindowToFront: vi.fn(),
    systemConfig: {},
    setHighlightedNodes: vi.fn(),
    setHighlightedEdges: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update highlights when consumption fetch completes', async () => {
    const mockResp = {
      time_series: [],
      downstream_node_ids: ['node1', 'node2'],
      downstream_edge_ids: ['edge1'],
    };
    (api.fetchConsumption as any).mockResolvedValue(mockResp);

    const hook = useAnalysisExecution(mockProps as any);
    
    await hook.performConsumptionFetch('win1', ['root'], '2023-01-01', '2023-01-02');

    expect(mockProps.setHighlightedNodes).toHaveBeenCalled();
    expect(mockProps.setHighlightedEdges).toHaveBeenCalled();

    // Verify the highlight update logic (functional update)
    const nodeUpdateFn = (mockProps.setHighlightedNodes as any).mock.calls[0][0];
    const initialNodes = new Set<string>(['existing']);
    const updatedNodes = nodeUpdateFn(initialNodes);
    expect(updatedNodes.has('node1')).toBe(true);
    expect(updatedNodes.has('node2')).toBe(true);
    expect(updatedNodes.has('existing')).toBe(true);
  });

  it('should update highlights when voltage fetch completes', async () => {
    const mockResp = {
      distribution: [],
      downstream_node_ids: ['v-node1'],
      downstream_edge_ids: ['v-edge1'],
    };
    (api.fetchVoltageDistribution as any).mockResolvedValue(mockResp);

    const hook = useAnalysisExecution(mockProps as any);
    
    await hook.performVoltageFetch('win1', ['root'], '2023-01-01', '2023-01-02', 5);

    expect(mockProps.setHighlightedNodes).toHaveBeenCalled();
    const nodeUpdateFn = (mockProps.setHighlightedNodes as any).mock.calls[0][0];
    const updatedNodes = nodeUpdateFn(new Set());
    expect(updatedNodes.has('v-node1')).toBe(true);
  });

  it('should update highlights from estimate in handleRunConsumption', async () => {
    const mockEst = {
      estimated_rows: 100,
      downstream_node_ids: ['est-node'],
      downstream_edge_ids: ['est-edge'],
    };
    (api.fetchConsumptionEstimate as any).mockResolvedValue(mockEst);
    (api.fetchConsumption as any).mockResolvedValue({ time_series: [] });

    const hook = useAnalysisExecution(mockProps as any);
    
    await hook.handleRunConsumption(['root'], 'Test Node');

    expect(mockProps.setHighlightedNodes).toHaveBeenCalled();
    const nodeUpdateFn = (mockProps.setHighlightedNodes as any).mock.calls[0][0];
    const updatedNodes = nodeUpdateFn(new Set());
    expect(updatedNodes.has('est-node')).toBe(true);
  });
});
