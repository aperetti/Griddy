import { useState, useRef, useEffect } from 'react';
import { Select, Group, Text, Box, ActionIcon, Popover, Tooltip, Loader, Badge } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { Search, Globe, Layers } from 'lucide-react';
import { searchCim } from '../../../shared/api';

interface GlobalSearchProps {
  onSearchSelect: (item: any) => void;
  isMobile?: boolean;
  loading?: boolean;
}

export function GlobalSearch({ onSearchSelect, isMobile, loading: modelLoading }: GlobalSearchProps) {
  const [searchValue, setSearchValue] = useState('');
  const [debouncedValue, setDebouncedValue] = useState('');
  const [options, setOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState(false);
  const [globalSearch, setGlobalSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useHotkeys([
    ['/', () => {
      if (isMobile) {
        setOpened(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else {
        searchInputRef.current?.focus();
      }
    }]
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(searchValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  useEffect(() => {
    if (debouncedValue.length < 2) {
      setOptions([]);
      return;
    }

    let active = true;
    setLoading(true);

    searchCim(debouncedValue, undefined, globalSearch)
      .then(results => {
        if (active) {
          setOptions(results.map(item => ({
            value: item.id,
            label: item.name || item.id,
            item: item
          })));
        }
      })
      .catch(err => console.error('[GlobalSearch] Search failed:', err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [debouncedValue, globalSearch]);

  const toggleButton = (
    <Tooltip
      label={globalSearch ? 'Searching all models — click to search active only' : 'Searching active models — click to search all'}
      withArrow
      position="bottom"
      withinPortal
    >
      <ActionIcon
        variant={globalSearch ? 'filled' : 'subtle'}
        color={globalSearch ? 'blue' : 'gray'}
        size="sm"
        onClick={() => setGlobalSearch(g => !g)}
        style={{ flexShrink: 0 }}
      >
        {globalSearch ? <Globe size={14} /> : <Layers size={14} />}
      </ActionIcon>
    </Tooltip>
  );

  const selectElement = (
    <Group gap={6} wrap="nowrap" style={{ width: '100%' }}>
      <Select
        ref={searchInputRef}
        placeholder={globalSearch ? 'Search all models…' : 'Search active model…'}
        leftSection={modelLoading ? <Loader size={16} /> : <Search size={16} />}
        data={options}
        rightSection={loading ? <Loader size={14} /> : null}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onChange={(value) => {
          if (value) {
            const selected = options.find(item => item.value === value);
            if (selected) onSearchSelect(selected.item);
            setSearchValue('');
            setOpened(false);
          }
        }}
        searchable
        nothingFoundMessage="No nodes found"
        maxDropdownHeight={300}
        autoFocus={isMobile}
        comboboxProps={{ withinPortal: true, zIndex: 1000 }}
        styles={{
          root: { flex: 1, minWidth: 0 },
          input: {
            backgroundColor: 'rgba(26, 27, 30, 0.7)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#fff',
            height: 44,
            minHeight: 44,
            fontSize: 16,
          },
          dropdown: {
            backgroundColor: 'rgba(26, 27, 30, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
          option: {
            color: '#eee',
            '&[data-selected]': { backgroundColor: 'rgba(51, 154, 240, 0.3)' },
            '&[data-combobox-selected]': { backgroundColor: 'rgba(51, 154, 240, 0.3)' },
          }
        }}
        renderOption={({ option }) => {
          const item = (option as any).item;
          return (
            <Group gap="sm" wrap="nowrap" justify="space-between">
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={500} c="white" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {option.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {item.model_id} • {item.cim_type}
                </Text>
              </Box>
              {item.loaded === false && (
                <Badge size="xs" color="orange" variant="light" style={{ flexShrink: 0 }}>
                  Load
                </Badge>
              )}
            </Group>
          );
        }}
      />
      {toggleButton}
    </Group>
  );

  if (isMobile) {
    return (
      <Popover
        opened={opened}
        onChange={setOpened}
        width={320}
        position="bottom-end"
        shadow="md"
        offset={10}
      >
        <Popover.Target>
          <Tooltip label="Search Map" position="bottom" withArrow>
            <ActionIcon
              variant="filled"
              color={opened ? "blue" : "gray"}
              size="xl"
              radius="md"
              onClick={() => setOpened(o => !o)}
              style={{
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <Search size={20} />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown
          bg="rgba(26, 27, 30, 0.95)"
          style={{
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
          }}
        >
          {selectElement}
        </Popover.Dropdown>
      </Popover>
    );
  }

  return selectElement;
}
