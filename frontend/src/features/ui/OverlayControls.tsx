import { Box, Group, Tooltip, ActionIcon, Menu } from '@mantine/core';
import { Menu as MenuIcon, Settings, Activity, Zap, Search } from 'lucide-react';
import { GlobalSearch } from '../grid/components/GlobalSearch';
import { ModelSwitcher } from '../grid/components/ModelSwitcher';

interface OverlayControlsProps {
  activeModelIds: string[];
  setActiveModelIds: (ids: string[]) => void;
  onSearchSelect: (node: any, multi: boolean) => void;
  onSettingsClick: () => void;
  onDisplayRulesClick: () => void;
  onRefreshTopology: () => void;
  onClearSelection: () => void;
  isMobile?: boolean;
}

export function OverlayControls({
  activeModelIds,
  setActiveModelIds,
  onSearchSelect,
  onSettingsClick,
  onDisplayRulesClick,
  onRefreshTopology,
  onClearSelection,
  isMobile
}: OverlayControlsProps) {
  return (
    <>
      <Box style={{
        position: 'absolute',
        top: 20,
        left: 20,
        right: 20,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'row',
        justifyContent: isMobile ? 'space-between' : 'center',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'nowrap',
        pointerEvents: 'none'
      }}>
        {/* Search Bar - Centered on Desktop, Left on Mobile */}
        <Box style={{
          flex: isMobile ? 1 : 'initial',
          maxWidth: 500,
          width: isMobile ? 'auto' : 500,
          minWidth: 0,
          pointerEvents: 'auto'
        }}>
          <GlobalSearch
            onSearchSelect={(node) => onSearchSelect(node, false)}
          />
        </Box>

        {/* Top Right Controls (Model Switcher + Main Menu) */}
        <Box style={{
          pointerEvents: 'auto',
          position: isMobile ? 'static' : 'absolute',
          right: isMobile ? 'auto' : 0
        }}>
          <Group gap="sm">
            <ModelSwitcher
              activeModelIds={activeModelIds}
              onModelsChange={setActiveModelIds}
            />
            <Menu position="bottom-end" offset={10} withArrow shadow="md" width={220}>
              <Menu.Target>
                <Tooltip label="Main Menu" position="left">
                  <ActionIcon size="xl" radius="sm" variant="filled" color="dark" aria-label="Main Menu">
                    <MenuIcon size={20} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>


                <Menu.Label>Topology</Menu.Label>
                <Menu.Item leftSection={<Zap size={14} />} onClick={onDisplayRulesClick}>
                  Visual Rules Editor
                </Menu.Item>
                <Menu.Item leftSection={<Activity size={14} />} onClick={onRefreshTopology}>
                  Refresh Map Views
                </Menu.Item>

                <Menu.Label>System</Menu.Label>
                <Menu.Item leftSection={<Settings size={14} />} onClick={onSettingsClick}>
                  Global Settings
                </Menu.Item>
                <Menu.Item leftSection={<Search size={14} />} onClick={onClearSelection}>
                  Clear Map Selection
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Box>
      </Box>
    </>
  );
}
