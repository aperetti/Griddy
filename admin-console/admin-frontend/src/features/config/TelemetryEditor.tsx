import { useState, useEffect } from 'react';
import { 
  Stack, Title, Text, Button, Group, ActionIcon, Tooltip, Alert, 
  Select, Card, Switch, NumberInput, Tabs, JsonInput
} from '@mantine/core';
import { Save, RefreshCcw, Info, Check, Settings, Activity, Code } from 'lucide-react';
import { configApi } from '../../api';
import { notifications } from '@mantine/notifications';

const LOG_LEVELS = [
  { value: 'DEBUG', label: 'DEBUG' },
  { value: 'INFO', label: 'INFO' },
  { value: 'WARNING', label: 'WARNING' },
  { value: 'ERROR', label: 'ERROR' },
];

export function TelemetryEditor({ hideHeader = false }: { hideHeader?: boolean }) {
  const [config, setConfig] = useState<any>(null);
  const [rawConfig, setRawConfig] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await configApi.getTelemetryConfig();
      setConfig(data);
      setRawConfig(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load telemetry configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async (dataToSave?: any) => {
    const payload = dataToSave || config;
    if (!payload) return;
    
    setSaving(true);
    try {
      await configApi.saveTelemetryConfig(payload);
      notifications.show({
        title: 'Success',
        message: 'Telemetry configuration saved. Log levels will update automatically.',
        color: 'green',
        icon: <Check size={16} />
      });
      // Refresh both states to ensure consistency
      setRawConfig(JSON.stringify(payload, null, 2));
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.response?.data?.error || 'Failed to save configuration',
        color: 'red'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRawSave = async () => {
    try {
      const parsed = JSON.parse(rawConfig);
      setConfig(parsed); // Sync UI state
      await handleSave(parsed);
    } catch (err) {
      notifications.show({
        title: 'Invalid JSON',
        message: 'Please check your JSON syntax before saving.',
        color: 'red'
      });
    }
  };

  const updateGlobalLevel = (level: string | null) => {
    if (!level) return;
    const newConfig = { ...config, global_level: level };
    setConfig(newConfig);
    setRawConfig(JSON.stringify(newConfig, null, 2));
  };

  const updateServiceLevel = (service: string, level: string | null) => {
    if (!level) return;
    const newConfig = {
      ...config,
      services: {
        ...config.services,
        [service]: {
          ...config.services?.[service],
          default_level: level
        }
      }
    };
    setConfig(newConfig);
    setRawConfig(JSON.stringify(newConfig, null, 2));
  };

  const updateTracingEnabled = (enabled: boolean) => {
    const newConfig = {
      ...config,
      tracing: {
        ...config.tracing,
        enabled
      }
    };
    setConfig(newConfig);
    setRawConfig(JSON.stringify(newConfig, null, 2));
  };

  const updateSamplingRate = (rate: number | string) => {
    const value = typeof rate === 'number' ? rate : parseFloat(rate);
    if (isNaN(value)) return;
    const newConfig = {
      ...config,
      tracing: {
        ...config.tracing,
        sampling_rate: value
      }
    };
    setConfig(newConfig);
    setRawConfig(JSON.stringify(newConfig, null, 2));
  };

  if (!config && loading) return <Text>Loading...</Text>;

  return (
    <Stack gap="md">
      {!hideHeader && (
        <Group justify="space-between">
            <Stack gap={0}>
            <Group gap="xs">
                <Title order={3}>Telemetry Configuration</Title>
                <Tooltip label="Changes are detected automatically by all services without a restart.">
                <ActionIcon variant="transparent" color="gray">
                    <Info size={16} />
                </ActionIcon>
                </Tooltip>
            </Group>
            <Text size="sm" c="dimmed">Manage global log levels and service-specific overrides (Observability-as-Code).</Text>
            </Stack>
            <Group>
            <Button 
                variant="light" 
                color="gray" 
                onClick={fetchConfig} 
                loading={loading}
                leftSection={<RefreshCcw size={16} />}
            >
                Reload
            </Button>
            </Group>
        </Group>
      )}

      {hideHeader && (
        <Group justify="flex-end">
            <Button 
                variant="light" 
                color="gray" 
                size="xs"
                onClick={fetchConfig} 
                loading={loading}
                leftSection={<RefreshCcw size={14} />}
            >
                Reload Config
            </Button>
        </Group>
      )}

      {error && (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      )}

      {config && (
        <Tabs defaultValue="logging">
          <Tabs.List>
            <Tabs.Tab value="logging" leftSection={<Settings size={16} />}>Log Levels</Tabs.Tab>
            <Tabs.Tab value="tracing" leftSection={<Activity size={16} />}>Tracing</Tabs.Tab>
            <Tabs.Tab value="raw" leftSection={<Code size={16} />}>Raw JSON</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="logging" pt="md">
            <Stack gap="lg">
              <Card withBorder padding="md">
                <Title order={4} mb="sm">Global Settings</Title>
                <Select
                  label="Global Log Level"
                  description="Default log level for all services"
                  data={LOG_LEVELS}
                  value={config.global_level}
                  onChange={updateGlobalLevel}
                  style={{ maxWidth: 300 }}
                />
              </Card>

              <Title order={4}>Service Overrides</Title>
              <Group grow align="start">
                <Card withBorder padding="md">
                  <Title order={5} mb="xs">Python Backend</Title>
                  <Text size="xs" c="dimmed" mb="md">FastAPI & Analytics engine</Text>
                  <Select
                    label="Default Level"
                    data={LOG_LEVELS}
                    value={config.services?.python_backend?.default_level}
                    onChange={(val) => updateServiceLevel('python_backend', val)}
                  />
                </Card>

                <Card withBorder padding="md">
                  <Title order={5} mb="xs">Node.js Admin Backend</Title>
                  <Text size="xs" c="dimmed" mb="md">Management & Config API</Text>
                  <Select
                    label="Default Level"
                    data={LOG_LEVELS}
                    value={config.services?.node_backend?.default_level}
                    onChange={(val) => updateServiceLevel('node_backend', val)}
                  />
                </Card>
              </Group>

              <Group justify="flex-end">
                <Button 
                    onClick={() => handleSave()} 
                    loading={saving}
                    leftSection={<Save size={16} />}
                >
                    Save GUI Changes
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="tracing" pt="md">
            <Stack gap="md">
                <Card withBorder padding="md">
                <Stack gap="md">
                    <Title order={4}>OpenTelemetry Tracing</Title>
                    <Switch
                    label="Enable Distributed Tracing"
                    description="Send traces to Tempo for performance analysis"
                    checked={config.tracing?.enabled}
                    onChange={(event) => updateTracingEnabled(event.currentTarget.checked)}
                    />
                    
                    <NumberInput
                    label="Sampling Rate"
                    description="0.0 (None) to 1.0 (All traces)"
                    min={0}
                    max={1}
                    step={0.1}
                    precision={2}
                    value={config.tracing?.sampling_rate}
                    onChange={updateSamplingRate}
                    style={{ maxWidth: 200 }}
                    />
                </Stack>
                </Card>
                <Group justify="flex-end">
                    <Button 
                        onClick={() => handleSave()} 
                        loading={saving}
                        leftSection={<Save size={16} />}
                    >
                        Save GUI Changes
                    </Button>
                </Group>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="raw" pt="md">
            <Stack gap="md">
                <JsonInput
                    label="telemetry_config.json"
                    placeholder="Enter JSON configuration..."
                    validationError="Invalid JSON"
                    formatOnBlur
                    autosize
                    minRows={15}
                    maxRows={25}
                    value={rawConfig}
                    onChange={setRawConfig}
                    styles={{
                        input: {
                            fontFamily: 'monospace',
                            fontSize: '13px'
                        }
                    }}
                />
                <Group justify="flex-end">
                    <Button 
                        color="orange"
                        onClick={handleRawSave} 
                        loading={saving}
                        leftSection={<Save size={16} />}
                    >
                        Save Raw JSON
                    </Button>
                </Group>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}
