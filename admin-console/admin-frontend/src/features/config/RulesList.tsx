import { useState, useEffect } from 'react';
import { Table, Group, Text, ActionIcon, Switch, Badge, Stack, Button, Loader, Paper } from '@mantine/core';
import { Trash, Copy, Plus, ListOrdered } from 'lucide-react';
import { configApi } from '../../api';
import { notifications } from '@mantine/notifications';

interface Rule {
  id: number;
  name: string;
  priority: number;
  enabled: boolean;
  match_conditions: any;
  config: any;
}

interface RulesListProps {
  configId: number;
}

export function RulesList({ configId }: RulesListProps) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await configApi.getRules(configId);
      setRules(data);
    } catch (err) {
      console.error(err);
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch rules',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [configId]);

  const handleToggleEnabled = async (rule: Rule) => {
    try {
      await configApi.saveRule(configId, { ...rule, enabled: !rule.enabled });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch (err) {
      console.error(err);
      notifications.show({
        title: 'Error',
        message: 'Failed to update rule',
        color: 'red'
      });
    }
  };

  const handleDelete = async (ruleId: number) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    try {
      await configApi.deleteRule(ruleId);
      setRules(prev => prev.filter(r => r.id !== ruleId));
      notifications.show({ title: 'Success', message: 'Rule deleted', color: 'green' });
    } catch (err) {
      console.error(err);
      notifications.show({ title: 'Error', message: 'Failed to delete rule', color: 'red' });
    }
  };

  const handleDuplicate = async (ruleId: number) => {
    try {
      await configApi.duplicateRule(ruleId);
      fetchRules();
      notifications.show({ title: 'Success', message: 'Rule duplicated', color: 'green' });
    } catch (err) {
      console.error(err);
      notifications.show({ title: 'Error', message: 'Failed to duplicate rule', color: 'red' });
    }
  };

  if (loading) return <Group justify="center" py="xl"><Loader size="sm" /></Group>;

  return (
    <Stack gap="sm" mt="md">
      <Group justify="space-between">
        <Text size="sm" fw={600} c="dimmed">Display Rules ({rules.length})</Text>
        <Button size="compact-xs" variant="light" leftSection={<Plus size={14} />}>Add Rule</Button>
      </Group>

      {rules.length === 0 ? (
        <Paper withBorder p="md" bg="rgba(0,0,0,0.1)">
          <Text size="xs" c="dimmed" ta="center">No rules defined for this profile.</Text>
        </Paper>
      ) : (
        <Table verticalSpacing="xs" style={{ border: '1px solid var(--mantine-color-dark-4)', borderRadius: '4px' }}>
          <Table.Thead bg="var(--mantine-color-dark-6)">
            <Table.Tr>
              <Table.Th w={40}><ListOrdered size={14} /></Table.Th>
              <Table.Th>Rule Name</Table.Th>
              <Table.Th>Priority</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th ta="right">Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rules.map((rule) => (
              <Table.Tr key={rule.id}>
                <Table.Td>
                    <Badge variant="dot" color={rule.config?.color_hex || 'gray'} size="xs" />
                </Table.Td>
                <Table.Td>
                  <Text size="xs" fw={500}>{rule.name}</Text>
                </Table.Td>
                <Table.Td>
                  <Text size="xs">{rule.priority}</Text>
                </Table.Td>
                <Table.Td>
                  <Switch 
                    size="xs" 
                    checked={rule.enabled} 
                    onChange={() => handleToggleEnabled(rule)}
                  />
                </Table.Td>
                <Table.Td ta="right">
                  <Group justify="flex-end" gap={4}>
                    <ActionIcon variant="subtle" size="sm" color="gray" onClick={() => handleDuplicate(rule.id)}>
                      <Copy size={14} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" size="sm" color="red" onClick={() => handleDelete(rule.id)}>
                      <Trash size={14} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
