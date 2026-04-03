import React from 'react';
import { Button, Text, Stack, Alert, LoadingOverlay, Box, Group, Badge } from '@mantine/core';
import { AlertCircle, Zap, CheckCircle2 } from 'lucide-react';
import { AnalysisWindow } from '../../features/analytics/components/AnalysisWindow';

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
}) => {
  return (
    <AnalysisWindow
      title={`Network Load: ${nodeName}`}
      isOpen={isOpen}
      isMinimized={isMinimized}
      onClose={onClose}
      onMinimize={onMinimize}
      zIndex={zIndex}
      storageKey="load_heatmap_window"
    >
      <Box p="md" pos="relative" style={{ minHeight: 120 }}>
        <LoadingOverlay visible={loading} zIndex={1001} />

        {isPaused ? (
          <Stack gap="md">
            <Alert
              icon={<AlertCircle size={18} />}
              title="Large Data Set"
              color="blue"
            >
              <Text size="sm">
                This heatmap will process approximately{' '}
                <strong>{estimatedRows.toLocaleString()}</strong> rows of edge load data.
                This may take a few moments to aggregate and render across the map.
              </Text>
            </Alert>
            <Button
              onClick={onConfirm}
              variant="light"
              color="blue"
              fullWidth
              leftSection={<Zap size={16} />}
            >
              Process and Visualize
            </Button>
          </Stack>
        ) : data ? (
          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="sm" c="dimmed">
                Status:
              </Text>
              <Badge color="green" variant="light" leftSection={<CheckCircle2 size={12} />}>
                Active on Map
              </Badge>
            </Group>

            <Text size="sm" fw={500}>
              Analysis Summary:
            </Text>
            <Text size="xs" c="dimmed">
              Calculated averages for {data.edge_count} network edges. The map line colors
              and widths have been updated to reflect the load intensity.
            </Text>

            <Alert color="indigo" variant="light" py="xs">
              <Text size="xs">
                Edges are colored from Green (Low) to Red (High) based on averaged load values.
                Line width also increases with load for better visibility.
              </Text>
            </Alert>

            <Button
              variant="outline"
              color="indigo"
              onClick={onConfirm} // Re-run
              size="xs"
              mt="xs"
            >
              Refresh Load Data
            </Button>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" fs="italic" ta="center" py="xl">
            {loading ? 'Crunching numbers...' : 'No edge load data loaded yet.'}
          </Text>
        )}
      </Box>
    </AnalysisWindow>
  );
};
