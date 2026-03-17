import { useState, useEffect } from 'react';
import { Table, Button, Group, Badge, Paper, Title, ActionIcon, Stack, Text, Loader } from '@mantine/core';
import { RefreshCw, Play, RotateCcw } from 'lucide-react';
import { dockerApi } from '../../api';

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
}

export function DockerPanel() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const data = await dockerApi.getStatus();
      setContainers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleRestart = async (id: string) => {
    try {
      await dockerApi.restart(id);
      fetchStatus();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>Container Status</Title>
        <Group>
          <Button variant="light" leftSection={<Play size={16} />} onClick={() => dockerApi.pull()}>Pull Images</Button>
          <ActionIcon variant="subtle" onClick={fetchStatus} loading={loading}>
            <RefreshCw size={18} />
          </ActionIcon>
        </Group>
      </Group>

      <Paper>
        {loading && containers.length === 0 ? (
          <Group justify="center" py="xl"><Loader size="sm" /></Group>
        ) : (
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Image</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {containers.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Text fw={500} size="sm">{c.name.replace('/', '')}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">{c.image}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={c.state === 'running' ? 'green' : 'red'} variant="dot">
                      {c.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon variant="light" color="blue" onClick={() => handleRestart(c.id)}>
                      <RotateCcw size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
