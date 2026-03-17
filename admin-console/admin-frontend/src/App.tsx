import '@mantine/core/styles.css';
import { MantineProvider, AppShell, Group, Title, Stack, Container, Tabs, Text } from '@mantine/core';
import { Settings, Database, Activity, Map as MapIcon } from 'lucide-react';
import { theme } from './theme';
import { DockerPanel } from './features/docker/DockerPanel';
import { DataPanel } from './features/data/DataPanel';
import { ConfigPanel } from './features/config/ConfigPanel';

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
            <Tabs defaultValue="docker" variant="pills" radius="md">
              <Tabs.List mb="xl">
                <Tabs.Tab value="docker" leftSection={<Activity size={16} />}>Docker Services</Tabs.Tab>
                <Tabs.Tab value="data" leftSection={<Database size={16} />}>Data Lifecycle</Tabs.Tab>
                <Tabs.Tab value="config" leftSection={<Settings size={16} />}>System Config</Tabs.Tab>
                <Tabs.Tab value="mapping" leftSection={<MapIcon size={16} />}>Schema Mapping</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="docker">
                <DockerPanel />
              </Tabs.Panel>

              <Tabs.Panel value="data">
                <DataPanel />
              </Tabs.Panel>

              <Tabs.Panel value="config">
                <ConfigPanel />
              </Tabs.Panel>
              
              <Tabs.Panel value="mapping">
                <Container py="xl">
                  <Text c="dimmed" ta="center">Schema mapping interface coming soon.</Text>
                </Container>
              </Tabs.Panel>
            </Tabs>
          </Container>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
