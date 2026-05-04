import { Stack, Title, Text } from '@mantine/core';
import { DisplayProfilesPanel } from './DisplayProfilesPanel';

export function DisplayRulesPanel() {
  return (
    <Stack gap="lg">
      <Stack gap={0}>
        <Title order={3}>Display Rule Profiles</Title>
        <Text size="sm" c="dimmed">Manage visual styling and interpreted logic across the grid.</Text>
      </Stack>

      <DisplayProfilesPanel />
    </Stack>
  );
}

