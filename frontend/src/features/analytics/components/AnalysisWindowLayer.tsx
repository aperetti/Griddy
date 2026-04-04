import React, { useCallback, useMemo } from 'react';
import { DiagnosticModal } from './DiagnosticModal';
import { type AnalysisInstance } from '../../../hooks/useAnalyticsState';
import type { PluginDefinition } from '../../../plugins';

interface AnalysisWindowLayerProps {
  windows: AnalysisInstance[];
  pluginRegistry: Map<string, PluginDefinition>;
  onClose: (id: string) => void;
  onUpdateWindow: (id: string, updates: Partial<AnalysisInstance>) => void;
  onMinimize: (id: string) => void;
  onSetNodeAverages?: (averages: Record<string, number> | null) => void;
  onSetEdgeAverages?: (averages: Record<string, number> | null) => void;
  onSetVoltageScale?: (scale: any) => void;
  onSelectAndNavigateToNode?: (id: string | string[]) => void;
}

/**
 * Wrapper component to provide stable callbacks for each plugin window instance.
 * This prevents the 'Maximum update depth exceeded' error caused by 
 * anonymous functions being re-created on every render.
 */
const PluginWindowWrapper = React.memo(({ 
  win, 
  pluginDef, 
  onClose, 
  onMinimize, 
  onUpdateWindow,
  onSetNodeAverages,
  onSetEdgeAverages,
  onSetVoltageScale,
  onSelectAndNavigateToNode
}: { 
  win: AnalysisInstance; 
  pluginDef: PluginDefinition;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onUpdateWindow: (id: string, updates: Partial<AnalysisInstance>) => void;
  onSetNodeAverages?: (averages: Record<string, number> | null) => void;
  onSetEdgeAverages?: (averages: Record<string, number> | null) => void;
  onSetVoltageScale?: (scale: any) => void;
  onSelectAndNavigateToNode?: (id: string | string[]) => void;
}) => {
  const handleClose = useCallback(() => onClose(win.id), [onClose, win.id]);
  const handleMinimize = useCallback(() => onMinimize(win.id), [onMinimize, win.id]);
  const updateWindow = useCallback((updates: Partial<AnalysisInstance>) => onUpdateWindow(win.id, updates), [onUpdateWindow, win.id]);

  const callbacks = useMemo(() => ({
    onClose: handleClose,
    onMinimize: handleMinimize,
    updateWindow,
    setNodeAverages: onSetNodeAverages || (() => {}),
    setEdgeAverages: onSetEdgeAverages || (() => {}),
    setVoltageScale: onSetVoltageScale || (() => {}),
    selectAndNavigateToNode: onSelectAndNavigateToNode,
  }), [handleClose, handleMinimize, updateWindow, onSetNodeAverages, onSetEdgeAverages, onSetVoltageScale, onSelectAndNavigateToNode]);

  return <>{pluginDef.renderWindow(win, callbacks)}</>;
});

export function AnalysisWindowLayer({
  windows,
  pluginRegistry,
  onClose,
  onUpdateWindow,
  onMinimize,
  onSetNodeAverages,
  onSetEdgeAverages,
  onSetVoltageScale,
  onSelectAndNavigateToNode,
}: AnalysisWindowLayerProps) {
  return (
    <>
      {windows.map(win => {
        if (win.type === 'diagnostic') {
          return (
            <DiagnosticModal
              key={win.id}
              isOpen={win.isOpen}
              onClose={() => onClose(win.id)}
              zIndex={win.zIndex || 0}
              id={win.nodeIds?.[0] || ''}
              type="Node"
              title={win.nodeName || 'Diagnostic'}
              onMinimize={() => onMinimize(win.id)}
              isMinimized={win.isMinimized}
            />
          );
        }
        const pluginDef = pluginRegistry.get(win.type);
        if (pluginDef) {
          return (
            <PluginWindowWrapper
              key={win.id}
              win={win}
              pluginDef={pluginDef}
              onClose={onClose}
              onMinimize={onMinimize}
              onUpdateWindow={onUpdateWindow}
              onSetNodeAverages={onSetNodeAverages}
              onSetEdgeAverages={onSetEdgeAverages}
              onSetVoltageScale={onSetVoltageScale}
              onSelectAndNavigateToNode={onSelectAndNavigateToNode}
            />
          );
        }
        return null;
      })}
    </>
  );
}
