import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { useState, useEffect, useCallback } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { MantineProvider, AppShell, Box, Stack, ActionIcon, Menu, Group, Tooltip, Paper } from '@mantine/core';
import { Menu as MenuIcon, X, Search, Activity, Settings, Zap } from 'lucide-react';

import { GridMap } from './features/grid/components/GridMap';
import { AnalysisToolbar } from './features/grid/components/AnalysisToolbar';
import { AnalyticsPanel } from './features/analytics/components/AnalyticsPanel';
import { ConsumptionTimeSeriesModal } from './features/analytics/components/ConsumptionTimeSeriesModal';
import { VoltageDistributionModal } from './features/analytics/components/VoltageDistributionModal';
import { VoltageScalePanel } from './features/analytics/components/VoltageScalePanel';
import { GlobalSettingsModal, type GlobalConfig } from './features/analytics/components/GlobalSettingsModal';
import { DiagnosticModal } from './features/analytics/components/DiagnosticModal';
import { GlobalSearch } from './features/grid/components/GlobalSearch';
import { ModelSwitcher } from './features/grid/components/ModelSwitcher';
import {
  fetchTopology,
  fetchConsumption,
  fetchVoltageDistribution,
  fetchMapVoltage,
  fetchVoltageEstimate,
  fetchConsumptionEstimate,
  fetchMapVoltageEstimate
} from './shared/api';
import type { Node, Edge } from './shared/types';

const DEFAULT_CONFIG: GlobalConfig = {
  defaultDuration: '1M',
  customDays: 30,
  endDateType: 'now',
  fixedEndDate: new Date().toISOString()
};

type AnalysisType = 'consumption' | 'voltage' | 'diagnostic';

interface AnalysisInstance {
  id: string;
  type: AnalysisType;
  nodeIds: string[];
  nodeName: string;
  isOpen: boolean;
  isMinimized: boolean;
  loading: boolean;
  data: any[];
  estimatedRows?: number;
  // Voltage specific
  degrees?: number | null;
  scatterData?: any[];
  timeSeriesData?: any[];
  // Large query handling
  isPaused?: boolean;
  pendingRequest?: { nodeIds: string[], start: string, end: string, degrees?: number | null };
}

const calculateRange = (config: GlobalConfig) => {
  const end = config.endDateType === 'now' ? new Date() : new Date(config.fixedEndDate);
  const start = new Date(end.getTime());

  const duration = config.defaultDuration || '1M';

  if (duration === '1D') {
    start.setDate(end.getDate() - 1);
  } else if (duration === '1W') {
    start.setDate(end.getDate() - 7);
  } else if (duration === '1M') {
    start.setMonth(end.getMonth() - 1);
  } else if (duration === '1Y') {
    start.setFullYear(end.getFullYear() - 1);
  } else if (duration === 'custom') {
    start.setDate(end.getDate() - (config.customDays || 30));
  } else {
    start.setMonth(end.getMonth() - 1);
  }

  // Final check for zero duration (edge case where math fails)
  if (start.getTime() === end.getTime()) {
    console.warn('[App] Range calculation resulted in zero duration! Falling back to 1M.');
    start.setMonth(end.getMonth() - 1);
  }

  return {
    start: start.toISOString().split('.')[0],
    end: end.toISOString().split('.')[0]
  };
};

