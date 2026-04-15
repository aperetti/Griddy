import { useState, useEffect } from 'react';
import { Popover, ActionIcon, Tooltip, Stack, Group, Text, Switch, Badge, Box, Loader, TextInput } from '@mantine/core';
import { Layers, Search, Maximize } from 'lucide-react';
import { fetchModels, type ModelInfo } from '../../../shared/api';

interface ModelSwitcherProps {
  activeModelIds: string[];
  onModelsChange: (activeModelIds: string[]) => void;
  onZoomToModel?: (modelId: string) => void;
  loading?: boolean;
}

export function ModelSwitcher({ activeModelIds, onModelsChange, onZoomToModel, loading }: ModelSwitcherProps) {
  const [feeders, setFeeders] = useState<ModelInfo[]>([]);
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  const refreshFeeders = async () => {
    try {
      const data = await fetchModels();
      setFeeders(data);
    } catch (err) {
      console.error('[ModelSwitcher] Failed to fetch feeders:', err);
    }
  };

  useEffect(() => {
    refreshFeeders();
  }, []);

  const handleToggle = (feederId: string) => {
    const newActive = activeModelIds.includes(feederId)
      ? activeModelIds.filter(id => id !== feederId)
      : [...activeModelIds, feederId];

    if (newActive.length === 0) {
      console.warn('[ModelSwitcher] At least one feeder must be active');
      return;
    }

    onModelsChange(newActive);
  };

  const activeCount = activeModelIds.length;
  const filtered = feeders.filter(f =>
    (f.feeder_id || '').toLowerCase().includes((debouncedSearch || '').toLowerCase())
  );

  return (
    <Tooltip label="Feeders" position="bottom" withArrow>
      <Box style={{ position: 'relative', display: 'inline-block' }}>
        <Popover
          opened={opened}
          onChange={setOpened}
          position="bottom-end"
          offset={10}
          shadow="md"
          withArrow
        >
          <Popover.Target>
            <ActionIcon
              variant="filled"
              color={opened ? 'blue' : 'gray'}
              size="xl"
              radius="md"
              onClick={() => setOpened(o => !o)}
              style={{
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              {loading ? <Loader size={18} color="white" /> : <Layers size={20} />}
            </ActionIcon>
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
            Feeders
          </Text>

          <TextInput
            placeholder="Search feeders..."
            size="xs"
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            mb="xs"
          />

          {feeders.length === 0 && (
            <Group justify="center" py="md">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading feeders…</Text>
            </Group>
          )}

          {filtered.map(feeder => {
            const isActive = activeModelIds.includes(feeder.feeder_id);
            const isLastActive = isActive && activeCount <= 1;

            return (
              <Box
                key={feeder.feeder_id}
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
                      {feeder.feeder_id}
                    </Text>
                    <Text size="xs" c="dimmed" mt={2}>
                      {(feeder.node_count || 0).toLocaleString()} nodes
                    </Text>
                  </Box>

                  <Group gap="xs" wrap="nowrap">
                    {onZoomToModel && (
                      <Tooltip label="Zoom to Extent" position="left" withArrow>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={() => onZoomToModel(feeder.feeder_id)}
                        >
                          <Maximize size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}

                    <Switch
                      checked={isActive}
                      onChange={() => handleToggle(feeder.feeder_id)}
                      disabled={isLastActive}
                      size="sm"
                      color="teal"
                    />
                  </Group>
                </Group>
              </Box>
            );
          })}

          {feeders.length > 0 && filtered.length === 0 && (
            <Text size="xs" c="dimmed" ta="center" py="sm">
              No feeders match "{search}"
            </Text>
          )}

          {activeCount > 1 && (
            <Text size="xs" c="teal" ta="center" mt={4}>
              Combined view — {activeCount} feeders active
            </Text>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
        {activeCount > 1 && !loading && (
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
              pointerEvents: 'none',
            }}
          >
            {activeCount}
          </Badge>
        )}
      </Box>
    </Tooltip>
  );
}
