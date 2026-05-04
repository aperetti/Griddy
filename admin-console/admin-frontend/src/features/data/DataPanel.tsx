import { Stack, Title } from '@mantine/core';
import { CimUpload } from './CimUpload';

export function DataPanel() {
  return (
    <Stack gap="md">
      <Title order={4}>Pipeline Control</Title>
      <CimUpload />
    </Stack>
  );
}
