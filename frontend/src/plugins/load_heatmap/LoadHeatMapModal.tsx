import React from 'react';
import { Button, Text, Stack, Alert, LoadingOverlay, Box, Group, Badge, Paper } from '@mantine/core';
import { AlertCircle, Zap, CheckCircle2, Activity } from 'lucide-react';
import { AnalysisWindow } from '@plugin-sdk';

export interface LoadHeatMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize: () => void;
  loading: boolean;
  data: any;
  estimatedRows: number;
  nodeName: string;
  isMinimized: boolean;
  isPaused: boolean;
  zIndex: number;
  onConfirm: () => void;
  onFocus?: () => void;
  startTime?: string;
  endTime?: string;
}

export const LoadHeatMapModal: React.FC<LoadHeatMapModalProps> = ({
  isOpen,
  onClose,
  onMinimize,
  loading,
  data,
  estimatedRows,
  nodeName,
  isMinimized,
  isPaused,
  zIndex,
  onConfirm,
  onFocus,
  startTime,
  endTime,
}) => {
  const periodStart = data?.start_time || startTime;
  const periodEnd = data?.end_time || endTime;

  const formatDate = (iso?: string) => {
    if (!iso) return 'N/A';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch { return iso; }
  };

  return (
    <AnalysisWindow
      title={`Network Load: ${nodeName}`}
      isOpen={isOpen}
      isMinimized={isMinimized}
      onClose={onClose}
      onMinimize={onMinimize}
      onFocus={onFocus}
      zIndex={zIndex}
      storageKey="load_heatmap_window"
    >
      <Box p="md" pos="relative" style={{ height: '100%', minHeight: isMinimized ? 0 : 320, display: 'flex', flexDirection: 'column' }}>
        <LoadingOverlay 
          visible={loading} 
          zIndex={1001} 
          overlayProps={{ blur: 1, color: 'rgba(0,0,0,0.4)', opacity: 0.6 }} 
          loaderProps={{ color: 'blue', size: 'md' }}
        />

        {isPaused ? (
          <Stack gap="md" py="xl">
            <Alert
              icon={<AlertCircle size={18} />}
              title="Large Data Set"
              color="blue"
              variant="light"
            >
              <Text size="sm">
                This heatmap will process approximately{' '}
                <Text component="span" fw={700}>{estimatedRows.toLocaleString()}</Text> rows of edge load data.
                This may take a few moments to aggregate and render across the map.
              </Text>
            </Alert>
            <Button
              onClick={onConfirm}
              variant="filled"
              color="blue"
              size="md"
              fullWidth
              leftSection={<Zap size={16} />}
            >
              Process and Visualize
            </Button>
          </Stack>
        ) : data ? (
          <Stack gap="md">
            <Paper withBorder p="sm" bg="rgba(255,255,255,0.03)" style={{ borderStyle: 'dashed' }}>
              <Group justify="space-between" mb="xs">
                <Text size="xs" c="dimmed" tt="uppercase" lts="1px" fw={700}>
                  Active Layer
                </Text>
                <Badge color="green" variant="filled" size="sm" radius="xs" leftSection={<CheckCircle2 size={12} />}>
                  Live Map
                </Badge>
              </Group>

              <Stack gap={4}>
                <Text size="sm" fw={600}>
                  Network Analysis Complete
                </Text>
                <Text size="xs" c="dimmed">
                  Processed {data.edge_count || '0'} branches for {nodeName}. Heatmap weights applied to map geometry.
                </Text>
              </Stack>
            </Paper>

            {data?.warning && (
              <Alert icon={<AlertCircle size={14} />} title="Calculation Note" color="orange" variant="light">
                {data.warning}
              </Alert>
            )}

            <Alert color="indigo" variant="light" py="xs" icon={<Activity size={14} />}>
              <Stack gap={4}>
                <Text size="xs">
                  Color scale: <Text component="span" c="green" fw={700}>Green (Low)</Text> → <Text component="span" c="orange" fw={700}>Yellow</Text> → <Text component="span" c="red" fw={700}>Red (High)</Text>
                </Text>
                <Text size="xs" c="dimmed">
                  Period: <Text component="span" fw={600} c="indigo">{formatDate(periodStart)}</Text> to <Text component="span" fw={600} c="indigo">{formatDate(periodEnd)}</Text>
                </Text>
              </Stack>
            </Alert>

            <Button
              variant="outline"
              color="indigo"
              onClick={onConfirm}
              size="xs"
              mt="xs"
              leftSection={<Zap size={14} />}
            >
              Refresh Load Statistics
            </Button>
          </Stack>
        ) : (
          <Stack justify="center" align="center" style={{ flex: 1 }} py="xl">
            <Box style={{ opacity: 0.3 }}>
              <Activity size={48} />
            </Box>
            <Text size="sm" c="dimmed" fs="italic">
              {loading ? 'Crunching numbers...' : 'Initialize Analysis to begin heatmap generation.'}
            </Text>
            {!loading && (
              <Button size="xs" variant="subtle" onClick={onConfirm} color="blue">
                Force Initialize
              </Button>
            )}
          </Stack>
        )}
      </Box>
    </AnalysisWindow>
  );
};
