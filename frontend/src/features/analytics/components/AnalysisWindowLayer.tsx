import { ConsumptionTimeSeriesModal } from './ConsumptionTimeSeriesModal';
import { VoltageDistributionModal } from './VoltageDistributionModal';
import { DiagnosticModal } from './DiagnosticModal';
import { type AnalysisInstance } from '../../../hooks/useAnalyticsState';

interface AnalysisWindowLayerProps {
  windows: AnalysisInstance[];
  onClose: (id: string) => void;
  onConfirmConsumption: (win: AnalysisInstance) => void;
  onConfirmVoltage: (win: AnalysisInstance) => void;
  onShowVoltageDistribution: (nodeIds: string[], nodeName: string, degrees?: number) => void;
  onMinimize: (id: string) => void;
}

export function AnalysisWindowLayer({
  windows,
  onClose,
  onConfirmConsumption,
  onConfirmVoltage,
  onShowVoltageDistribution,
  onMinimize,
}: AnalysisWindowLayerProps) {
  return (
    <>
      {windows.map(win => {
        if (win.type === 'consumption') {
          return (
            <ConsumptionTimeSeriesModal
              key={win.id}
              isOpen={win.isOpen}
              onClose={() => onClose(win.id)}
              zIndex={win.zIndex || 0}
              loading={win.loading}
              data={win.data}
              estimatedRows={win.estimatedRows}
              nodeName={win.nodeName}
              layoutMode="floating"
              onMinimize={() => onMinimize(win.id)}
              isMinimized={win.isMinimized}
              isPaused={win.isPaused}
              onConfirm={() => onConfirmConsumption(win)}
            />
          );
        }
        if (win.type === 'voltage') {
          return (
            <VoltageDistributionModal
              key={win.id}
              isOpen={win.isOpen}
              onClose={() => onClose(win.id)}
              zIndex={win.zIndex || 0}
              loading={win.loading}
              data={win.data}
              scatterData={win.scatterData || []}
              timeSeriesData={win.timeSeriesData || []}
              estimatedRows={win.estimatedRows}
              nodeName={win.nodeName}
              degrees={win.degrees ?? 5}
              onDegreesChange={(d: number | null) => {
                if (win.nodeIds && win.nodeName) {
                  onShowVoltageDistribution(win.nodeIds, win.nodeName, d ?? 5);
                }
              }}
              layoutMode="floating"
              onMinimize={() => onMinimize(win.id)}
              isMinimized={win.isMinimized}
              isPaused={win.isPaused}
              onConfirm={() => onConfirmVoltage(win)}
            />
          );
        }
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
        return null;
      }).filter(Boolean)}
    </>
  );
}
