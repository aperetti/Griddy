import { useState, useEffect } from 'react';
import { Table, TextInput, Button, Paper, Title, Stack, ActionIcon, Text } from '@mantine/core';
import { Plus, Trash } from 'lucide-react';
import { configApi } from '../../api';

interface ConfigItem {
  key: string;
  value: string;
}

export function ConfigPanel() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

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
      if (key === newKey) {
        setNewKey('');
        setNewValue('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Stack gap="md">
      <Title order={4}>Environment Overrides</Title>
      
      <Paper>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Key</Table.Th>
              <Table.Th>Value</Table.Th>
              <Table.Th w={100}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {configs.map((c) => (
              <Table.Tr key={c.key}>
                <Table.Td><Text size="sm" fw={500}>{c.key}</Text></Table.Td>
                <Table.Td>
                  <TextInput 
                    size="xs" 
                    defaultValue={c.value} 
                    onBlur={(e) => handleSave(c.key, e.currentTarget.value)} 
                  />
                </Table.Td>
                <Table.Td>
                  <ActionIcon variant="subtle" color="red"><Trash size={16} /></ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr>
              <Table.Td>
                <TextInput 
                  placeholder="New Key" 
                  size="xs" 
                  value={newKey} 
                  onChange={(e) => setNewKey(e.currentTarget.value)} 
                />
              </Table.Td>
              <Table.Td>
                <TextInput 
                  placeholder="New Value" 
                  size="xs" 
                  value={newValue} 
                  onChange={(e) => setNewValue(e.currentTarget.value)} 
                />
              </Table.Td>
              <Table.Td>
                <Button 
                  size="xs" 
                  variant="light" 
                  leftSection={<Plus size={14} />}
                  onClick={() => handleSave(newKey, newValue)}
                  disabled={!newKey}
                >
                  Add
                </Button>
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Paper>
    </Stack>
  );
}
