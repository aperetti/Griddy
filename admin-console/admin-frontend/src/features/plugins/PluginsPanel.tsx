import { useState, useEffect } from 'react';
import { Stack, Title, Paper, Group, Text, Switch, Badge, Alert } from '@mantine/core';
import { AlertCircle } from 'lucide-react';
import { pluginsApi } from '../../api';

interface PluginEntry {
  name: string;
  enabled: boolean;
  description?: string;
  permissions?: string[];
}

export function PluginsPanel() {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const fetchPlugins = async () => {
    try {
      const data = await pluginsApi.getRegistry();
      setPlugins(data);
      setError(null);
    } catch {
      setError('Could not reach main backend. Ensure it is running.');
    }
  };

  useEffect(() => {
    fetchPlugins();
  }, []);

  const handleToggle = async (name: string, enabled: boolean) => {
    setToggling(prev => new Set(prev).add(name));
    try {
      await pluginsApi.setEnabled(name, enabled);
      setPlugins(prev => prev.map(p => p.name === name ? { ...p, enabled } : p));
    } catch {
      setError(`Failed to update plugin "${name}".`);
    } finally {
      setToggling(prev => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    }
  };

  return (
    <Stack gap="md">
      <Title order={4}>Plugin Management</Title>

      {error && (
        <Alert icon={<AlertCircle size={16} />} color="red" variant="light">
          {error}
        </Alert>
      )}

      <Paper p="md">
        {plugins.length === 0 && !error && (
          <Text c="dimmed" size="sm">No plugins discovered.</Text>
        )}
        <Stack gap="xs">
          {plugins.map(plugin => (
            <Group key={plugin.name} justify="space-between" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-5)', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <Group gap="sm" mb={4}>
                  <Text size="sm" fw={500} style={{ textTransform: 'capitalize' }}>
                    {plugin.name.replace(/_/g, ' ')}
                  </Text>
                  <Badge
                    size="xs"
                    variant="dot"
                    color={plugin.enabled ? 'green' : 'gray'}
                  >
                    {plugin.enabled ? 'enabled' : 'disabled'}
                  </Badge>
                </Group>
                
                {plugin.description && (
                  <Text size="xs" c="dimmed" mb={4}>
                    {plugin.description}
                  </Text>
                )}
                
                {plugin.permissions && plugin.permissions.length > 0 && (
                  <Group gap={4} mt={6}>
                    <Text size="xs" c="dimmed" fw={500}>Permissions:</Text>
                    {plugin.permissions.map(perm => (
                      <Badge key={perm} size="xs" variant="outline" color="violet">{perm}</Badge>
                    ))}
                  </Group>
                )}
              </div>
              <Switch
                mt={2}
                checked={plugin.enabled}
                disabled={toggling.has(plugin.name)}
                onChange={e => handleToggle(plugin.name, e.currentTarget.checked)}
                color="blue"
              />
            </Group>
          ))}
        </Stack>
      </Paper>


      <Text size="xs" c="dimmed">
        Changes take effect within ~5 seconds. No server restart required.
      </Text>
    </Stack>
  );
}
