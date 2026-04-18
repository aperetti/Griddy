import { useState, useEffect } from 'react';
import { Stack, Divider } from '@mantine/core';
import { configApi } from '../../api';
import { DisplayProfilesPanel } from './DisplayProfilesPanel';
import { AmiAdapterPanel } from './AmiAdapterPanel';
import { CategorizedConfigPanel } from './CategorizedConfigPanel';

interface ConfigItem {
  key: string;
  value: string;
}

export function ConfigPanel() {
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
    // Note: backend might not have a dedicated delete for overrides yet
    console.log('Delete requested for', key);
  };

  return (
    <Stack gap="lg">
      <AmiAdapterPanel />

      <Divider label="System Configuration" labelPosition="center" />

      <CategorizedConfigPanel 
        configs={configs}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <Divider label="Display Profiles" labelPosition="center" mt="xl" />
      <DisplayProfilesPanel />
    </Stack>
  );
}
