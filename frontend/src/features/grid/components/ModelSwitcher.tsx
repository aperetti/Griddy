import { useState, useEffect } from 'react';
import { Popover, ActionIcon, Tooltip, Stack, Group, Text, Switch, Badge, Box, Loader } from '@mantine/core';
import { Layers } from 'lucide-react';
import { fetchModels, loadModel, unloadModel, type ModelInfo } from '../../../shared/api';

interface ModelSwitcherProps {
  onModelsChange: (activeModelIds: string[]) => void;
}

export function ModelSwitcher({ onModelsChange }: ModelSwitcherProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [opened, setOpened] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);

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

  // Notify parent whenever the loaded set changes
  useEffect(() => {
    const active = models.filter(m => m.loaded).map(m => m.model_id);
    onModelsChange(active);
  }, [models, onModelsChange]);

  const handleToggle = async (model: ModelInfo) => {
    setLoadingId(model.model_id);
    try {
      if (model.loaded) {
        // Don't allow unloading the last model
        const loadedCount = models.filter(m => m.loaded).length;
        if (loadedCount <= 1) {
          console.warn('[ModelSwitcher] Cannot unload last model');
          return;
        }
        await unloadModel(model.model_id);
      } else {
        await loadModel(model.model_id);
      }
      await refreshModels();
    } catch (err) {
      console.error('[ModelSwitcher] Toggle failed:', err);
    } finally {
      setLoadingId(null);
    }
  };

  const loadedCount = models.filter(m => m.loaded).length;

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
            {loadedCount > 1 && (
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
                {loadedCount}
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

          {models.length === 0 && (
            <Group justify="center" py="md">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading models…</Text>
            </Group>
          )}

          {models.map(model => {
            const isLoading = loadingId === model.model_id;
            const isLastLoaded = model.loaded && loadedCount <= 1;

            return (
              <Box
                key={model.model_id}
                px="sm"
                py="xs"
                style={{
                  borderRadius: 6,
                  background: model.loaded
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
                        {model.size_mb.toFixed(1)} MB
                      </Text>
                      {model.loaded && (
                        <>
                          <Text size="xs" c="dimmed">•</Text>
                          <Text size="xs" c="dimmed">
                            {model.node_count.toLocaleString()} nodes
                          </Text>
                          <Text size="xs" c="dimmed">•</Text>
                          <Text size="xs" c="dimmed">
                            {model.edge_count.toLocaleString()} edges
                          </Text>
                        </>
                      )}
                    </Group>
                  </Box>

                  {isLoading ? (
                    <Loader size="sm" />
                  ) : (
                    <Tooltip
                      label={isLastLoaded ? 'At least one model must be loaded' : ''}
                      disabled={!isLastLoaded}
                    >
                      <Switch
                        checked={model.loaded}
                        onChange={() => handleToggle(model)}
                        disabled={isLastLoaded}
                        size="sm"
                        color="teal"
                      />
                    </Tooltip>
                  )}
                </Group>
              </Box>
            );
          })}

          {loadedCount > 1 && (
            <Text size="xs" c="teal" ta="center" mt={4}>
              Combined view — {loadedCount} models loaded
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
