import { useState } from 'react';
import { Box, ActionIcon, Tooltip, Stack, Paper, Text, Group } from '@mantine/core';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import type { PluginDefinition } from '../../plugins/types';

interface SystemSidebarProps {
  plugins: PluginDefinition[];
  onRunPlugin: (plugin: PluginDefinition) => void;
  isMobile?: boolean;
}

export function SystemSidebar({ plugins, onRunPlugin, isMobile }: SystemSidebarProps) {
  const systemPlugins = plugins.filter(p => p.category === 'system');
  const [expanded, setExpanded] = useState(false);

  if (systemPlugins.length === 0) return null;

  const handlePluginClick = (plugin: PluginDefinition) => {
    onRunPlugin(plugin);
    if (isMobile) setExpanded(false);
  };

  return (
    <Box style={{
      position: 'absolute',
      top: '50%',
      left: 16,
      transform: 'translateY(-50%)',
      zIndex: 1000,
      pointerEvents: 'none',
    }}>
      <Paper
        shadow="xl"
        p="xs"
        onMouseEnter={() => { if (!isMobile) setExpanded(true); }}
        onMouseLeave={() => { if (!isMobile) setExpanded(false); }}
        style={{
          backgroundColor: 'rgba(26, 27, 30, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          pointerEvents: 'auto',
          overflow: 'hidden',
          // Pill ↔ rounded-rect morph
          borderRadius: expanded ? 16 : 100,
          transition: 'border-radius 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Stack gap="xs" align="flex-start">
          {systemPlugins.map(plugin => {
            const Icon = plugin.icon;
            return (
              // Single render path — tooltip disabled once labels are visible
              <Tooltip
                key={plugin.type}
                label={plugin.label}
                position="right"
                withArrow
                offset={15}
                color="dark"
                disabled={expanded}
              >
                <Group
                  gap={0}
                  wrap="nowrap"
                  onClick={() => handlePluginClick(plugin)}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 100,
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    if (expanded) e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                  }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Icon — fixed size so height never jumps */}
                  <ActionIcon
                    size={42}
                    radius="xl"
                    variant="subtle"
                    color={plugin.color}
                    style={{ flexShrink: 0, pointerEvents: 'none' }}
                  >
                    <Icon size={22} />
                  </ActionIcon>

                  {/* Label slides in via max-width; opacity fades in slightly after */}
                  <Box style={{
                    maxWidth: expanded ? 150 : 0,
                    overflow: 'hidden',
                    transition: 'max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}>
                    <Text
                      size="sm"
                      c="white"
                      fw={500}
                      pr="sm"
                      pl={2}
                      style={{
                        whiteSpace: 'nowrap',
                        opacity: expanded ? 1 : 0,
                        transition: 'opacity 0.2s ease ' + (expanded ? '0.15s' : '0s'),
                      }}
                    >
                      {plugin.label}
                    </Text>
                  </Box>
                </Group>
              </Tooltip>
            );
          })}

          {/* Mobile-only expand/collapse toggle */}
          {isMobile && (
            <ActionIcon
              size={42}
              radius="xl"
              variant="subtle"
              color="gray"
              onClick={() => setExpanded(e => !e)}
              style={{
                alignSelf: 'center',
                transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
              title={expanded ? 'Collapse' : 'Show plugin names'}
            >
              {/* Single icon, rotation handles direction */}
              <ChevronRight size={16} />
            </ActionIcon>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
