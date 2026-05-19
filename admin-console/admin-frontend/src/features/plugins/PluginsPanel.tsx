import { useState, useEffect } from 'react';
import { Stack, Title, Paper, Group, Text, Switch, Badge, Alert, Button, FileButton, Modal, Select, ActionIcon, Tooltip } from '@mantine/core';
import { AlertCircle, Plus, Upload, CheckCircle2 } from 'lucide-react';
import { pluginsApi, extensionsApi } from '../../api';

interface PluginEntry {
  name: string;
  enabled: boolean;
  description?: string;
  permissions?: string[];
}

export function PluginsPanel() {
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  
  // Install Modal State
  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [installType, setInstallType] = useState<string | null>('plugin');
  const [isInstalling, setIsInstalling] = useState(false);

  const fetchPlugins = async () => {
...
  };

  useEffect(() => {
    fetchPlugins();
  }, []);

  const handleToggle = async (name: string, enabled: boolean) => {
...
  };

  const handleInstall = async (file: File | null) => {
    if (!file || !installType) return;
    
    setIsInstalling(true);
    setError(null);
    setSuccess(null);
    
    try {
      await extensionsApi.install(file, installType as 'plugin' | 'adapter');
      setSuccess(`Successfully installed ${installType}: ${file.name}`);
      setInstallModalOpen(false);
      fetchPlugins();
    } catch (err: any) {
      setError(`Installation failed: ${err.response?.data?.details || err.message}`);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>Extension Management</Title>
        <Button 
          variant="light" 
          leftSection={<Plus size={16} />} 
          size="xs"
          onClick={() => setInstallModalOpen(true)}
        >
          Install Extension
        </Button>
      </Group>

      {error && (
        <Alert icon={<AlertCircle size={16} />} color="red" variant="light">
          {error}
        </Alert>
      )}

      {success && (
        <Alert icon={<CheckCircle2 size={16} />} color="green" variant="light" withCloseButton onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Paper p="md">
        {plugins.length === 0 && !error && (
...
      </Paper>


      <Text size="xs" c="dimmed">
        Changes take effect within ~5 seconds. No server restart required.
      </Text>

      <Modal 
        opened={installModalOpen} 
        onClose={() => setInstallModalOpen(false)} 
        title="Install Extension"
        centered
      >
        <Stack gap="md">
          <Text size="sm">Upload a ZIP package containing the extension code.</Text>
          
          <Select 
            label="Extension Type"
            placeholder="Select type"
            data={[
              { value: 'plugin', label: 'Plugin (Frontend + Backend)' },
              { value: 'adapter', label: 'AMI Data Adapter (Python)' }
            ]}
            value={installType}
            onChange={setInstallType}
          />

          <FileButton onChange={handleInstall} accept="application/zip">
            {(props) => (
              <Button 
                {...props} 
                fullWidth 
                leftSection={<Upload size={16} />}
                loading={isInstalling}
              >
                Upload & Install
              </Button>
            )}
          </FileButton>

          <Text size="xs" c="dimmed">
            ZIP packages for plugins must contain a <code>manifest.json</code> and a <code>ui/index.js</code> module. Adapters should contain a Python module.
          </Text>
        </Stack>
      </Modal>
    </Stack>
  );
}
