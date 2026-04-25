import { useState, useEffect } from 'react';
import { Paper, Title, Stack, Group, Select, Text, Badge, Loader, ActionIcon, Tooltip } from '@mantine/core';
import { Database, RefreshCw } from 'lucide-react';
import { configApi } from '../../api';

export function AmiAdapterPanel() {
  const [adapter, setAdapter] = useState<string | null>(null);
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const init = async () => {
    setLoading(true);
    try {
      const [configs, adapters] = await Promise.all([
        configApi.get(),
        configApi.getAmiAdapters()
      ]);
      
      const formattedOptions = adapters.map(a => ({ value: a.name, label: a.label }));
      setOptions(formattedOptions);
      
      const amiConfig = configs.find((c: any) => c.key === 'ami_adapter');
      if (amiConfig) {
        // Ensure we match the value exactly as stored, or fallback to name
        const storedValue = amiConfig.value.toLowerCase();
        const exists = formattedOptions.some(o => o.value === storedValue);
        setAdapter(exists ? storedValue : 'duckdb');
      } else {
        setAdapter('duckdb');
      }
    } catch (err) {
      console.error('Failed to initialize AMI adapter config', err);
      // Fallback to basic options if API fails
      setOptions([{ value: 'duckdb', label: 'DuckDB (Local Parquet)' }]);
      setAdapter('duckdb');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    init();
  }, []);

  const handleAdapterChange = async (value: string | null) => {
    if (!value) return;
    setLoading(true);
    try {
      await configApi.set('ami_adapter', value);
      setAdapter(value);
    } catch (err) {
      console.error('Failed to update AMI adapter', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper p={{ base: 'sm', sm: 'md' }} withBorder shadow="sm">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Group gap="xs">
            <Database size={20} strokeWidth={1.5} color="var(--mantine-color-blue-filled)" />
            <Title order={4}>AMI Data Source</Title>
          </Group>
          <Group gap="xs">
            <Tooltip label="Refresh adapters">
              <ActionIcon variant="subtle" size="sm" onClick={init} loading={loading}>
                <RefreshCw size={16} />
              </ActionIcon>
            </Tooltip>
            {loading && !adapter ? <Loader size="xs" /> : (
              <Badge color={adapter === 'duckdb' ? 'blue' : adapter === 'in_memory' ? 'cyan' : 'green'} variant="light">
                {adapter === 'duckdb' ? 'Edge Optimized' : adapter === 'in_memory' ? 'Synthetic Engine' : 'Cloud Data Lake'}
              </Badge>
            )}
          </Group>
        </Group>

        <Text size="sm" c="dimmed">
          Select the active storage provider for AMI meter readings. Analytical queries will be 
          automatically routed and optimized for this provider.
        </Text>

        <Select
          label="Active Adapter"
          placeholder={loading ? "Discovering adapters..." : "Select provider"}
          data={options}
          value={adapter}
          onChange={handleAdapterChange}
          disabled={loading}
          allowDeselect={false}
          comboboxProps={{ shadow: 'md' }}
        />
      </Stack>
    </Paper>
  );
}
