import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { AnalysisWindowLayer } from './shared/components/AnalysisWindowLayer';
import { AnalysisToolbar } from './features/grid/components/AnalysisToolbar';
import { AnalysisTray } from './features/analytics/components/AnalysisTray';
import { SchemaProvider } from './features/grid/context/SchemaContext';

import { useTopology } from './hooks/useTopology';
import { useTopologyLoader } from './hooks/useTopologyLoader';
import { useNavigation } from './hooks/useNavigation';
import { usePluginRegistry, usePluginContext } from './hooks/usePluginContext';
import { useRuleClassification } from './features/grid/hooks/useRuleClassification';
import { useAnalyticsState, SETTINGS_KEY } from './hooks/useAnalyticsState';
import type { Node, Edge } from './shared/types';
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
    return saved ? JSON.parse(saved) : {
      criticalHigh: 1.1,
      highWarning: 1.06,
      lowWarning: 0.94,
      criticalLow: 0.9,
      baseVoltage: 230.0,
    };
  });
  const [viewState, setViewState] = useState<any>(null);

  // Core state hooks
  const topology = useTopology();
  const [spriteVersion, setSpriteVersion] = useState(0);
  const [edgeColorBase, setEdgeColorBase] = useState<'circuit' | 'model'>('circuit');

  // Extracted hooks (Phases 1A/1B)
  useTopologyLoader(topology);
  const pluginRegistry = usePluginRegistry();
  const navigation = useNavigation(topology);

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

  useEffect(() => {
    setDateRange(calculateRange(analytics.globalConfig));
  }, [analytics.globalConfig]);

  const selectedNodes = topology.nodes.filter(n => topology.highlightedNodes.has(n.id));
  const selectedEdgeIds = Array.from(topology.highlightedEdges);
  const allPlugins = Array.from(pluginRegistry.values());
  const applicablePlugins = allPlugins.filter(
    p => p.appliesToNodes(selectedNodes, topology.highlightedEdges.size)
  );

  const pluginCtx = usePluginContext({
    selectedNodes,
    selectedEdgeIds,
    edges: topology.edges,
    setAnalysisWindows: analytics.setAnalysisWindows,
    bringWindowToFront: analytics.bringWindowToFront,
    updateWindow: analytics.updateWindow,
    dateRange,
    systemConfig: analytics.systemConfig,
    setHighlightedNodes: topology.setHighlightedNodes,
    setHighlightedEdges: topology.setHighlightedEdges,
    setNodeAverages: topology.setNodeAverages,
    setEdgeAverages: topology.setEdgeAverages,
    setVoltageScale,
    selectAndNavigateToNode: navigation.selectAndNavigateToNode,
  });

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

  const onNodeClick = useCallback((node: Node, multi: boolean) => {
    const isMulti = multi || !!isMobile;
    topology.setHighlightedNodes(prev => {
      const next = new Set(isMulti ? Array.from(prev) : []);
      next.add(node.id);
      return next;
    });

    navigation.setTargetLocation(null);
  }, [topology, isMobile, navigation]);

  const onEdgeClick = useCallback((edge: Edge, multi: boolean) => {
    const isMulti = multi || !!isMobile;
    topology.setHighlightedEdges(prev => {
      const next = new Set(isMulti ? Array.from(prev) : []);
      next.add(edge.id || `${edge.source}-${edge.target}`);
      return next;
    });

    navigation.setTargetLocation(null);
  }, [topology, isMobile, navigation]);

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
            selectedNodeIds={Array.from(topology.highlightedNodes)}
            nodeAverages={topology.nodeAverages}
            edgeAverages={topology.edgeAverages}
            nodeCurrents={topology.nodeCurrents}
            onMapClick={topology.handleClearSelection}
            voltageScale={voltageScale}
            onViewStateChange={setViewState}
            goToLocation={navigation.targetLocation}
            fitHighlightedNodesTrigger={navigation.fitTrigger}
            spriteVersion={spriteVersion}
            edgeColorBase={edgeColorBase}
          />

          {!isMobile && (
            <Minimap
              nodes={topology.nodes}
              edges={topology.edges}
              viewState={viewState}
              onNavigate={(lon, lat) => navigation.setTargetLocation({ longitude: lon, latitude: lat })}
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
            onSearchSelect={(node) => navigation.selectAndNavigateToNode(node.id, node.model_id)}
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
              edgeColorBase={edgeColorBase}
              onEdgeColorBaseChange={setEdgeColorBase}
            />
          </Box>

          <AnalysisTray 
            minimizedWindows={analytics.analysisWindows.filter(w => w.isOpen && w.isMinimized)}
            onRestore={(id) => {
              analytics.updateWindow(id, { isMinimized: false });
              analytics.bringWindowToFront(id);
            }}
            onClose={analytics.removeWindow}
            pluginRegistry={pluginRegistry}
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
          onFocus={analytics.bringWindowToFront}
          onSelectAndNavigateToNode={navigation.selectAndNavigateToNode}
        />
      </div>
      </SchemaProvider>
    </MantineProvider>
  );
}
