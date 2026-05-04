import React, { useState, useEffect } from 'react';
import { Table, Button, Paper, Title, Stack, Badge, Group, Text, ActionIcon, Tooltip } from '@mantine/core';
import { Trash, CheckCircle2, AlertCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { configApi } from '../../api';
import { notifications } from '@mantine/notifications';
import { RulesList } from './RulesList';

interface DisplayProfile {
  id: number;
  name: string;
  description: string;
  is_default: number;
  rules_count: number;
  updated_at: string;
}

export function DisplayProfilesPanel() {
  const [profiles, setProfiles] = useState<DisplayProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const data = await configApi.getDisplayProfiles();
      setProfiles(data);
    } catch (err) {
      console.error(err);
      notifications.show({
        title: 'Error',
        message: 'Failed to fetch display profiles',
        color: 'red'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleActivate = async (id: number) => {
    try {
      await configApi.activateDisplayProfile(id);
      notifications.show({
        title: 'Success',
        message: 'Profile activated successfully',
        color: 'green'
      });
      fetchProfiles();
    } catch (err) {
      console.error(err);
      notifications.show({
        title: 'Error',
        message: 'Failed to activate profile',
        color: 'red'
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this profile? This will also delete all rules associated with it.')) {
      return;
    }

    try {
      await configApi.deleteDisplayProfile(id);
      notifications.show({
        title: 'Success',
        message: 'Profile deleted successfully',
        color: 'green'
      });
      fetchProfiles();
    } catch (err: any) {
      notifications.show({
        title: 'Error',
        message: err.response?.data?.error || 'Failed to delete profile',
        color: 'red'
      });
    }
  };

  return (
    <Stack gap="md">
      <Title order={4}>Display Rule Profiles</Title>
      
      <Paper withBorder p="md" radius="md">
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={40}></Table.Th>
              <Table.Th>Profile Name</Table.Th>
              <Table.Th>Description</Table.Th>
              <Table.Th w={100} ta="center">Rules</Table.Th>
              <Table.Th w={120} ta="center">Status</Table.Th>
              <Table.Th w={150} ta="right">Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {profiles.map((p) => (
              <React.Fragment key={p.id}>
                <Table.Tr 
                  onClick={() => toggleExpand(p.id)} 
                  style={{ cursor: 'pointer', backgroundColor: expandedIds.has(p.id) ? 'var(--mantine-color-dark-6)' : undefined }}
                >
                  <Table.Td>
                    {expandedIds.has(p.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={600}>{p.name}</Text>
                    <Text size="xs" color="dimmed">{new Date(p.updated_at).toLocaleString()}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{p.description || '--'}</Text>
                  </Table.Td>
                  <Table.Td ta="center">
                    <Badge variant="light" color="gray">{p.rules_count}</Badge>
                  </Table.Td>
                  <Table.Td ta="center">
                    {p.is_default ? (
                      <Badge color="green" leftSection={<CheckCircle2 size={12} />}>Active</Badge>
                    ) : (
                      <Badge variant="dot" color="gray">Inactive</Badge>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Group justify="flex-end" gap="xs" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                      {!p.is_default && (
                        <Button 
                          size="compact-xs" 
                          variant="light" 
                          onClick={() => handleActivate(p.id)}
                        >
                          Activate
                        </Button>
                      )}
                      
                      <Tooltip 
                        label={p.is_default ? "Cannot delete active profile" : "Delete profile and all its rules"}
                        position="top"
                      >
                        <ActionIcon 
                          variant="subtle" 
                          color="red" 
                          disabled={p.is_default === 1}
                          onClick={() => handleDelete(p.id)}
                        >
                          <Trash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
                {expandedIds.has(p.id) && (
                  <Table.Tr>
                    <Table.Td colSpan={6} py="md" bg="var(--mantine-color-dark-8)">
                      <div style={{ paddingLeft: '40px' }}>
                        <RulesList configId={p.id} />
                      </div>
                    </Table.Td>
                  </Table.Tr>
                )}
              </React.Fragment>
            ))}
          </Table.Tbody>
        </Table>
        
        {profiles.length === 0 && !loading && (
          <Group justify="center" p="xl">
            <AlertCircle color="gray" size={20} />
            <Text color="dimmed" size="sm">No display profiles found.</Text>
          </Group>
        )}
      </Paper>
    </Stack>
  );
}
