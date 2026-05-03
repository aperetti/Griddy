import { Stack, Title, Text, Tabs } from '@mantine/core';
import { Settings, BarChart3 } from 'lucide-react';
import { TelemetryEditor } from '../config/TelemetryEditor';
import { MonitoringPanel } from './MonitoringPanel';

export function ObservabilityPanel() {
  return (
    <Stack gap="lg">
      <Stack gap={0}>
        <Title order={3}>Observability & Telemetry</Title>
        <Text size="sm" c="dimmed">Monitor system health and configure real-time tracing/logging.</Text>
      </Stack>

      <Tabs defaultValue="dashboards">
        <Tabs.List mb="md">
          <Tabs.Tab value="dashboards" leftSection={<BarChart3 size={14} />}>Dashboards</Tabs.Tab>
          <Tabs.Tab value="config" leftSection={<Settings size={14} />}>Log & Trace Levels</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="dashboards">
          <MonitoringPanel />
        </Tabs.Panel>

        <Tabs.Panel value="config">
          {/* We use a simplified version of TelemetryEditor here or just the whole thing */}
          <TelemetryEditor hideHeader />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
