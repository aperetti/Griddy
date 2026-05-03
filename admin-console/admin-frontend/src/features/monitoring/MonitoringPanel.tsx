import { Card, Text, Group, Button, SimpleGrid, Title, Stack, ThemeIcon } from '@mantine/core';
import { ExternalLink, BarChart3, ListTree, Activity } from 'lucide-react';

export function MonitoringPanel() {
  const GRAFANA_URL = `${window.location.protocol}//${window.location.hostname}:3000`;

  const links = [
    {
      title: 'API Monitoring Dashboard',
      description: 'System-wide request volume, latency, and error rates.',
      icon: <BarChart3 size={24} />,
      color: 'blue',
      url: `${GRAFANA_URL}/d/api-monitoring`
    },
    {
      title: 'System Logs (Loki)',
      description: 'Explore raw logs from all containers with powerful filtering.',
      icon: <ListTree size={24} />,
      color: 'teal',
      url: `${GRAFANA_URL}/explore?orgId=1&left=["now-1h","now","Loki",{"refId":"A","expr":"{container_name=~\\"grid.*\\"}"}]`
    },
    {
      title: 'Trace Explorer (Tempo)',
      description: 'Inspect distributed traces to identify bottlenecks in complex operations.',
      icon: <Activity size={24} />,
      color: 'grape',
      url: `${GRAFANA_URL}/explore?orgId=1&left=["now-1h","now","Tempo",{"refId":"A","expr":""}]`
    }
  ];

  return (
    <Stack gap="xl">
      <Stack gap={5}>
        <Title order={2}>System Observability</Title>
        <Text c="dimmed">Access local Grafana dashboards and telemetry explorers for real-time monitoring.</Text>
      </Stack>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
        {links.map((link) => (
          <Card key={link.title} withBorder padding="lg" radius="md" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <Stack gap="md">
              <Group>
                <ThemeIcon size={40} radius="md" color={link.color} variant="light">
                  {link.icon}
                </ThemeIcon>
                <Title order={4}>{link.title}</Title>
              </Group>
              <Text size="sm" c="dimmed">
                {link.description}
              </Text>
            </Stack>
            
            <Button 
              component="a" 
              href={link.url} 
              target="_blank" 
              variant="light" 
              color={link.color} 
              fullWidth 
              mt="xl"
              rightSection={<ExternalLink size={16} />}
            >
              Open in Grafana
            </Button>
          </Card>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
