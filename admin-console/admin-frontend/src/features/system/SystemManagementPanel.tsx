import { Stack, Title, Text, Tabs } from '@mantine/core';
import { Puzzle, Users, ShieldCheck } from 'lucide-react';
import { PluginsPanel } from '../plugins/PluginsPanel';
import { UserManagementPanel } from '../users/UserManagementPanel';

export function SystemManagementPanel() {
  return (
    <Stack gap="lg">
      <Stack gap={0}>
        <Title order={3}>System Management</Title>
        <Text size="sm" c="dimmed">Control platform features, access, and security.</Text>
      </Stack>

      <Tabs defaultValue="plugins">
        <Tabs.List mb="md">
          <Tabs.Tab value="plugins" leftSection={<Puzzle size={14} />}>Features & Plugins</Tabs.Tab>
          <Tabs.Tab value="users" leftSection={<Users size={14} />}>User Access</Tabs.Tab>
          <Tabs.Tab value="security" leftSection={<ShieldCheck size={14} />}>Security</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="plugins">
          <PluginsPanel />
        </Tabs.Panel>

        <Tabs.Panel value="users">
          <UserManagementPanel />
        </Tabs.Panel>

        <Tabs.Panel value="security">
          <Stack py="xl" align="center">
            <Text c="dimmed">Advanced security settings coming soon.</Text>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
