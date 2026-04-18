import { Group, Stack, Text, TextInput, ActionIcon, Box } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { Trash } from 'lucide-react';

interface ConfigItemEditorProps {
  configKey: string;
  value: string;
  onSave: (key: string, value: string) => void;
  onDelete?: (key: string) => void;
  label?: string;
  description?: string;
}

export function ConfigItemEditor({ 
  configKey, 
  value, 
  onSave, 
  onDelete, 
  label, 
  description 
}: ConfigItemEditorProps) {
  const isMobile = useMediaQuery('(max-width: 48em)');

  const displayLabel = label || configKey.split('.').pop() || configKey;

  const content = (
    <Stack gap={4} flex={1}>
      <Text size="sm" fw={500}>{displayLabel}</Text>
      {description && <Text size="xs" c="dimmed">{description}</Text>}
      <TextInput 
        size="xs" 
        defaultValue={value} 
        onBlur={(e) => {
          if (e.currentTarget.value !== value) {
            onSave(configKey, e.currentTarget.value);
          }
        }}
        placeholder="Value"
      />
    </Stack>
  );

  if (isMobile) {
    return (
      <Box py="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)' }}>
        <Group align="flex-start" wrap="nowrap">
          {content}
          {onDelete && (
            <ActionIcon variant="subtle" color="red" mt={24} onClick={() => onDelete(configKey)}>
              <Trash size={14} />
            </ActionIcon>
          )}
        </Group>
      </Box>
    );
  }

  return (
    <Group wrap="nowrap" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-1)' }}>
      <Box flex={1}>
        <Text size="sm" fw={500}>{displayLabel}</Text>
        {description && <Text size="xs" c="dimmed">{description}</Text>}
      </Box>
      <Group gap="xs" style={{ width: '60%' }}>
        <TextInput 
          size="xs" 
          defaultValue={value} 
          onBlur={(e) => {
            if (e.currentTarget.value !== value) {
              onSave(configKey, e.currentTarget.value);
            }
          }}
          style={{ flex: 1 }}
        />
        {onDelete && (
          <ActionIcon variant="subtle" color="red" onClick={() => onDelete(configKey)}>
            <Trash size={14} />
          </ActionIcon>
        )}
      </Group>
    </Group>
  );
}