export default function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodes, setSelectedNodes] = useState<Node[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpened, setMenuOpened] = useState(false);
  const [activeModelIds, setActiveModelIds] = useState<string[]>([]);

  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(() => {
    const saved = localStorage.getItem('globalConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with DEFAULT_CONFIG to ensure new fields (like endDateType) are present
        return { ...DEFAULT_CONFIG, ...parsed };
      } catch (e) {
        console.error('Failed to parse saved globalConfig', e);
      }
    }
    return DEFAULT_CONFIG;
  });

  const [dateRange, setDateRange] = useState(() => calculateRange(globalConfig));
  useEffect(() => {
    localStorage.setItem('globalConfig', JSON.stringify(globalConfig));
    // When config changes, we might want to refresh the dateRange if it's "now" based
    if (globalConfig.endDateType === 'now') {
      setDateRange(calculateRange(globalConfig));
    }
  }, [globalConfig]);

  const [activeSidePanel, setActiveSidePanel] = useState<'none' | 'analytics'>('none');
  const [loading, setLoading] = useState(false);
  const [mapVoltageEstimatedRows, setMapVoltageEstimatedRows] = useState<number | undefined>();

  const [analysisWindows, setAnalysisWindows] = useState<AnalysisInstance[]>([]);

  const updateWindow = (id: string, updates: Partial<AnalysisInstance>) => {
    setAnalysisWindows(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  };

  const removeWindow = (id: string) => {
    setAnalysisWindows(prev => prev.filter(w => w.id !== id));
  };

  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [highlightedEdges, setHighlightedEdges] = useState<Set<string>>(new Set());
  const [fitBoundsTrigger, setFitBoundsTrigger] = useState(0);
  const [nodeAverages, setNodeAverages] = useState<Record<string, number> | null>(null);
  const [nodeCurrents, setNodeCurrents] = useState<Record<string, { a: number, b: number, c: number }> | null>(null);
  const [topologyLoading, setTopologyLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const [voltageScale, setVoltageScale] = useState(() => {
    const saved = localStorage.getItem('voltageScale');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved voltageScale', e);
      }
    }
    return {
      criticalHigh: 1.06,
      highWarning: 1.05,
      lowWarning: 0.95,
      criticalLow: 0.90,
      baseVoltage: 120
    };
  });

  useEffect(() => {
    localStorage.setItem('voltageScale', JSON.stringify(voltageScale));
  }, [voltageScale]);

  // Deep-link support: Handle ?node=ID URL parameter
  useEffect(() => {
    console.log('[App] Deep-link check, nodes.length:', nodes.length);
    if (nodes.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const nodeId = params.get('node');
      console.log('[App] URL node param:', nodeId);
      if (nodeId) {
        const node = nodes.find(n => n.id === nodeId);
        if (node) {
          console.log('[App] AUTO-SELECTING node:', nodeId);
          setSelectedNodes([node]);
          setFitBoundsTrigger(prev => prev + 1);
        } else {
          console.error('[App] URL node not found in topology:', nodeId);
        }
      }
    }
  }, [nodes]);


  const handleClearSelection = useCallback(() => setSelectedNodes([]), []);
  const handleSearchSelect = useCallback(async (item: any) => {
    // If item has a model_id that is not currently active, activate it
    if (item.model_id && !activeModelIds.includes(item.model_id)) {
      console.log('[App] Activating model from search result:', item.model_id);
      setIsSearching(true);
      setActiveModelIds(prev => [...prev, item.model_id]);
      // The useEffect for activeModelIds will trigger topology reload
    }

    if (item.type === 'node' || !('source' in item)) {
      // Node selected
      setSelectedNodes([item as Node]);
      setHighlightedNodes(new Set([item.id]));
      setHighlightedEdges(new Set());
    } else {
      // Edge selected
      const edge = item as Edge;
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (source && target) {
        setSelectedNodes([source, target]);
        setHighlightedNodes(new Set([source.id, target.id]));
        setHighlightedEdges(new Set([edge.id || `${edge.source}-${edge.target}`]));
      }
    }
    setFitBoundsTrigger(prev => prev + 1);
  }, [nodes, activeModelIds]);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const onNodeClick = useCallback((node: Node, multiSelect: boolean) => {
    console.log('[App] onNodeClick:', node.id, 'multiSelect:', multiSelect, 'isMobile:', isMobile);
    setSelectedNodes(prev => {
      // On mobile, default to multi-select (toggle behavior)
      const effectiveMultiSelect = isMobile ? true : multiSelect;
      
      if (!effectiveMultiSelect) return [node];
      
      const exists = prev.find(n => n.id === node.id);
      if (exists) return prev.filter(n => n.id !== node.id);
      return [...prev, node];
    });
  }, [isMobile]);

  const onEdgeClick = useCallback((edge: Edge, multiSelect: boolean) => {
    // Select the downstream node (target)
    const targetNode = nodes.find(n => n.id === edge.target);
    if (!targetNode) return;
    onNodeClick(targetNode, multiSelect);
  }, [nodes, onNodeClick]);

  // Reload topology when model selection changes
  const handleModelsChange = useCallback((modelIds: string[]) => {
    setActiveModelIds(modelIds);
  }, []);

  const handleZoomToModel = useCallback((modelId: string) => {
    const modelNodes = nodes.filter(n => n.model_id === modelId);
    if (modelNodes.length === 0) {
      console.warn('[App] No nodes found for model:', modelId);
      return;
    }
    setHighlightedNodes(new Set(modelNodes.map(n => n.id)));
    setFitBoundsTrigger(prev => prev + 1);
  }, [nodes]);

  // Initial model loading: ensure at least one model is active
  useEffect(() => {
    if (activeModelIds.length === 0) {
      import('./shared/api').then(({ fetchModels }) => {
        fetchModels().then(models => {
          if (models.length > 0) {
            console.log('[App] Initializing with first model:', models[0].model_id);
            setActiveModelIds([models[0].model_id]);
          }
        });
      });
    }
  }, []);

  useEffect(() => {
    // Only fetch once we know which models are active (initial load or model toggle)
    if (activeModelIds.length === 0) return;
    
    setTopologyLoading(true);
    fetchTopology(activeModelIds)
      .then(data => {
        setNodes(data.nodes);
        setEdges(data.edges);
        if (data.nodes.length === 0) {
          console.warn('[App] Topology returned 0 nodes');
        }
      })
      .catch(err => console.error('[App] Failed to fetch topology:', err))
      .finally(() => {
        setTopologyLoading(false);
        // Reset searching state after topology is loaded and any potential zooms have triggered
        setTimeout(() => setIsSearching(false), 1500);
      });
  }, [activeModelIds]);
  
  const handleShowDiagnostic = async (targetId?: string, targetType?: 'Node' | 'Edge') => {
    // If no specific ID provided, use the last selected node or the first selected node
    const id = targetId || selectedNodes[selectedNodes.length - 1]?.id;
    if (!id) return;
    
    // Default to Node if not specified
    const windowId = `diagnostic-${id}`;
    
    const nodeLabel = targetId 
        ? `${targetType} ${targetId}` 
        : (selectedNodes[selectedNodes.length - 1]?.name || id);

    setAnalysisWindows(prev => prev.map(w =>
      (w.id !== windowId)
        ? { ...w, isMinimized: true }
        : w
    ));

    const existing = analysisWindows.find(w => w.id === windowId);
    if (existing) {
      updateWindow(windowId, { isOpen: true, isMinimized: false });
      return;
    }

    const newWindow: AnalysisInstance = {
      id: windowId,
      type: 'diagnostic',
      nodeIds: [id],
      nodeName: nodeLabel,
      isOpen: true,
      isMinimized: false,
      loading: false, // DiagnosticModal handles its own loading
      data: [],
    };
    setAnalysisWindows(prev => [...prev, newWindow]);
  };
  
  const handleZoomToAsset = useCallback((id: string, type: 'Node' | 'Edge') => {
    if (type === 'Node') {
      const node = nodes.find(n => n.id === id);
      if (node) {
        setHighlightedNodes(new Set([id]));
        setHighlightedEdges(new Set());
        setFitBoundsTrigger(prev => prev + 1);
      }
    } else {
      const edge = edges.find(e => e.id === id || `${e.source}-${e.target}` === id);
      if (edge) {
        setHighlightedNodes(new Set([edge.source, edge.target]));
        setHighlightedEdges(new Set([edge.id || `${edge.source}-${edge.target}`]));
        setFitBoundsTrigger(prev => prev + 1);
      }
    }
  }, [nodes, edges]);

  const handleRunVoltageMap = async (agg: string) => {
    setLoading(true);
    setMapVoltageEstimatedRows(undefined);

    const firstNodeId = selectedNodes.length > 0 ? selectedNodes[0].id : null;

    // Fetch estimate separately to unblock the loading UI
    fetchMapVoltageEstimate(dateRange.start, dateRange.end, agg, firstNodeId)
      .then(res => setMapVoltageEstimatedRows(res.estimated_rows))
      .catch(err => console.error('[App] Map estimate failed:', err));

    try {
      const res = await fetchMapVoltage(dateRange.start, dateRange.end, agg, firstNodeId);

      if (res.estimated_rows !== undefined) {
        setMapVoltageEstimatedRows(res.estimated_rows);
      }

      if (res.node_voltages) {
        setNodeAverages(res.node_voltages);
        setNodeCurrents(res.node_currents || null);
        // We highlight the area if a specific node was queried
        if (firstNodeId) {
          const keys = Object.keys(res.node_voltages);
          setHighlightedNodes(new Set(keys));
          // For map voltage we don't have explicit edges yet in the same way, 
          // but we can clear them or try to infer. Let's clear for now.
          setHighlightedEdges(new Set());
        } else {
          setHighlightedNodes(new Set());
          setHighlightedEdges(new Set());
        }
      }
    } catch (err) {
      console.error('[App] Failed to fetch map voltage overlay:', err);
    } finally {
      setLoading(false);
    }
  };

  const performConsumptionFetch = async (windowId: string, nodeIds: string[], start: string, end: string) => {
    try {
      const res = await fetchConsumption(nodeIds, start, end);
      if (res.downstream_node_ids) {
        setHighlightedNodes(new Set(res.downstream_node_ids));
      } else {
        setHighlightedNodes(new Set());
      }
      if (res.downstream_edge_ids) {
        setHighlightedEdges(new Set(res.downstream_edge_ids));
      } else {
        setHighlightedEdges(new Set());
      }
      
      updateWindow(windowId, {
        data: (res.time_series && res.time_series.length > 0) ? res.time_series : [],
        estimatedRows: res.estimated_rows,
        loading: false,
        isMinimized: false
      });

    } catch (err) {
      console.error('[App] Failed to fetch consumption:', err);
      updateWindow(windowId, { loading: false });
    } finally {
      setFitBoundsTrigger(prev => prev + 1);
    }
  };

  const handleShowConsumption = async (rangeOption?: string, overrideNode?: Node) => {
    const nodesToQuery = overrideNode ? [overrideNode] : selectedNodes;
    if (nodesToQuery.length === 0) return;
    if (overrideNode) setSelectedNodes([overrideNode]);

    const nodeLabel = nodesToQuery.length > 1
      ? `${nodesToQuery.length} Assets Aggregate`
      : (nodesToQuery[0]?.name || nodesToQuery[0]?.id || '');

    const nodeIds = nodesToQuery.map(n => n.id);
    const windowId = `consumption-${nodeIds.join('-')}`;

    const range = calculateRange(globalConfig);
    let start = range.start;
    let end = range.end;
    if (globalConfig.endDateType === 'now') {
      setDateRange(range);
    }

    if (rangeOption) {
      const endDate = new Date();
      const startDate = new Date();
      if (rangeOption === '1W') startDate.setDate(startDate.getDate() - 7);
      if (rangeOption === '1M') startDate.setMonth(startDate.getMonth() - 1);
      if (rangeOption === '1Y') startDate.setFullYear(startDate.getFullYear() - 1);

      start = startDate.toISOString().split('.')[0];
      end = endDate.toISOString().split('.')[0];
      setDateRange({ start, end });
    }

    // Global minimization: minimize ALL other windows regardless of type
    setAnalysisWindows(prev => prev.map(w =>
      (w.id !== windowId)
        ? { ...w, isMinimized: true }
        : w
    ));

    const existing = analysisWindows.find(w => w.id === windowId);
    if (existing) {
      updateWindow(windowId, { isOpen: true, isMinimized: false });
      return;
    }

    const newWindow: AnalysisInstance = {
      id: windowId,
      type: 'consumption',
      nodeIds,
      nodeName: nodeLabel,
      isOpen: true,
      isMinimized: false,
      loading: true,
      data: [],
      isPaused: false,
    };
    setAnalysisWindows(prev => [...prev, newWindow]);

    try {
      const estRes = await fetchConsumptionEstimate(nodeIds, start, end);
      updateWindow(windowId, { estimatedRows: estRes.estimated_rows });

      if (estRes.estimated_rows > 10000000) {
        updateWindow(windowId, {
          isPaused: true,
          pendingRequest: { nodeIds, start, end },
          loading: false
        });
        return;
      }

      await performConsumptionFetch(windowId, nodeIds, start, end);
    } catch (err) {
      console.error('[App] Consumption safety check failed:', err);
      updateWindow(windowId, { loading: false });
    }
  };

  const handleConfirmConsumption = async (windowId: string) => {
    const win = analysisWindows.find(w => w.id === windowId);
    if (!win || !win.pendingRequest) return;
    updateWindow(windowId, { isPaused: false, loading: true });
    const { nodeIds, start, end } = win.pendingRequest;
    await performConsumptionFetch(windowId, nodeIds, start, end);
  };

  const performVoltageFetch = async (windowId: string, nodeIds: string[], start: string, end: string, degreesToUse: number | null) => {
    try {
      const res = await fetchVoltageDistribution(nodeIds, start, end, degreesToUse === null ? undefined : degreesToUse);
      if (res.downstream_node_ids) {
        setHighlightedNodes(new Set(res.downstream_node_ids));
      } else {
        setHighlightedNodes(new Set());
      }
      if (res.downstream_edge_ids) {
        setHighlightedEdges(new Set(res.downstream_edge_ids));
      } else {
        setHighlightedEdges(new Set());
      }
      
      const distribution = res.distribution ? res.distribution.map((d: any) => ({
        voltage: d.voltage.toString() + 'V',
        a: d.phase_a,
        b: d.phase_b,
        c: d.phase_c,
      })) : [];

      let scatterData: any[] = [];
      if (res.scatter) {
        const maxCount = Math.max(...res.scatter.map((d: any) => d.count || 1), 1);
        scatterData = [
          {
            color: 'cyan.6',
            name: 'Voltage vs Loading Density',
            data: res.scatter.map((d: any) => ({
              x: d.loading,
              y: d.voltage,
              count: d.count || 1,
              maxCount: maxCount
            }))
          }
        ];
      }

      if (res.node_averages) {
        setNodeAverages(res.node_averages);
      }

      updateWindow(windowId, {
        data: distribution,
        scatterData,
        timeSeriesData: res.timeseries || [],
        estimatedRows: res.estimated_rows,
        loading: false,
        isMinimized: false
      });

    } catch (err) {
      console.error('[App] Failed to fetch voltage distribution:', err);
      updateWindow(windowId, { loading: false });
    } finally {
      setFitBoundsTrigger(prev => prev + 1);
    }
  };

  const handleShowVoltageDistribution = async (rangeOption?: string, overrideNode?: Node, degrees?: number | null) => {
    const nodesToQuery = overrideNode ? [overrideNode] : selectedNodes;
    if (nodesToQuery.length === 0) return;
    if (overrideNode) setSelectedNodes([overrideNode]);

    const nodeIds = nodesToQuery.map(n => n.id);
    const nodeLabel = nodesToQuery[0]?.name || nodesToQuery[0]?.id || '';
    const windowId = `voltage-${nodeIds.join('-')}`;

    const range = calculateRange(globalConfig);
    let start = range.start;
    let end = range.end;
    if (globalConfig.endDateType === 'now') {
      setDateRange(range);
    }

    if (rangeOption) {
      const endDate = new Date();
      const startDate = new Date();
      if (rangeOption === '1W') startDate.setDate(startDate.getDate() - 7);
      if (rangeOption === '1M') startDate.setMonth(startDate.getMonth() - 1);
      if (rangeOption === '1Y') startDate.setFullYear(startDate.getFullYear() - 1);

      start = startDate.toISOString().split('.')[0];
      end = endDate.toISOString().split('.')[0];
      setDateRange({ start, end });
    }

    // Global minimization: minimize ALL other windows regardless of type
    setAnalysisWindows(prev => prev.map(w =>
      (w.id !== windowId)
        ? { ...w, isMinimized: true }
        : w
    ));

    const existing = analysisWindows.find(w => w.id === windowId);
    const currentDegrees = existing?.degrees ?? 5;
    const degreesToUse = degrees !== undefined ? degrees : currentDegrees;

    if (existing && degrees === undefined) {
      updateWindow(windowId, { isOpen: true, isMinimized: false });
      return;
    }

    if (existing) {
        updateWindow(windowId, { loading: true, degrees: degreesToUse, isMinimized: false, isOpen: true });
    } else {
        const newWindow: AnalysisInstance = {
            id: windowId,
            type: 'voltage',
            nodeIds,
            nodeName: nodeLabel,
            isOpen: true,
            isMinimized: false,
            loading: true,
            data: [],
            degrees: degreesToUse,
            isPaused: false,
        };
        setAnalysisWindows(prev => [...prev, newWindow]);
    }

    setNodeAverages(null);

    try {
      const estRes = await fetchVoltageEstimate(nodeIds, start, end, degreesToUse === null ? undefined : degreesToUse);
      updateWindow(windowId, { estimatedRows: estRes.estimated_rows });

      if (estRes.estimated_rows > 10000000) {
        updateWindow(windowId, {
          isPaused: true,
          pendingRequest: { nodeIds, start, end, degrees: degreesToUse },
          loading: false
        });
        return;
      }

      await performVoltageFetch(windowId, nodeIds, start, end, degreesToUse);
    } catch (err) {
      console.error('[App] Voltage safety check failed:', err);
      updateWindow(windowId, { loading: false });
    }
  };

  const handleConfirmVoltage = async (windowId: string) => {
    const win = analysisWindows.find(w => w.id === windowId);
    if (!win || !win.pendingRequest) return;
    updateWindow(windowId, { isPaused: false, loading: true });
    const { nodeIds, start, end, degrees } = win.pendingRequest;
    await performVoltageFetch(windowId, nodeIds, start, end, degrees!);
  };

  return (
    <MantineProvider defaultColorScheme="dark">
      <GlobalSettingsModal
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={globalConfig}
        onSave={(newConfig) => {
          setGlobalConfig(newConfig);
          const newRange = calculateRange(newConfig);
          setDateRange(newRange);
        }}
      />

      <AppShell padding="0" header={{ height: 0 }}>
        <AppShell.Main>


          {/* Deck.GL Interactive Grid Map */}
          <Box style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
            <GridMap
              nodes={nodes}
              edges={edges}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              highlightedNodes={highlightedNodes}
              highlightedEdges={highlightedEdges}
              selectedNodeIds={selectedNodes.map(n => n.id)}
              nodeAverages={nodeAverages}
              nodeCurrents={nodeCurrents}
              onMapClick={handleClearSelection}
              voltageScale={voltageScale}
              fitHighlightedNodesTrigger={fitBoundsTrigger}
              skipGlobalFit={isSearching}
            />
          </Box>


          {/* Persistent Overlay Panels */}
          <VoltageScalePanel
            voltageScale={voltageScale}
            setVoltageScale={setVoltageScale}
            visible={!!nodeAverages}
          />

          {/* Floating Action Button and Analysis Toolbar */}
          <Box style={{ position: 'absolute', top: 20, right: 20, zIndex: 100, pointerEvents: 'none' }}>
            <Stack align="flex-end" gap="sm" style={{ pointerEvents: 'none' }}>
              <Group gap="xs" wrap="nowrap" justify="flex-end" style={{ pointerEvents: 'auto' }}>
                <GlobalSearch 
                  onSearchSelect={handleSearchSelect} 
                  isMobile={isMobile} 
                  loading={topologyLoading}
                />

                <ModelSwitcher 
                  activeModelIds={activeModelIds}
                  onModelsChange={handleModelsChange} 
                  onZoomToModel={handleZoomToModel}
                  loading={topologyLoading}
                />

                <Tooltip label="Global Settings" position="bottom" withArrow>
                  <ActionIcon
                    variant="filled"
                    color={settingsOpen ? "blue" : "gray"}
                    size="xl"
                    radius="md"
                    onClick={(e) => {
                      console.log('Settings clicked');
                      e.stopPropagation();
                      setSettingsOpen(true);
                    }}
                    style={{
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <Settings size={20} />
                  </ActionIcon>
                </Tooltip>

                <Menu 
                  shadow="md" 
                  width={200} 
                  position="bottom-end" 
                  withArrow 
                  offset={10}
                  opened={menuOpened}
                  onChange={setMenuOpened}
                >
                  <Menu.Target>
                    <ActionIcon
                      variant="filled"
                      color={menuOpened ? "blue" : "gray"}
                      size="xl"
                      radius="md"
                      style={{
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        border: '1px solid rgba(255,255,255,0.1)'
                      }}
                    >
                      <MenuIcon />
                    </ActionIcon>
                  </Menu.Target>

                  <Menu.Dropdown bg="rgba(26, 27, 30, 0.95)" style={{ backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <Menu.Label>System Analytics</Menu.Label>
                    <Menu.Item
                      leftSection={<Settings size={16} />}
                      onClick={() => {
                        setSettingsOpen(true);
                      }}
                    >
                      Global Analysis Settings
                    </Menu.Item>
                    <Menu.Item
                      leftSection={<Activity size={16} />}
                      onClick={() => setActiveSidePanel(p => p === 'analytics' ? 'none' : 'analytics')}
                      bg={activeSidePanel === 'analytics' ? 'rgba(51, 154, 240, 0.2)' : undefined}
                    >
                      Voltage Map Settings
                    </Menu.Item>

                    <Menu.Label>Resources</Menu.Label>
                    <Menu.Item
                      leftSection={<Search size={16} />}
                      onClick={() => window.open('/docs/', '_blank')}
                    >
                      Documentation
                    </Menu.Item>

                    <Menu.Divider />
                    <Menu.Item
                      leftSection={<X size={16} />}
                      color="red"
                      onClick={() => setActiveSidePanel('none')}
                    >
                      Close All Panels
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>

              <AnalysisToolbar
                selectedNodes={selectedNodes}
                onClearSelection={handleClearSelection}
                onViewConsumption={() => handleShowConsumption()}
                onViewVoltage={() => handleShowVoltageDistribution()}
                onViewDiagnostic={() => handleShowDiagnostic()}
                visible={selectedNodes.length > 0}
                dateRange={dateRange}
                configLabel={globalConfig.defaultDuration === 'custom' ? `${globalConfig.customDays} Days` : globalConfig.defaultDuration}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </Stack>
          </Box>

          {activeSidePanel !== 'none' && (
            <Box
              style={{ position: 'absolute', top: 80, right: 20, zIndex: 10, pointerEvents: 'none' }}
              w={{ base: 'calc(100vw - 40px)', sm: 400 }}
            >
              <Stack gap="16px">

                {activeSidePanel === 'analytics' && (
                  <div style={{ pointerEvents: 'auto' }}>
                    <AnalyticsPanel
                      dateRange={dateRange}
                      setDateRange={setDateRange}
                      loading={loading}
                      estimatedRows={mapVoltageEstimatedRows}
                      onRunVoltageMap={handleRunVoltageMap}
                    />
                  </div>
                )}
              </Stack>
            </Box>
          )}

          {/* Full Width Bottom Modals */}
          {analysisWindows.map(win => (
            win.type === 'consumption' ? (
              <ConsumptionTimeSeriesModal
                key={win.id}
                isOpen={win.isOpen}
                onClose={() => removeWindow(win.id)}
                loading={win.loading}
                data={win.data}
                estimatedRows={win.estimatedRows}
                nodeName={win.nodeName}
                isMinimized={win.isMinimized}
                onMinimize={() => updateWindow(win.id, { isMinimized: true })}
                isPaused={win.isPaused ?? false}
                onConfirm={() => handleConfirmConsumption(win.id)}
              />
            ) : win.type === 'voltage' ? (
              <VoltageDistributionModal
                key={win.id}
                isOpen={win.isOpen}
                onClose={() => removeWindow(win.id)}
                loading={win.loading}
                data={win.data}
                scatterData={win.scatterData || []}
                timeSeriesData={win.timeSeriesData || []}
                estimatedRows={win.estimatedRows}
                nodeName={win.nodeName}
                degrees={win.degrees ?? 5}
                onDegreesChange={(d: number | null) => handleShowVoltageDistribution(undefined, undefined, d)}
                isMinimized={win.isMinimized}
                onMinimize={() => updateWindow(win.id, { isMinimized: true })}
                isPaused={win.isPaused ?? false}
                onConfirm={() => handleConfirmVoltage(win.id)}
              />
            ) : win.type === 'diagnostic' ? (
              <DiagnosticModal
                key={win.id}
                isOpen={win.isOpen}
                onClose={() => removeWindow(win.id)}
                id={win.nodeIds[0]}
                type={win.nodeIds[0].includes('_') || win.nodeIds[0].length > 20 ? 'Edge' : 'Node'}
                title={win.nodeName}
                onZoomTo={handleZoomToAsset}
              />
            ) : null
          ))}

          {/* Minimized Modal Tabs */}
          <Box style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 110, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {analysisWindows.filter(w => w.isOpen && w.isMinimized).map(win => (
              <Paper
                key={win.id}
                withBorder
                px="sm"
                py="xs"
                style={{
                  cursor: 'pointer',
                  background: 'rgba(26, 27, 30, 0.95)',
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
                onClick={() => {
                  setAnalysisWindows(prev => prev.map(w =>
                    w.id === win.id ? { ...w, isMinimized: false } : { ...w, isMinimized: true }
                  ));
                }}
              >
                <Group gap="xs" wrap="nowrap">
                  {win.type === 'consumption' ? (
                    <Zap size={14} color="#339af0" />
                  ) : win.type === 'voltage' ? (
                    <Activity size={14} color="#fab005" />
                  ) : (
                    <Search size={14} color="#20c997" />
                  )}
                  <Box style={{ fontSize: '12px', fontWeight: 500 }}>
                    {win.nodeName} ({win.type.charAt(0).toUpperCase() + win.type.slice(1)})
                  </Box>
                  <ActionIcon
                    size="xs"
                    variant="subtle"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeWindow(win.id);
                    }}
                  >
                    <X size={12} />
                  </ActionIcon>
                </Group>
              </Paper>
            ))}
          </Box>

        </AppShell.Main>
      </AppShell>
    </MantineProvider >
  );
}
