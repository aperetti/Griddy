import '@mantine/core/styles.css';
import { MantineProvider, AppShell, Group, Title, Stack, Container, Tabs, Text } from '@mantine/core';
import { Settings, Database, Puzzle, Activity, FileCode, LayoutList } from 'lucide-react';
import { theme } from './theme';
import { DataPanel } from './features/data/DataPanel';
import { DisplayRulesPanel } from './features/config/DisplayRulesPanel';
import { SystemManagementPanel } from './features/system/SystemManagementPanel';
import { ObservabilityPanel } from './features/monitoring/ObservabilityPanel';
import { EditorPanel } from './features/monitoring/EditorPanel';

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <AppShell
        header={{ height: 70 }}
        padding="md"
      >
        <AppShell.Header bg="rgba(26, 27, 30, 0.8)" style={{ backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <Container size="xl" h="100%">
            <Group h="100%" justify="space-between">
              <Group>
                <Settings size={28} color="#339af0" />
                <Stack gap={0}>
                  <Title order={3}>Griddy Admin</Title>
                  <Text size="xs" c="dimmed">System Management Console</Text>
                </Stack>
              </Group>
            </Group>
          </Container>
        </AppShell.Header>

        <AppShell.Main>
          <Container size="xl">
            <Tabs defaultValue="data" variant="pills" radius="md" keepMounted={false}>
              <Tabs.List mb="xl">
                <Tabs.Tab value="data" leftSection={<Database size={16} />}>Data Management</Tabs.Tab>
                <Tabs.Tab value="rules" leftSection={<LayoutList size={16} />}>Display Rules</Tabs.Tab>
                <Tabs.Tab value="telemetry" leftSection={<Activity size={16} />}>Observability</Tabs.Tab>
                <Tabs.Tab value="system" leftSection={<Puzzle size={16} />}>System</Tabs.Tab>
                <Tabs.Tab value="raw" leftSection={<FileCode size={16} />}>Raw Config</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="data">
                <DataPanel />
              </Tabs.Panel>

              <Tabs.Panel value="rules">
                <DisplayRulesPanel />
              </Tabs.Panel>
              
              <Tabs.Panel value="telemetry">
                <ObservabilityPanel />
              </Tabs.Panel>

              <Tabs.Panel value="system">
                <SystemManagementPanel />
              </Tabs.Panel>

              <Tabs.Panel value="raw">
                <EditorPanel />
              </Tabs.Panel>
            </Tabs>
          </Container>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
