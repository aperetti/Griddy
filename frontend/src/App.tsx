import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  MantineProvider,
  Box,
  Loader,
  Text,
  Group,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

import { GridMap } from './features/grid/components/GridMap';
import { Minimap } from './features/grid/components/Minimap';
import { VoltageScalePanel } from './features/analytics/components/VoltageScalePanel';

import { GlobalSettingsModal } from './features/analytics/components/GlobalSettingsModal';
import { DisplayRulesManager } from './features/grid/components/DisplayRulesManager';
import { OverlayControls } from './features/ui/OverlayControls';
import { SystemSidebar } from './features/ui/SystemSidebar';
import { AnalysisWindowLayer } from './features/analytics/components/AnalysisWindowLayer';
import { AnalysisToolbar } from './features/grid/components/AnalysisToolbar';
import { AnalysisTray } from './features/analytics/components/AnalysisTray';
import { SchemaProvider } from './features/grid/context/SchemaContext';

import { useTopology } from './hooks/useTopology';
import { useRuleClassification } from './features/grid/hooks/useRuleClassification';
import { useAnalyticsState, SETTINGS_KEY } from './hooks/useAnalyticsState';
import { fetchTopology, fetchModels, fetchPluginRegistry, resolveNodeModel, loadModel } from './shared/api';
import type { Node, Edge } from './shared/types';
import { initPluginRegistry } from './plugins';
import type { PluginDefinition, PluginExecutionContext } from './plugins/types';

const calculateRange = (config: any) => {
  const end = config.endDateType === 'now' ? new Date() : new Date(config.fixedEndDate);
  const start = new Date(end.getTime());
  const duration = config.defaultDuration || '1M';

  if (duration === '1D') start.setDate(end.getDate() - 1);
  else if (duration === '1W') start.setDate(end.getDate() - 7);
  else if (duration === '1M') start.setMonth(end.getMonth() - 1);
  else if (duration === '3M') start.setMonth(end.getMonth() - 3);
  else if (config.customDays) start.setDate(end.getDate() - config.customDays);
  else start.setDate(end.getDate() - 30); // Robust fallback

  return {
    start: start.toISOString().split('.')[0],
    end: end.toISOString().split('.')[0]
  };
};

