import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { useState, useEffect, useCallback, useRef } from 'react';
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
import { AnalysisWindowLayer } from './features/analytics/components/AnalysisWindowLayer';
import { AnalysisToolbar } from './features/grid/components/AnalysisToolbar';
import { AnalysisTray } from './features/analytics/components/AnalysisTray';

import { useTopology } from './hooks/useTopology';
import { useRuleClassification } from './features/grid/hooks/useRuleClassification';
import { useAnalyticsState, SETTINGS_KEY } from './hooks/useAnalyticsState';
import { fetchTopology, fetchModels } from './shared/api';
import type { Node, Edge } from './shared/types';
import { pluginRegistry } from './plugins';
import type { PluginDefinition } from './plugins/types';

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
    return saved ? JSON.parse(saved) : { min: 0.9, max: 1.1, low: 0.95, high: 1.05 };
  });
  const [viewState, setViewState] = useState<any>(null);
  const [targetLocation, setTargetLocation] = useState<{ longitude: number; latitude: number } | null>(null);

  // Hooks
  const topology = useTopology();
  const [spriteVersion, setSpriteVersion] = useState(0);
  const { classifiedNodes, classifiedEdges, refresh: refreshRules, loading: rulesLoading } = useRuleClassification(
    topology.nodes,
    topology.edges,
  );
  const analytics = useAnalyticsState();

  const [dateRange, setDateRange] = useState(() => calculateRange(analytics.globalConfig));
  useEffect(() => {
    if (analytics.globalConfig.endDateType === 'now') {
      setDateRange(calculateRange(analytics.globalConfig));
    }
  }, [analytics.globalConfig]);

  const selectedNodes = topology.nodes.filter(n => topology.highlightedNodes.has(n.id));
  const selectedEdgeIds = Array.from(topology.highlightedEdges);
  const applicablePlugins = Array.from(pluginRegistry.values()).filter(
    p => p.appliesToNodes(selectedNodes, topology.highlightedEdges.size)
  );

  const pluginCtx = {
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
  };

  const bringDisplayRulesToFront = useCallback(() => {
    analytics.setMaxZIndex(prev => {
      const newZ = prev + 1;
      setDisplayRulesZIndex(newZ);
      return newZ;
    });
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
        topology.setTopologyLoading(true);
        try {
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
            const data = await fetchTopology(added);
            topology.setNodes(nodes => [...nodes, ...data.nodes]);
            topology.setEdges(edges => [...edges, ...data.edges]);
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
            nodeCurrents={topology.nodeCurrents}
            onMapClick={topology.handleClearSelection}
            voltageScale={voltageScale}
            onViewStateChange={setViewState}
            goToLocation={targetLocation}
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
            visible={analytics.analysisWindows.some(w => w.type === 'voltage' && w.isOpen)}
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

          <AnalysisWindowLayer
            windows={analytics.analysisWindows.filter(win => win.isOpen && !win.isMinimized)}
            onClose={analytics.removeWindow}
            onUpdateWindow={analytics.updateWindow}
            onMinimize={analytics.toggleMinimize}
          />
          
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
    </MantineProvider>
  );
}
