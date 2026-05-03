import { useMemo } from 'react';
import { Accordion, Stack, Text } from '@mantine/core';
import { Settings, Puzzle, Terminal } from 'lucide-react';
import { ConfigItemEditor } from './ConfigItemEditor';

interface ConfigItem {
  key: string;
  value: string;
}

interface CategorizedConfigPanelProps {
  configs: ConfigItem[];
  onSave: (key: string, value: string) => void;
  onDelete?: (key: string) => void;
}

export function CategorizedConfigPanel({
  configs,
  onSave,
  onDelete
}: CategorizedConfigPanelProps) {
  
  const grouped = useMemo(() => {
    const categories: Record<string, ConfigItem[]> = {
      'System': [],
      'Plugins': [],
      'Other': []
    };

    const pluginGroups: Record<string, ConfigItem[]> = {};

    configs.forEach(item => {
      if (item.key === 'ami_adapter' || item.key === 'analytics_threshold') {
        categories['System'].push(item);
      } else if (item.key.startsWith('plugin.')) {
        const parts = item.key.split('.');
        const pluginName = parts[1];
        if (!pluginGroups[pluginName]) pluginGroups[pluginName] = [];
        pluginGroups[pluginName].push(item);
      } else {
        categories['Other'].push(item);
      }
    });

    return { categories, pluginGroups };
  }, [configs]);

  return (
    <Accordion multiple variant="separated">
      <Accordion.Item value="system">
        <Accordion.Control icon={<Settings size={18} color="blue" />}>
          <Text fw={500}>System Settings</Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap={0}>
            {grouped.categories['System'].map(item => (
              <ConfigItemEditor 
                key={item.key} 
                configKey={item.key} 
                value={item.value} 
                onSave={onSave} 
                description={item.key === 'analytics_threshold' ? 'Threshold for pre-fetching raw readings vs summarized data.' : undefined}
              />
            ))}
            {grouped.categories['System'].length === 0 && <Text size="xs" c="dimmed" py="md">No system overrides defined.</Text>}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="plugins">
        <Accordion.Control icon={<Puzzle size={18} color="green" />}>
          <Text fw={500}>Plugin Configurations</Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Accordion variant="contained">
            {Object.entries(grouped.pluginGroups).map(([pluginName, items]) => (
              <Accordion.Item key={pluginName} value={pluginName}>
                <Accordion.Control>
                  <Text size="sm" fw={500} style={{ textTransform: 'capitalize' }}>{pluginName.replace(/_/g, ' ')}</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={0}>
                    {items.map(item => (
                      <ConfigItemEditor 
                        key={item.key} 
                        configKey={item.key} 
                        value={item.value} 
                        onSave={onSave}
                        onDelete={onDelete}
                        label={item.key.endsWith('.enabled') ? 'Enabled' : undefined}
                      />
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
          {Object.keys(grouped.pluginGroups).length === 0 && (
            <Text size="xs" c="dimmed" py="md">No plugin-specific overrides defined.</Text>
          )}
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="advanced">
        <Accordion.Control icon={<Terminal size={18} color="orange" />}>
          <Text fw={500}>Advanced Overrides</Text>
        </Accordion.Control>
        <Accordion.Panel>
          <Stack gap={0}>
            {grouped.categories['Other'].map(item => (
              <ConfigItemEditor 
                key={item.key} 
                configKey={item.key} 
                value={item.value} 
                onSave={onSave}
                onDelete={onDelete}
              />
            ))}
            {grouped.categories['Other'].length === 0 && (
              <Text size="xs" c="dimmed" py="md">No custom overrides defined.</Text>
            )}
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
