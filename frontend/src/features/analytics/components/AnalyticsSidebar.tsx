import { Box, ActionIcon, ScrollArea, Title, Group } from '@mantine/core';
import { X, LayoutGrid } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';

interface AnalyticsSidebarProps {
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function AnalyticsSidebar({ width, onWidthChange, onClose, children }: AnalyticsSidebarProps) {
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = Math.max(300, Math.min(window.innerWidth - e.clientX, window.innerWidth * 0.8));
      onWidthChange(newWidth);
    }
  }, [isResizing, onWidthChange]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }

    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <Box
      style={{
        width: width,
        height: '100vh',
        background: 'rgba(26, 27, 30, 0.95)',
        backdropFilter: 'blur(10px)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 1000,
        transition: isResizing ? 'none' : 'width 0.1s ease',
        boxShadow: '-10px 0 20px rgba(0,0,0,0.2)'
      }}
    >
      {/* Header */}
      <Box p="md" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <LayoutGrid size={20} color="#339af0" />
            <Title order={4} style={{ whiteSpace: 'nowrap' }}>Analytics Sidebar</Title>
          </Group>
          <ActionIcon variant="subtle" color="gray" onClick={onClose}>
            <X size={18} />
          </ActionIcon>
        </Group>
      </Box>

      {/* Content */}
      <ScrollArea style={{ flex: 1 }} p="md">
        {children}
      </ScrollArea>

      {/* Resize Handle (on the left edge when right-pinned) */}
      <Box
        onMouseDown={startResizing}
        style={{
          position: 'absolute',
          top: 0,
          left: -5,
          width: 10,
          height: '100%',
          cursor: 'col-resize',
          zIndex: 1001,
          background: isResizing ? 'rgba(51, 154, 240, 0.3)' : 'transparent',
          transition: 'background 0.2s ease'
        }}
      />
    </Box>
  );
}