export default function App() {
  const isMobile = useMediaQuery('(max-width: 768px)');
  // Local UI State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayRulesOpen, setDisplayRulesOpen] = useState(false);
  const [displayRulesZIndex, setDisplayRulesZIndex] = useState(1005);
  const [voltageScale, setVoltageScale] = useState(() => {
    const saved = localStorage.getItem('voltageScale');
    return saved ? JSON.parse(saved) : {
      criticalHigh: 1.1,
      highWarning: 1.06,
      lowWarning: 0.94,
      criticalLow: 0.9,
      baseVoltage: 230.0,
    };
  });
  const [viewState, setViewState] = useState<any>(null);
  const [targetLocation, setTargetLocation] = useState<{ longitude: number, latitude: number, zoom?: number } | null>(null);

  // Hooks
  const topology = useTopology();
  const [spriteVersion, setSpriteVersion] = useState(0);
  const { classifiedNodes, classifiedEdges, refresh: refreshRules, loading: rulesLoading } = useRuleClassification(
    topology.nodes,
    topology.edges,
  );
  const analytics = useAnalyticsState();
  const activeWindows = useMemo(() => 
    analytics.analysisWindows.filter(win => win.isOpen && !win.isMinimized),
    [analytics.analysisWindows]
  );

  const [dateRange, setDateRange] = useState(() => calculateRange(analytics.globalConfig));
  
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

  useEffect(() => {
    if (analytics.globalConfig.endDateType === 'now') {
      setDateRange(calculateRange(analytics.globalConfig));
    }
  }, [analytics.globalConfig]);

  const [pluginRegistry, setPluginRegistry] = useState<Map<string, PluginDefinition>>(new Map());
  const enabledPluginNamesRef = useRef<string>('');
  useEffect(() => {
    const syncRegistry = () => {
      fetchPluginRegistry()
        .then(entries => {
          const enabled = entries.filter(e => e.enabled).map(e => e.name).sort();
          const key = enabled.join(',');
          if (key === enabledPluginNamesRef.current) return;
          enabledPluginNamesRef.current = key;
          return initPluginRegistry(enabled).then(setPluginRegistry);
        })
        .catch(err => console.error('[plugins] Failed to initialize plugin registry:', err));
    };
    syncRegistry();
    const interval = setInterval(syncRegistry, 10_000);
    return () => clearInterval(interval);
  }, []);

  const [fitTrigger, setFitTrigger] = useState(0);

  const selectedNodes = topology.nodes.filter(n => topology.highlightedNodes.has(n.id));
  const selectedEdgeIds = Array.from(topology.highlightedEdges);
  const allPlugins = Array.from(pluginRegistry.values());
  const applicablePlugins = allPlugins.filter(
    p => p.appliesToNodes(selectedNodes, topology.highlightedEdges.size)
  );

  const selectAndNavigateToNode = useCallback(async (targetId: string | string[]) => {
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
        topology.setHighlightedEdges(new Set());
        setTargetLocation({ longitude: node.position[0], latitude: node.position[1], zoom: 18 });
        return;
      }

      // 2. Try finding as an Edge (e.g. PowerTransformer edge)
      const edge = topology.edges.find(e => e.id === id || e.name === id || `${e.source}-${e.target}` === id);
      if (edge) {
        topology.setHighlightedNodes(new Set());
        topology.setHighlightedEdges(new Set([edge.id || `${edge.source}-${edge.target}`]));
        
        // Center on edge midpoint
        const midLon = (edge.sourcePosition[0] + edge.targetPosition[0]) / 2;
        const midLat = (edge.sourcePosition[1] + edge.targetPosition[1]) / 2;
        setTargetLocation({ longitude: midLon, latitude: midLat, zoom: 18 });
        return;
      }

      // 3. Not found in currently loaded models - try to resolve and load
      try {
        const res = await resolveNodeModel(id);
        const actualId = res.mrid || res.name || id;
        const feeder_id = res.feeder_id;
        
        pendingNavigationRef.current = { id: actualId, zoom: 18 };
        
        if (!topology.activeModelIds.includes(feeder_id)) {
          topology.setActiveModelIds(prev => [...new Set([...prev, feeder_id])]);
        } else {
          // Trigger the effect to check again, as it might have just finished loading
          setNavTrigger(prev => prev + 1);
        }
      } catch (err) {
        console.error('[App] Failed to resolve target for navigation:', err);
      }
    } else if (ids.length > 1) {
      topology.setHighlightedNodes(new Set(ids));
      topology.setHighlightedEdges(new Set());
      setFitTrigger(prev => prev + 1);
      setTargetLocation(null);
    }
  }, [topology.nodes, topology.edges, topology.activeModelIds]);

  const pluginCtx: PluginExecutionContext = {
    selectedNodes,
    selectedEdgeIds,
    resolveEdgeNodesToNodeIds: (edgeIds: string[]) =>
      Array.from(new Set(
        edgeIds.map(eid =>
          topology.edges.find(e => e.id === eid || `${e.source}-${e.target}` === eid)?.target
        ).filter(Boolean) as string[]
      )),
    setAnalysisWindows: analytics.setAnalysisWindows,
    bringWindowToFront: analytics.bringWindowToFront,
    updateWindow: analytics.updateWindow,
    dateRange,
    systemConfig: analytics.systemConfig,
    addHighlightedNodes: (ids: string[]) => topology.setHighlightedNodes(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    }),
    addHighlightedEdges: (ids: string[]) => topology.setHighlightedEdges(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    }),
    setNodeAverages: (averages: Record<string, number> | null) => topology.setNodeAverages(averages),
    setEdgeAverages: (averages: Record<string, number> | null) => topology.setEdgeAverages(averages),
    setVoltageScale: setVoltageScale,
    selectAndNavigateToNode: selectAndNavigateToNode,
  };

  // Cleanup effect for heatmap averages when windows close
  useEffect(() => {
    const isHeatmapActive = analytics.analysisWindows.some(w => 
      (w.type === 'voltage' || w.type === 'voltage_heatmap') && w.isOpen
    );
    if (!isHeatmapActive) {
      if (topology.nodeAverages !== null) topology.setNodeAverages(null);
      if (topology.edgeAverages !== null) topology.setEdgeAverages(null);
    }
  }, [analytics.analysisWindows, topology.nodeAverages, topology.edgeAverages]);

  const bringDisplayRulesToFront = useCallback(() => {
    setDisplayRulesZIndex(analytics.getNextZIndex());
  }, [analytics]);

  const lastActiveModelIds = useRef<string[]>([]);

  // Initial Load & Topology Refresh
  useEffect(() => {
    const load = async () => {
      // Initialize with a single model if nothing is active
      if (topology.activeModelIds.length === 0) {
        try {
          const models = await fetchModels();
          if (models.length > 0) {
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
          // We load them individually so one failure doesn't block the refresh
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
            // Ensure new models are loaded in backend memory first
            // We track which ones actually succeeded to avoid fetching empty data
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

  const onNodeClick = useCallback((node: Node, multi: boolean) => {
    const isMulti = multi || !!isMobile;
    topology.setHighlightedNodes(prev => {
      const next = new Set(isMulti ? Array.from(prev) : []);
      next.add(node.id);
      return next;
    });

    setTargetLocation(null);
  }, [topology, isMobile]);

  const onEdgeClick = useCallback((edge: Edge, multi: boolean) => {
    const isMulti = multi || !!isMobile;
    topology.setHighlightedEdges(prev => {
      const next = new Set(isMulti ? Array.from(prev) : []);
      next.add(edge.id || `${edge.source}-${edge.target}`);
      return next;
    });

    setTargetLocation(null);
  }, [topology, isMobile]);

  return (
    <MantineProvider defaultColorScheme="dark">
      <SchemaProvider>
        <GlobalSettingsModal
        opened={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={analytics.globalConfig}
        onSave={(newConfig) => {
          analytics.setGlobalConfig(newConfig);
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(newConfig));
        }}
      />

      <DisplayRulesManager
        opened={displayRulesOpen}
        onClose={() => setDisplayRulesOpen(false)}
        onFocus={bringDisplayRulesToFront}
        zIndex={displayRulesZIndex}
        onRulesChanged={() => { refreshRules(); setSpriteVersion(v => v + 1); }}
      />

      <Box style={{ height: '100vh', width: '100vw', background: '#101113', overflow: 'hidden', display: 'flex' }}>
        {/* Map Container */}
        <Box style={{ flex: 1, position: 'relative', height: '100%', zIndex: 0 }}>
          <GridMap
            nodes={classifiedNodes}
            edges={classifiedEdges}
            onNodeClick={(node, multiSelect) => onNodeClick(node, multiSelect)}
            onEdgeClick={(edge, multiSelect) => onEdgeClick(edge, multiSelect)}
            highlightedNodes={topology.highlightedNodes}
            highlightedEdges={topology.highlightedEdges}
            nodeAverages={topology.nodeAverages}
            edgeAverages={topology.edgeAverages}
            nodeCurrents={topology.nodeCurrents}
            onMapClick={topology.handleClearSelection}
            voltageScale={voltageScale}
            onViewStateChange={setViewState}
            goToLocation={targetLocation}
            fitHighlightedNodesTrigger={fitTrigger}
            spriteVersion={spriteVersion}
          />

          {!isMobile && (
            <Minimap
              nodes={topology.nodes}
              edges={topology.edges}
              viewState={viewState}
              onNavigate={(lon, lat) => setTargetLocation({ longitude: lon, latitude: lat })}
              selectedNodeIds={Array.from(topology.highlightedNodes)}
            />
          )}

          <VoltageScalePanel
            voltageScale={voltageScale}
            setVoltageScale={setVoltageScale}
            visible={analytics.analysisWindows.some(w => 
              (w.type === 'voltage' || w.type === 'voltage_heatmap') && w.isOpen
            )}
          />

          {rulesLoading && (
            <Box style={{
              position: 'absolute',
              bottom: 24,
              right: 16,
              zIndex: 1000,
              pointerEvents: 'none',
            }}>
              <Group
                gap="xs"
                style={{
                  background: 'rgba(0,0,0,0.7)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '6px 12px',
                  backdropFilter: 'blur(4px)',
                }}
              >
                <Loader size={12} color="blue" />
                <Text size="xs" c="dimmed">Applying rules…</Text>
              </Group>
            </Box>
          )}

          <OverlayControls
            activeModelIds={topology.activeModelIds}
            setActiveModelIds={topology.setActiveModelIds}
            onSearchSelect={onNodeClick}
            onSettingsClick={() => setSettingsOpen(true)}
            onDisplayRulesClick={() => setDisplayRulesOpen(true)}
            onRefreshTopology={topology.refreshTopology}
            onClearSelection={topology.handleClearSelection}
            isMobile={isMobile}
            plugins={allPlugins}
            onRunPlugin={(plugin: PluginDefinition) => plugin.handleRun(pluginCtx)}
            loading={topology.topologyLoading}
          />
          <SystemSidebar
            plugins={allPlugins}
            onRunPlugin={(plugin: PluginDefinition) => plugin.handleRun(pluginCtx)}
          />
          {/* Selection HUD - positioned under search */}
          <Box style={{
            position: 'absolute',
            top: isMobile ? 85 : 75, // Closer to menu but not overlapping
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            pointerEvents: 'none',
            maxWidth: 'calc(100vw - 20px)'
          }}>
            <AnalysisToolbar
              selectedNodes={selectedNodes}
              selectedEdgeCount={topology.highlightedEdges.size}
              onClearSelection={topology.handleClearSelection}
              onViewDiagnostic={(node) => {
                analytics.setAnalysisWindows(prev => [...prev, {
                  id: `diag-${Date.now()}`,
                  type: 'diagnostic',
                  nodeIds: [node.id],
                  nodeName: node.name || 'Diagnostic',
                  isOpen: true,
                  isMinimized: false,
                  loading: false,
                  data: [],
                  zIndex: 1000
                }]);
              }}
              visible={topology.highlightedNodes.size > 0 || topology.highlightedEdges.size > 0}
              dateRange={dateRange}
              configLabel="Global Profile"
              onOpenSettings={() => setSettingsOpen(true)}
              plugins={applicablePlugins}
              onRunPlugin={(plugin: PluginDefinition) => plugin.handleRun(pluginCtx)}
            />
          </Box>

          <AnalysisTray 
            minimizedWindows={analytics.analysisWindows.filter(w => w.isOpen && w.isMinimized)}
            onRestore={(id) => {
              analytics.updateWindow(id, { isMinimized: false });
              analytics.bringWindowToFront(id);
            }}
            onClose={analytics.removeWindow}
          />
        </Box>

      </Box>

      {/* Analysis windows in a fixed viewport-covering layer so react-rnd
          transforms are relative to (0,0) of the viewport, not the document
          flow position of a body-appended portal. */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 5000 }}>
        <AnalysisWindowLayer
          windows={activeWindows}
          pluginRegistry={pluginRegistry}
          onClose={analytics.removeWindow}
          onUpdateWindow={analytics.updateWindow}
          onMinimize={analytics.toggleMinimize}
          onSetNodeAverages={topology.setNodeAverages}
          onSetEdgeAverages={topology.setEdgeAverages}
          onSetVoltageScale={setVoltageScale}
          onSelectAndNavigateToNode={selectAndNavigateToNode}
        />
      </div>
      </SchemaProvider>
    </MantineProvider>
  );
}
