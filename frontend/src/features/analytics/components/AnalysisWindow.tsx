import { useState, type ReactNode, useEffect, useCallback, useRef } from 'react';
import { Paper, Group, Title, ActionIcon, Box, Button, Collapse, Tooltip } from '@mantine/core';
import { X, Filter, ChevronDown, ChevronUp, Maximize2, Download, Copy, Check } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { useWindowEvent, useDebouncedCallback } from '@mantine/hooks';
import { copyToClipboard } from '../../../shared/utils/exportUtils';

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
    onCopy?: () => string;
    children: ReactNode;
    loading?: boolean;
    onFocus?: () => void;
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
    onCopy,
    children,
    loading = false,
    onFocus,
}: AnalysisWindowProps) {
    const [showFilters, setShowFilters] = useState<boolean>(false);
    const [copied, setCopied] = useState(false);

    const [rndState, setRndState] = useState<{ x: number; y: number; width: string | number; height: string | number }>(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                return clampToViewport(parsed);
            } catch (e) {
                console.error(`Failed to parse saved ${storageKey}`, e);
            }
        }
        return defaultPosition();
    });

    const [isInitialMount, setIsInitialMount] = useState(true);
    const rndRef = useRef<any>(null);

    // After the first render OR when loading finishes, if the window was opened with 'auto' height, 
    // we should clamp it to ensure it hasn't overflowed the viewport.
    useEffect(() => {
        if ((isInitialMount || !loading) && rndRef.current) {
            const saved = localStorage.getItem(storageKey);

            // Give the browser a moment to render the charts after loading finishes
            const timer = setTimeout(() => {
                const node = rndRef.current.getSelfElement();
                if (node) {
                    // Try to finding the inner scroll area to get the true content height
                    const innerBox = node.querySelector('.analysis-window-content');
                    const header = node.querySelector('.analysis-window-header');

                    let targetHeight: number;
                    if (innerBox && header) {
                        // Header height + scrollHeight of content + some buffer
                        targetHeight = header.getBoundingClientRect().height + innerBox.scrollHeight + 40;
                    } else {
                        targetHeight = node.getBoundingClientRect().height;
                    }

                    // If we have a saved state, we should probably stick to it unless it's a new window
                    if (!saved || isInitialMount) {
                        const clamped = clampToViewport({
                            x: rndState.x,
                            y: rndState.y,
                            width: rndState.width === 'auto' ? (typeof rndState.width === 'number' ? rndState.width : 600) : rndState.width,
                            height: targetHeight,
                        });
                        if (clamped.height !== rndState.height || clamped.width !== rndState.width || clamped.x !== rndState.x || clamped.y !== rndState.y) {
                            setRndState(clamped);
                        }
                    }
                }
                if (!loading) setIsInitialMount(false);
            }, loading ? 0 : 300); // 300ms delay after loading finishes to allow charts to render

            return () => clearTimeout(timer);
        }
    }, [isInitialMount, loading, rndState.x, rndState.y, rndState.width, rndState.height, storageKey]);

    const clamp = useCallback(() => {
        setRndState(prev => {
            const clamped = clampToViewport(prev);
            if (clamped.x === prev.x && clamped.y === prev.y && clamped.width === prev.width && clamped.height === prev.height) {
                return prev;
            }
            return clamped;
        });
    }, []);

    useWindowEvent('resize', clamp);

    // Also clamp on mount to ensure we fit if viewport changed while closed
    useEffect(() => {
        if (!isInitialMount) {
            clamp();
        }
    }, [clamp, isInitialMount]);

    const saveState = useDebouncedCallback((state: any) => {
        localStorage.setItem(storageKey, JSON.stringify(state));
    }, 500);

    const handleRndChange = (d: any) => {
        const newState = clampToViewport({ ...rndState, ...d });
        setRndState(newState);
        saveState(newState);
    };

    const handleCopy = () => {
        if (!onCopy) return;

        try {
            const text = onCopy();
            if (!text) return;

            // Call copyToClipboard. Even though it's async, 
            // the initial part (including the sync fallback) will run synchronously.
            copyToClipboard(text).then(success => {
                if (success) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                }
            });
        } catch (err) {
            console.error('Failed to copy analysis data:', err);
        }
    };

    if (!isOpen || isMinimized) return null;

    return (
        <Rnd
            ref={rndRef}
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
            minHeight={200}
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
                onMouseDown={(e) => {
                    // Don't trigger focus/bring-to-front if clicking on interactive elements
                    // which might need their own event handling (like color pickers or selects)
                    const target = e.target as HTMLElement;
                    const isInteractive = target.closest('button, input, select, textarea, [role="button"], [role="menuitem"]');
                    if (!isInteractive) {
                        onFocus?.();
                    }
                }}
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
                    className="analysis-window-header"
                    style={{
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        flexDirection: 'column',
                        flexShrink: 0,
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
                            {onCopy && (
                                <Tooltip label={copied ? "Copied!" : "Copy to Clipboard"} withArrow position="bottom">
                                    <ActionIcon
                                        variant="subtle"
                                        onClick={handleCopy}
                                        color={copied ? "green" : "gray"}
                                    >
                                        {copied ? <Check size={16} /> : <Copy size={16} />}
                                    </ActionIcon>
                                </Tooltip>
                            )}
                            {onExport && (
                                <Tooltip label="Download JSON/CSV" withArrow position="bottom">
                                    <ActionIcon variant="subtle" onClick={onExport}>
                                        <Download size={16} />
                                    </ActionIcon>
                                </Tooltip>
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
                    className="analysis-window-content"
                    style={{
                        flex: 1,
                        position: 'relative',
                        width: '100%',
                        overflow: 'auto', // Changed from overflow: hidden to allow content scaling
                        padding: '10px',
                        minHeight: loading ? 300 : undefined, // Prevent "too tight" loading state
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
    
    // Safety margin at the top to avoid overlap with fixed UI (search, toolbar, asset bar)
    const topMargin = 180;
    
    const width = Math.min(800, vw - 40); // Max 800px or full width minus margins
    const height = 'auto';

    return {
        x: Math.max(20, (vw - width) / 2),
        y: Math.max(topMargin + 20, vh - 600),
        width,
        height,
    };
}

function clampToViewport(pos: { x: number; y: number; width: number | string; height: number | string }) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topMargin = 180;

    // 1. Clamp Width
    const maxW = vw - 20;
    let w: number;
    if (typeof pos.width === 'number') {
        w = Math.min(pos.width, maxW);
    } else if (pos.width === 'auto') {
        w = Math.min(800, maxW);
    } else {
        w = Math.min(parseInt(pos.width) || 800, maxW);
    }
    w = Math.max(300, w); // Min width safety

    // 2. Clamp Height
    const maxH = vh - topMargin - 20;
    let h: number | 'auto';
    if (pos.height === 'auto') {
        h = 'auto';
    } else if (typeof pos.height === 'number') {
        h = Math.min(pos.height, maxH);
    } else {
        h = Math.min(parseInt(pos.height) || 400, maxH);
    }
    if (typeof h === 'number') h = Math.max(200, h); // Min height safety

    // 3. Clamp Position
    const maxX = Math.max(10, vw - w - 10);
    const x = Math.max(10, Math.min(pos.x, maxX));

    const effectiveH = typeof h === 'number' ? h : 400;
    const maxY = Math.max(topMargin + 10, vh - effectiveH - 10);
    const y = Math.max(topMargin + 10, Math.min(pos.y, maxY));

    return { x, y, width: w, height: h };
}
