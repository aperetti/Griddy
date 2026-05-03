import { createPortal } from 'react-dom';
import { Paper, Group, Button, Tooltip, Transition, Box } from '@mantine/core';
import { BarChart3, Activity, Database } from 'lucide-react';
import type { AnalysisInstance } from '../../../hooks/useAnalyticsState';
import type { PluginDefinition } from '../../../plugins/types';

interface AnalysisTrayProps {
  minimizedWindows: AnalysisInstance[];
  onRestore: (id: string) => void;
  onClose: (id: string) => void;
  pluginRegistry?: Map<string, PluginDefinition>;
}

const getIcon = (type: string, registry?: Map<string, PluginDefinition>) => {
  const plugin = registry?.get(type);
  if (plugin) {
    const Icon = plugin.icon;
    return <Icon size={16} />;
  }
  
  switch (type) {
    case 'consumption': return <BarChart3 size={16} />;
    case 'voltage': return <Activity size={16} />;
    case 'diagnostic': return <Database size={16} />;
    default: return <Activity size={16} />;
  }
};

const getColor = (type: string, registry?: Map<string, PluginDefinition>) => {
  const plugin = registry?.get(type);
  if (plugin) return plugin.color;

  switch (type) {
    case 'consumption': return 'blue';
    case 'voltage': return 'cyan';
    case 'diagnostic': return 'teal';
    default: return 'gray';
  }
};

export function AnalysisTray({ minimizedWindows, onRestore, onClose, pluginRegistry }: AnalysisTrayProps) {
  if (minimizedWindows.length === 0) return null;

  return createPortal(
    <Box
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        pointerEvents: 'none'
      }}
    >
      <Transition mounted={minimizedWindows.length > 0} transition="slide-up" duration={400}>
        {(styles) => (
          <Paper
            shadow="lg"
            p="6px"
            radius="md"
            style={{
              ...styles,
              backgroundColor: 'rgba(26, 27, 30, 0.8)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              pointerEvents: 'auto',
              maxWidth: '90vw',
              overflowX: 'auto'
            }}
          >
            <Group gap="xs" wrap="nowrap">
              {minimizedWindows.map(win => (
                <Tooltip key={win.id} label={`Restore ${win.nodeName} Analysis`} position="top" withArrow>
                  <Button.Group>
                    <Button
                      variant="light"
                      color={getColor(win.type, pluginRegistry)}
                      size="compact-sm"
                      leftSection={getIcon(win.type, pluginRegistry)}
                      onClick={() => onRestore(win.id)}
                      radius="sm"
                      styles={{
                        root: {
                          transition: 'transform 0.2s ease',
                          '&:hover': {
                            transform: 'translateY(-2px)'
                          }
                        },
                        label: {
                          maxWidth: '120px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }
                      }}
                    >
                      {win.nodeName}
                    </Button>
                    <Button
                      variant="light"
                      color={getColor(win.type, pluginRegistry)}
                      size="compact-sm"
                      px={4}
                      onClick={() => onClose(win.id)}
                      title="Close"
                    >
                      ×
                    </Button>
                  </Button.Group>
                </Tooltip>
              ))}
            </Group>
          </Paper>
        )}
      </Transition>
    </Box>,
    document.body
  );
}
