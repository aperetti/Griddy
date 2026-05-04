import { useState, useEffect } from 'react';
import { Grid, Stack, Title, Text, Button, Group, ActionIcon, List, Box, Paper, Alert, Loader, Textarea } from '@mantine/core';
import { Save, RefreshCcw, FileJson, FileCode, FileText, Check, AlertCircle } from 'lucide-react';
import { configApi } from '../../api';
import { notifications } from '@mantine/notifications';

export function EditorPanel() {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFiles = async () => {
    setLoadingFiles(true);
    try {
      const data = await configApi.getInfraFiles();
      setFiles(data);
      if (data.length > 0 && !selectedFile) {
        handleFileSelect(data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleFileSelect = async (filename: string) => {
    setSelectedFile(filename);
    setLoadingContent(true);
    setError(null);
    try {
      const data = await configApi.getInfraFile(filename);
      setContent(data.content);
    } catch (err: any) {
      setError(`Failed to load ${filename}`);
    } finally {
      setLoadingContent(false);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      // Basic JSON validation if it's a JSON file
      if (selectedFile.endsWith('.json')) {
        JSON.parse(content);
      }
      
      await configApi.saveInfraFile(selectedFile, content);
      notifications.show({
        title: 'File Saved',
        message: `${selectedFile} has been updated.`,
        color: 'green',
        icon: <Check size={16} />
      });
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        notifications.show({
          title: 'Invalid JSON',
          message: 'Please check your JSON syntax before saving.',
          color: 'red'
        });
      } else {
        notifications.show({
          title: 'Error',
          message: err.response?.data?.error || 'Failed to save file',
          color: 'red'
        });
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const getFileIcon = (filename: string) => {
    if (filename.endsWith('.json')) return <FileJson size={16} />;
    if (filename.endsWith('.alloy')) return <FileCode size={16} />;
    if (filename.endsWith('.yaml') || filename.endsWith('.yml')) return <FileText size={16} />;
    return <FileText size={16} />;
  };

  return (
    <Grid gutter="xl">
      <Grid.Col span={{ base: 12, md: 3 }}>
        <Paper withBorder p="md" radius="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Title order={4}>Infrastructure</Title>
              <ActionIcon variant="light" onClick={fetchFiles} loading={loadingFiles}>
                <RefreshCcw size={14} />
              </ActionIcon>
            </Group>
            <Text size="xs" c="dimmed">Editable configuration files in /infra</Text>
            
            <List spacing="xs" size="sm" center listStyleType="none">
              {files.map((file) => (
                <List.Item 
                  key={file}
                  onClick={() => handleFileSelect(file)}
                  style={{ 
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '4px',
                    backgroundColor: selectedFile === file ? 'rgba(51, 154, 240, 0.1)' : 'transparent',
                    color: selectedFile === file ? '#339af0' : 'inherit',
                    transition: 'background-color 0.2s'
                  }}
                >
                  <Group gap="xs">
                    {getFileIcon(file)}
                    <Text size="sm">{file}</Text>
                  </Group>
                </List.Item>
              ))}
            </List>
          </Stack>
        </Paper>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 9 }}>
        <Stack gap="md">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" mb="md">
              <Group gap="xs">
                <Title order={4}>{selectedFile || 'Select a file'}</Title>
                {selectedFile?.endsWith('.json') && <Text size="xs" c="blue" fw={700}>(JSON)</Text>}
                {selectedFile?.endsWith('.alloy') && <Text size="xs" c="teal" fw={700}>(ALLOY)</Text>}
              </Group>
              <Button 
                onClick={handleSave} 
                disabled={!selectedFile || loadingContent} 
                loading={saving}
                leftSection={<Save size={16} />}
              >
                Save
              </Button>
            </Group>

            {error && (
              <Alert icon={<AlertCircle size={16} />} title="Error" color="red" mb="md">
                {error}
              </Alert>
            )}

            {loadingContent ? (
              <Box py={50} style={{ textAlign: 'center' }}>
                <Loader size="lg" variant="dots" />
                <Text mt="sm" c="dimmed">Reading file...</Text>
              </Box>
            ) : (
              <Textarea
                value={content}
                onChange={(e) => setContent(e.currentTarget.value)}
                placeholder="File content..."
                minRows={20}
                maxRows={40}
                autosize
                styles={{
                  input: {
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    backgroundColor: 'rgba(0,0,0,0.1)',
                    lineHeight: '1.5'
                  }
                }}
              />
            )}
          </Paper>
          
          <Alert color="blue" variant="light">
            <Text size="xs">
              <strong>Tip:</strong> Changes to <code>telemetry_config.json</code> are applied instantly. 
              Other infrastructure files (Loki/Tempo/Alloy) may require a container restart to take full effect if structural changes are made.
            </Text>
          </Alert>
        </Stack>
      </Grid.Col>
    </Grid>
  );
}
