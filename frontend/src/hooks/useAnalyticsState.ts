import { useState, useCallback, useEffect } from 'react';
import { type GlobalConfig } from '../features/analytics/components/GlobalSettingsModal';
import { fetchConfigOverrides } from '../shared/api';

export const SETTINGS_KEY = 'analysis_settings';

export const DEFAULT_CONFIG: GlobalConfig = {
  defaultDuration: '1M',
  customDays: 30,
  endDateType: 'now',
  fixedEndDate: new Date().toISOString(),
  layoutMode: 'floating',
  analyticsGridColumns: 2,
  showAnalyticsSidebar: false, // Turned off by default as requested
  sidebarWidth: 400
};

export interface AnalysisType {
  consumption: 'consumption';
  voltage: 'voltage';
  diagnostic: 'diagnostic';
}

export interface AnalysisInstance {
  id: string;
  type: keyof AnalysisType;
  nodeIds: string[];
  nodeName: string;
  isOpen: boolean;
  isMinimized: boolean;
  loading: boolean;
  data: any[];
  estimatedRows?: number;
  assetType?: 'Node' | 'Edge';
  degrees?: number | null;
  scatterData?: any[];
  timeSeriesData?: any[];
  isPaused?: boolean;
  pendingRequest?: { nodeIds: string[], start: string, end: string, degrees?: number | null };
  zIndex?: number;
}

export function useAnalyticsState() {
  const [analysisWindows, setAnalysisWindows] = useState<AnalysisInstance[]>([]);
  const [pinnedWindowIds, setPinnedWindowIds] = useState<string[]>([]);
  const [maxZIndex, setMaxZIndex] = useState(1000);
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [systemConfig, setSystemConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchConfigOverrides()
      .then(configs => {
        const configMap = configs.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {} as Record<string, string>);
        setSystemConfig(configMap);
      })
      .catch(err => console.error('Failed to fetch system config overrides', err));
  }, []);

  const [globalConfig, setGlobalConfig] = useState<GlobalConfig>(() => {
    const saved = localStorage.getItem('globalConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_CONFIG, ...parsed };
      } catch (e) {
        console.error('Failed to parse saved globalConfig', e);
      }
    }
    return DEFAULT_CONFIG;
  });

  useEffect(() => {
    localStorage.setItem('globalConfig', JSON.stringify(globalConfig));
  }, [globalConfig]);

  const updateWindow = useCallback((id: string, updates: Partial<AnalysisInstance>) => {
    setAnalysisWindows(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
  }, []);

  const removeWindow = useCallback((id: string) => {
    setAnalysisWindows(prev => prev.filter(w => w.id !== id));
    setPinnedWindowIds(prev => prev.filter(pid => pid !== id));
  }, []);

  const togglePin = useCallback((id: string) => {
    setPinnedWindowIds(prev => {
      const isPinned = prev.includes(id);
      if (isPinned) {
        return prev.filter(pid => pid !== id);
      } else {
        // Auto-show sidebar when pinning
        setGlobalConfig(cfg => ({ ...cfg, showAnalyticsSidebar: true }));
        return [...prev, id];
      }
    });
  }, []);

  const bringWindowToFront = useCallback((id: string) => {
    setMaxZIndex(prev => {
      const newZ = prev + 1;
      setAnalysisWindows(current => current.map(w =>
        w.id === id ? { ...w, zIndex: newZ } : w
      ));
      return newZ;
    });
  }, []);

  return {
    analysisWindows,
    setAnalysisWindows,
    pinnedWindowIds,
    setPinnedWindowIds,
    maxZIndex,
    setMaxZIndex,
    sidebarWidth,
    setSidebarWidth,
    globalConfig,
    setGlobalConfig,
    updateWindow,
    removeWindow,
    togglePin,
    bringWindowToFront,
    systemConfig
  };
}
