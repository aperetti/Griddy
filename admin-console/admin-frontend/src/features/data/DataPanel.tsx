import { useState } from 'react';
import { Button, Group, Paper, Title, Stack, Text, Alert, ThemeIcon } from '@mantine/core';
import { Database, Play, Info, Activity } from 'lucide-react';
import { dataApi } from '../../api';
import { CimUpload } from './CimUpload';

export function DataPanel() {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: boolean; output: string; error: string } | null>(null);

  const handleAction = async (type: 'generate' | 'ingest') => {
    setLoading(type);
    setResult(null);
    try {
      const res = await (type === 'generate' ? dataApi.generate() : dataApi.ingest());
      setResult(res);
    } catch (err: any) {
      setResult({ success: false, output: '', error: err.message });
    } finally {
      setLoading(null);
    }
  };

  return (
    <Stack gap="md">
      <Title order={4}>Pipeline Control</Title>
      <CimUpload />
      
      <Group grow>
        <Paper>
          <Stack>
            <Group justify="space-between">
              <ThemeIcon size="lg" variant="light" color="blue">
                <Database size={20} />
              </ThemeIcon>
              <Button 
                variant="filled" 
                leftSection={<Play size={16} />} 
                loading={loading === 'ingest'}
                onClick={() => handleAction('ingest')}
              >
                Run Ingestion
              </Button>
            </Group>
            <Title order={5}>CIM Ingestor</Title>
            <Text size="sm" c="dimmed">
              Executes `ingest_cim_graph.py` to refresh the DuckDB grid topology from source Parquet files.
            </Text>
          </Stack>
        </Paper>

        <Paper>
          <Stack>
            <Group justify="space-between">
              <ThemeIcon size="lg" variant="light" color="cyan">
                <Activity size={20} color="cyan" />
              </ThemeIcon>
              <Button 
                variant="filled" 
                color="cyan"
                leftSection={<Play size={16} />} 
                loading={loading === 'generate'}
                onClick={() => handleAction('generate')}
              >
                Generate Data
              </Button>
            </Group>
            <Title order={5}>Synthetic Generator</Title>
            <Text size="sm" c="dimmed">
              Executes `generate_synthetic_data.py` to create multi-year AMI time-series metrics.
            </Text>
          </Stack>
        </Paper>
      </Group>

      {result && (
        <Alert 
          icon={<Info size={16} />} 
          title={result.success ? "Execution Successful" : "Execution Failed"} 
          color={result.success ? "green" : "red"}
          withCloseButton
          onClose={() => setResult(null)}
        >
          <Text size="xs" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
            {result.error || result.output}
          </Text>
        </Alert>
      )}
    </Stack>
  );
}
