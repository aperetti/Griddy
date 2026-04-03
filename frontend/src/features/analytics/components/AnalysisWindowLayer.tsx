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
  onSetVoltageScale?: (scale: any) => void;
}


export function AnalysisWindowLayer({
  windows,
  pluginRegistry,
  onClose,
  onUpdateWindow,
  onMinimize,
  onSetNodeAverages,
  onSetVoltageScale,
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
          return pluginDef.renderWindow(win, {
            onClose: () => onClose(win.id),
            onMinimize: () => onMinimize(win.id),
            updateWindow: (updates) => onUpdateWindow(win.id, updates),
            setNodeAverages: onSetNodeAverages,
            setVoltageScale: onSetVoltageScale,
          });

        }
        return null;
      })}
    </>
  );
}
