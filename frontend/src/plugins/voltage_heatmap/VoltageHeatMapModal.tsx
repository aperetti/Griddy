import React from 'react';
import { Button, Text, Stack, Alert, LoadingOverlay, Box, Group, Badge } from '@mantine/core';
import { AlertCircle, Map as MapIcon, CheckCircle2 } from 'lucide-react';
import { AnalysisWindow } from '@plugin-sdk';

export interface VoltageHeatMapModalProps {
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
}

export const VoltageHeatMapModal: React.FC<VoltageHeatMapModalProps> = ({
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
}) => {
  return (
    <AnalysisWindow
      title={`Voltage Heat Map: ${nodeName}`}
      isOpen={isOpen}
      isMinimized={isMinimized}
      onClose={onClose}
      onMinimize={onMinimize}
      onFocus={onFocus}
      zIndex={zIndex}
      storageKey="voltage_heatmap_window"
    >
      <Box p="md" pos="relative" style={{ minHeight: 120 }}>
        <LoadingOverlay visible={loading} zIndex={1001} />

        {isPaused ? (
          <Stack gap="md">
            <Alert
              icon={<AlertCircle size={18} />}
              title="Large Data Set"
              color="orange"
            >
              <Text size="sm">
                This heat map will process approximately{' '}
                <strong>{estimatedRows.toLocaleString()}</strong> rows of voltage data.
                This may take a few moments to aggregate and render across the map.
              </Text>
            </Alert>
            <Button
              onClick={onConfirm}
              variant="light"
              color="orange"
              fullWidth
              leftSection={<MapIcon size={16} />}
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
              Summary:
            </Text>
            <Text size="xs" c="dimmed">
              Calculated averages for {data.node_count} nodes. The map colors
              have been updated to reflect the voltage levels relative to the
              configured scale.
            </Text>

            <Alert color="blue" variant="light" py="xs">
              <Text size="xs">
                Use the Voltage Scale panel on the left to adjust thresholds
                and interpret the map coloring.
              </Text>
            </Alert>

            <Button
              variant="outline"
              color="blue"
              onClick={onConfirm} // Re-run
              size="xs"
              mt="xs"
            >
              Refresh Data
            </Button>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" fs="italic" ta="center" py="xl">
            {loading ? 'Crunching numbers...' : 'No data loaded yet.'}
          </Text>
        )}
      </Box>
    </AnalysisWindow>

  );
};
