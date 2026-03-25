import { ConsumptionTimeSeriesModal } from './ConsumptionTimeSeriesModal';
import { VoltageDistributionModal } from './VoltageDistributionModal';
import { type AnalysisInstance } from '../../../hooks/useAnalyticsState';

interface AnalysisWindowLayerProps {
  windows: AnalysisInstance[];
  onClose: (id: string) => void;
  onPin: (id: string) => void;
  onConfirmConsumption: (win: AnalysisInstance) => void;
  onConfirmVoltage: (win: AnalysisInstance) => void;
  onShowVoltageDistribution: (nodeIds: string[], nodeName: string, degrees?: number) => void;
  pinnedIds: string[];
  isPinnedList?: boolean;
}

export function AnalysisWindowLayer({
  windows,
  onClose,
  onPin,
  onConfirmConsumption,
  onConfirmVoltage,
  onShowVoltageDistribution,
  pinnedIds,
  isPinnedList = false
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
              layoutMode={isPinnedList ? 'grid' : 'floating'}
              isPinned={pinnedIds.includes(win.id)}
              onPin={() => onPin(win.id)}
              isPaused={win.isPaused ?? false}
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
              layoutMode={isPinnedList ? 'grid' : 'floating'}
              isPinned={pinnedIds.includes(win.id)}
              onPin={() => onPin(win.id)}
              isPaused={win.isPaused ?? false}
              onConfirm={() => onConfirmVoltage(win)}
            />
          );
        }
        return null;
      }).filter(Boolean)}
    </>
  );
}
