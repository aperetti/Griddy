import { useState, useEffect } from 'react';
import { Stack, Title, Text, Tabs } from '@mantine/core';
import { configApi } from '../../api';
import { DisplayProfilesPanel } from './DisplayProfilesPanel';
import { AmiAdapterPanel } from './AmiAdapterPanel';
import { CategorizedConfigPanel } from './CategorizedConfigPanel';
import { Layout, Database, ListFilter } from 'lucide-react';

interface ConfigItem {
  key: string;
  value: string;
}

export function DisplayRulesPanel() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);

  const fetchConfigs = async () => {
    try {
      const data = await configApi.get();
      setConfigs(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleSave = async (key: string, value: string) => {
    try {
      await configApi.set(key, value);
      fetchConfigs();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (key: string) => {
    console.log('Delete requested for', key);
  };

  return (
    <Stack gap="lg">
      <Stack gap={0}>
        <Title order={3}>Display & Logic Rules</Title>
        <Text size="sm" c="dimmed">Manage how data is interpreted and visualized across the system.</Text>
      </Stack>

      <Tabs defaultValue="profiles" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="profiles" leftSection={<Layout size={14} />}>Visual Profiles</Tabs.Tab>
          <Tabs.Tab value="overrides" leftSection={<ListFilter size={14} />}>Business Overrides</Tabs.Tab>
          <Tabs.Tab value="ami" leftSection={<Database size={14} />}>AMI Adapters</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="profiles">
          <DisplayProfilesPanel />
        </Tabs.Panel>

        <Tabs.Panel value="overrides">
          <CategorizedConfigPanel 
            configs={configs}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        </Tabs.Panel>

        <Tabs.Panel value="ami">
          <AmiAdapterPanel />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
