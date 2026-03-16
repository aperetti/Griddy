import { useState, type ReactNode, useEffect, useCallback } from 'react';
import { Paper, Group, Title, ActionIcon, Box, Button, Collapse } from '@mantine/core';
import { X, Filter, ChevronDown, ChevronUp, Maximize2, Download } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { useWindowEvent, useDebouncedCallback } from '@mantine/hooks';

interface AnalysisWindowProps {
    isOpen: boolean;
    onClose: () => void;
    onMinimize?: () => void;
    isMinimized?: boolean;
    title: string;
    storageKey: string;
    zIndex?: number;
    filterContent?: ReactNode;
    onExport?: () => void;
    children: ReactNode;
}

/**
 * Shared draggable/resizable analysis window used by both
 * ConsumptionTimeSeriesModal and VoltageDistributionModal.
 *
 * Key design decisions:
 * - The drag handle covers only the title area (left side of header).
 *   Action buttons sit OUTSIDE the handle so clicks reach them reliably.
 * - Initial size is clamped to the viewport so the window always fits on screen.
 * - Position & size are persisted to localStorage via `storageKey`.
 */
export function AnalysisWindow({
    isOpen,
    onClose,
    onMinimize,
    isMinimized,
    title,
    storageKey,
    zIndex = 1000,
    filterContent,
    onExport,
    children,
}: AnalysisWindowProps) {
    const [showFilters, setShowFilters] = useState<boolean>(false);

    const [rndState, setRndState] = useState(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Clamp saved position/size to current viewport
                return clampToViewport(parsed);
            } catch (e) {
                console.error(`Failed to parse saved ${storageKey}`, e);
            }
        }
        return defaultPosition();
    });

    const clamp = useCallback(() => {
        setRndState(prev => clampToViewport(prev));
    }, []);

    useWindowEvent('resize', clamp);

    // Also clamp on mount to ensure we fit if viewport changed while closed
    useEffect(() => {
        clamp();
    }, [clamp]);

    const saveState = useDebouncedCallback((state: any) => {
        localStorage.setItem(storageKey, JSON.stringify(state));
    }, 500);

    const handleRndChange = (d: any) => {
        const newState = { ...rndState, ...d };
        setRndState(newState);
        saveState(newState);
    };

    if (!isOpen || isMinimized) return null;

    return (
        <Rnd
            size={{ width: rndState.width, height: rndState.height }}
            position={{ x: rndState.x, y: rndState.y }}
            onDrag={(_e, d) => {
                handleRndChange({ x: d.x, y: d.y });
            }}
            onResize={(_e, _direction, ref, _delta, position) => {
                handleRndChange({
                    width: ref.offsetWidth,
                    height: ref.offsetHeight,
                    ...position,
                });
            }}
            minWidth={Math.min(400, window.innerWidth - 20)}
            minHeight={Math.min(400, window.innerHeight - 100)}
            bounds="window"
            dragHandleClassName="analysis-window-handle"
            enableResizing={{
                top: true, right: true, bottom: true, left: true,
                topRight: true, bottomRight: true, bottomLeft: true, topLeft: true
            }}
            style={{ zIndex }}
        >
            <Paper
                withBorder
                style={{
                    width: '100%',
                    height: '100%',
                    background: 'rgba(26, 27, 30, 0.95)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* ── Title bar ─────────────────────────────────── */}
                <Box
                    px="md"
                    py="xs"
                    style={{
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <Group justify="space-between" align="center" wrap="nowrap">
                        {/* Drag handle — only this part is draggable */}
                        <Box
                            className="analysis-window-handle"
                            style={{ cursor: 'grab', flex: 1, minWidth: 0 }}
                        >
                            <Group gap="xs" wrap="nowrap">
                                <Maximize2 size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                                <Title
                                    order={5}
                                    style={{
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        fontSize: window.innerWidth < 600 ? '14px' : undefined
                                    }}
                                >
                                    {title}
                                </Title>
                            </Group>
                        </Box>

                        {/* Action buttons — outside the drag handle */}
                        <Group wrap="nowrap" gap="xs" style={{ flexShrink: 0 }}>
                            {filterContent && (
                                <Button
                                    variant="subtle"
                                    size="xs"
                                    color="gray"
                                    leftSection={<Filter size={14} />}
                                    visibleFrom="xs"
                                    rightSection={
                                        showFilters ? (
                                            <ChevronUp size={14} />
                                        ) : (
                                            <ChevronDown size={14} />
                                        )
                                    }
                                    onClick={() => setShowFilters(!showFilters)}
                                >
                                    Filters
                                </Button>
                            )}
                            {filterContent && (
                                <ActionIcon 
                                    variant="subtle" 
                                    hiddenFrom="xs" 
                                    onClick={() => setShowFilters(!showFilters)}
                                    color={showFilters ? 'blue' : 'gray'}
                                >
                                    <Filter size={16} />
                                </ActionIcon>
                            )}
                            {onExport && (
                                <ActionIcon variant="subtle" onClick={onExport} title="Export Data">
                                    <Download size={16} />
                                </ActionIcon>
                            )}
                            {onMinimize && (
                                <ActionIcon variant="subtle" onClick={onMinimize} title="Minimize">
                                    <ChevronDown size={16} />
                                </ActionIcon>
                            )}
                            <ActionIcon variant="subtle" onClick={onClose} title="Close">
                                <X size={16} />
                            </ActionIcon>
                        </Group>
                    </Group>

                    {/* Collapsible filter section */}
                    {filterContent && (
                        <Collapse in={showFilters}>
                            <Box mt="md" mb="xs">
                                {filterContent}
                            </Box>
                        </Collapse>
                    )}
                </Box>

                {/* ── Content area ───────────────────────────────── */}
                <Box
                    style={{
                        flex: 1,
                        position: 'relative',
                        width: '100%',
                        overflow: 'hidden',
                        padding: '10px',
                    }}
                >
                    {children}
                </Box>
            </Paper>
        </Rnd>
    );
}

/* ── Helpers ─────────────────────────────────────────────── */

function defaultPosition() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(600, vw - 40);
    const height = Math.min(800, vh - 100);
    // Add a bit of randomness to default position so multiple new windows don't stack perfectly
    const offset = Math.floor(Math.random() * 40);
    return {
        x: Math.max(10, vw - width - 20 - offset),
        y: Math.max(10, Math.min(50 + offset, vh - height - 20)),
        width,
        height,
    };
}

function clampToViewport(pos: { x: number; y: number; width: number; height: number }) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(typeof pos.width === 'number' ? pos.width : parseInt(pos.width), vw - 20);
    const h = Math.min(typeof pos.height === 'number' ? pos.height : parseInt(pos.height), vh - 40);
    const x = Math.max(10, Math.min(pos.x, vw - w - 10));
    const y = Math.max(10, Math.min(pos.y, vh - h - 10));
    return { x, y, width: w, height: h };
}
