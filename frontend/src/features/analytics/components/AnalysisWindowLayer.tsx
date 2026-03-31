import { DiagnosticModal } from './DiagnosticModal';
import { type AnalysisInstance } from '../../../hooks/useAnalyticsState';
import { pluginRegistry } from '../../../plugins';

interface AnalysisWindowLayerProps {
  windows: AnalysisInstance[];
  onClose: (id: string) => void;
  onUpdateWindow: (id: string, updates: Partial<AnalysisInstance>) => void;
  onMinimize: (id: string) => void;
}

export function AnalysisWindowLayer({
  windows,
  onClose,
  onUpdateWindow,
  onMinimize,
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
            <span key={win.id}>
              {pluginDef.renderWindow(win, {
                onClose: () => onClose(win.id),
                onMinimize: () => onMinimize(win.id),
                updateWindow: (updates) => onUpdateWindow(win.id, updates),
              })}
            </span>
          );
        }
        return null;
      }).filter(Boolean)}
    </>
  );
}
