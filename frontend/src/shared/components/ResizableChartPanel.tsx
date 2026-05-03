import { Paper, Box, Text } from '@mantine/core';
import { useResizeHandle } from '../hooks/useResizeHandle';

interface ResizableChartPanelProps {
    /** Title displayed at the top of the panel. */
    title: string;
    /** Unique key for persisting height in localStorage. */
    storageKey: string;
    /** Default height in pixels (used when no saved height exists). */
    defaultHeight: number;
    /** Minimum height in pixels. */
    minHeight?: number;
    /** Maximum height in pixels. */
    maxHeight?: number;
    /** Chart or other content — fills the remaining space. */
    children: React.ReactNode;
}

/**
 * A chart panel whose height can be adjusted by dragging the bottom resize handle.
 * The height is persisted to localStorage so it survives page reloads.
 *
 * The content area uses flex:1 to fill all available space, so child charts
 * should use `width:100%; height:100%` to fill the panel.
 */
export function ResizableChartPanel({
    title,
    storageKey,
    defaultHeight,
    minHeight = 120,
    maxHeight = 900,
    children,
}: ResizableChartPanelProps) {
    const { height, resizeHandleProps } = useResizeHandle({
        storageKey,
        defaultHeight,
        minHeight,
        maxHeight,
    });

    return (
        <Paper
            withBorder
            p="sm"
            radius="md"
            bg="rgba(26, 27, 30, 0.3)"
            style={{
                height,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
            }}
        >
            <Text
                size="xs"
                fw={700}
                c="dimmed"
                mb={12}
                ta="center"
                style={{ letterSpacing: '0.5px', flexShrink: 0 }}
            >
                {title}
            </Text>

            <Box style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                {children}
            </Box>

            {/* Resize handle */}
            <Box
                style={{
                    height: 6,
                    flexShrink: 0,
                    cursor: 'ns-resize',
                    background: 'rgba(255,255,255,0.08)',
                    borderRadius: 3,
                    marginTop: 8,
                    transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.2)';
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                }}
                {...resizeHandleProps}
            />
        </Paper>
    );
}
