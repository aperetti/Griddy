import { Box, ActionIcon, Tooltip, Stack, Paper } from '@mantine/core';
import type { PluginDefinition } from '../../plugins/types';

interface SystemSidebarProps {
  plugins: PluginDefinition[];
  onRunPlugin: (plugin: PluginDefinition) => void;
}

export function SystemSidebar({ plugins, onRunPlugin }: SystemSidebarProps) {
  const systemPlugins = plugins.filter(p => p.category === 'system');

  if (systemPlugins.length === 0) return null;

  return (
    <Box style={{
      position: 'absolute',
      top: '50%',
      left: 16, // Consistent spacing from edge
      transform: 'translateY(-50%)',
      zIndex: 1000,
      pointerEvents: 'none'
    }}>
      <Paper
        shadow="xl"
        p="xs"
        radius="100px" // More pill-like for a premium feel
        style={{
          backgroundColor: 'rgba(26, 27, 30, 0.95)', // Slightly more opaque
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          pointerEvents: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <Stack gap="md">
          {systemPlugins.map(plugin => {
            const Icon = plugin.icon;
            return (
              <Tooltip
                key={plugin.type}
                label={plugin.label}
                position="right"
                withArrow
                offset={15}
                color="dark"
              >
                <ActionIcon
                  size={42}
                  radius="xl"
                  variant="subtle"
                  color={plugin.color}
                  onClick={() => onRunPlugin(plugin)}
                  style={{
                    transition: 'transform 0.2s ease',
                  }}
                  className="sidebar-icon"
                >
                  <Icon size={22} />
                </ActionIcon>
              </Tooltip>
            );
          })}
        </Stack>
      </Paper>
    </Box>
  );
}
