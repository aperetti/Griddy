import { useState, useEffect } from 'react';
import { Popover, ActionIcon, Tooltip, Stack, Group, Text, Switch, Badge, Box, Loader, TextInput } from '@mantine/core';
import { Layers, Search, Maximize } from 'lucide-react';
import { fetchModels, type ModelInfo } from '../../../shared/api';

interface ModelSwitcherProps {
  activeModelIds: string[];
  onModelsChange: (activeModelIds: string[]) => void;
  onZoomToModel?: (modelId: string) => void;
}

export function ModelSwitcher({ activeModelIds, onModelsChange, onZoomToModel }: ModelSwitcherProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  const refreshModels = async () => {
    try {
      const data = await fetchModels();
      setModels(data);
    } catch (err) {
      console.error('[ModelSwitcher] Failed to fetch models:', err);
    }
  };

  useEffect(() => {
    refreshModels();
  }, []);

  const handleToggle = (modelId: string) => {
    const newActive = activeModelIds.includes(modelId)
      ? activeModelIds.filter(id => id !== modelId)
      : [...activeModelIds, modelId];
    
    // Don't allow clearing all models
    if (newActive.length === 0) {
      console.warn('[ModelSwitcher] At least one model must be active');
      return;
    }
    
    onModelsChange(newActive);
  };

  const activeCount = activeModelIds.length;

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-end"
      offset={10}
      shadow="md"
      withArrow
    >
      <Popover.Target>
        <Tooltip label="CIM Models" position="bottom" withArrow>
          <ActionIcon
            variant="filled"
            color={opened ? 'blue' : 'gray'}
            size="xl"
            radius="md"
            onClick={() => setOpened(o => !o)}
            style={{
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.1)',
              position: 'relative',
              overflow: 'visible',
            }}
          >
            <Layers size={20} />
            {activeCount > 1 && (
              <Badge
                size="xs"
                circle
                color="teal"
                variant="filled"
                style={{
                  position: 'absolute',
                  top: -7,
                  right: -7,
                  padding: 0,
                  width: 16,
                  height: 16,
                  fontSize: 9,
                }}
              >
                {activeCount}
              </Badge>
            )}
          </ActionIcon>
        </Tooltip>
      </Popover.Target>

      <Popover.Dropdown
        bg="rgba(26, 27, 30, 0.95)"
        style={{
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.1)',
          minWidth: 280,
        }}
      >
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed" tt="uppercase" px={4}>
            CIM Models
          </Text>

          <TextInput
            placeholder="Search models..."
            size="xs"
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            mb="xs"
          />

          {models.length === 0 && (
            <Group justify="center" py="md">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading models…</Text>
            </Group>
          )}

          {models
            .filter(m => (m.model_id || '').toLowerCase().includes((debouncedSearch || '').toLowerCase()))
            .map(model => {
            const isActive = activeModelIds.includes(model.model_id);
            const isLastActive = isActive && activeCount <= 1;

            return (
              <Box
                key={model.model_id}
                px="sm"
                py="xs"
                style={{
                  borderRadius: 6,
                  background: isActive
                    ? 'rgba(51, 154, 240, 0.08)'
                    : 'transparent',
                  transition: 'background 0.15s',
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text size="sm" fw={500} truncate>
                      {model.model_id}
                    </Text>
                    <Group gap={6} mt={2}>
                      <Text size="xs" c="dimmed">
                        {typeof model.size_mb === 'number' ? model.size_mb.toFixed(1) : '0.0'} MB
                      </Text>
                      <Text size="xs" c="dimmed">•</Text>
                      <Text size="xs" c="dimmed">
                        {(model.node_count || 0).toLocaleString()} nodes
                      </Text>
                    </Group>
                  </Box>

                  <Group gap="xs" wrap="nowrap">
                    {onZoomToModel && (
                      <Tooltip label="Zoom to Extent" position="left" withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={() => onZoomToModel(model.model_id)}
                        >
                          <Maximize size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}

                    <Tooltip
                      label={isLastActive ? 'At least one model must be visible' : ''}
                      disabled={!isLastActive}
                    >
                      <Switch
                        checked={isActive}
                        onChange={() => handleToggle(model.model_id)}
                        disabled={isLastActive}
                        size="sm"
                        color="teal"
                      />
                    </Tooltip>
                  </Group>
                </Group>
              </Box>
            );
          })}

          {models.length > 0 && models.filter(m => (m.model_id || '').toLowerCase().includes((debouncedSearch || '').toLowerCase())).length === 0 && (
            <Text size="xs" c="dimmed" ta="center" py="sm">
              No models match "{search}"
            </Text>
          )}

          {activeCount > 1 && (
            <Text size="xs" c="teal" ta="center" mt={4}>
              Combined view — {activeCount} models active
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
