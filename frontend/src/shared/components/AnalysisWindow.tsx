import { useState, type ReactNode, useCallback, useRef, memo } from 'react';
import { Paper, Group, Title, ActionIcon, Box, Button, Collapse, Tooltip } from '@mantine/core';
import { X, Filter, ChevronDown, ChevronUp, Maximize2, Download, Copy, Check, Pin, PinOff } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { useWindowEvent, useDebouncedCallback } from '@mantine/hooks';
import { copyToClipboard } from '../utils/exportUtils';

interface AnalysisWindowProps {
    isOpen: boolean;
    onClose: () => void;
    onMinimize?: () => void;
    isMinimized?: boolean;
    title: ReactNode;
    storageKey: string;
    zIndex?: number;
    filterContent?: ReactNode;
    onExport?: () => void;
    onCopy?: () => string;
    children: ReactNode;
    loading?: boolean;
    onFocus?: () => void;
    layoutMode?: 'floating' | 'grid';
    initialWidth?: number | string;
    initialHeight?: number | string;
    /** Override styles on the content wrapper (e.g. disable scroll/padding for canvas children). */
    contentStyle?: React.CSSProperties;
}

/**
 * Shared analysis window used for both floating and grid-based layouts.
 * 
 * In 'floating' mode (default), use react-rnd for drag/resize.
 * In 'grid' mode, render as a static card with fixed height.
 */
function AnalysisWindowComponent({
    isOpen,
    onClose,
    onMinimize,
    isMinimized,
    title,
    storageKey,
    zIndex = 2500, // Higher default to stay above overlays
    filterContent,
    onExport,
    onCopy,
    children,
    loading = false,
    onFocus,
    layoutMode = 'floating',
    initialWidth,
    initialHeight,
    contentStyle,
}: AnalysisWindowProps) {
    const [showFilters, setShowFilters] = useState<boolean>(false);
    const [copied, setCopied] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const preMaximizeState = useRef<typeof rndState | null>(null);

    const [rndState, setRndState] = useState<{ x: number; y: number; width: string | number; height: string | number }>(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const clamped = clampToViewport(parsed);
                // IF CLAMPING MOVED IT, or if dimensions are suspicious (too small), reset to default center
                const significantlyMoved = Math.abs(clamped.x - parsed.x) > 50 || Math.abs(clamped.y - (parsed.y ?? 0)) > 50;
                const tooSmall = (typeof clamped.width === 'number' && clamped.width < 100) || 
                               (typeof clamped.height === 'number' && clamped.height < 100);
                
                if (!significantlyMoved && !tooSmall) return clamped;
            } catch (e) {
                console.error(`Failed to parse saved ${storageKey}`, e);
            }
            localStorage.removeItem(storageKey);
        }
        return defaultPosition(initialWidth, initialHeight);
    });

    const rndRef = useRef<any>(null);

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

    const saveState = useDebouncedCallback((state: any) => {
        localStorage.setItem(storageKey, JSON.stringify(state));
    }, 500);

    const handleRndChange = (d: any) => {
        const newState = clampToViewport({ ...rndState, ...d });
        setRndState(newState);
        saveState(newState);
        if (isMaximized) {
            setIsMaximized(false);
            preMaximizeState.current = null;
        }
    };

    const handleMaximize = () => {
        if (isMaximized && preMaximizeState.current) {
            const restored = preMaximizeState.current;
            preMaximizeState.current = null;
            setIsMaximized(false);
            setRndState(restored);
            saveState(restored);
        } else {
            preMaximizeState.current = rndState;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const topMargin = vh < 600 ? 40 : 80;
            const margin = 10;
            const maximized = {
                x: margin,
                y: topMargin + margin,
                width: vw - margin * 2,
                height: vh - topMargin - margin * 2,
            };
            setIsMaximized(true);
            setRndState(maximized);
            saveState(maximized);
        }
    };

    const handleCopy = () => {
        if (!onCopy) return;

        try {
            const text = onCopy();
            if (!text) return;

            copyToClipboard(text).then((success: boolean) => {
                if (success) {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                }
            });
        } catch (err) {
            console.error('Failed to copy analysis data:', err);
        }
    };

    const windowContent = (
        <Paper
            withBorder
            onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                const isInteractive = target.closest('button, input, select, textarea, [role="button"], [role="menuitem"]');
                if (!isInteractive) {
                    onFocus?.();
                }
            }}
            style={{
                width: '100%',
                height: layoutMode === 'grid' ? '450px' : '100%',
                background: 'rgba(28, 29, 33, 0.99)', // More opaque to look like a solid box
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.6)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                position: 'relative',
            }}
        >
            {/* Header */}
            <Box
                px="md"
                py="xs"
                className="analysis-window-header"
                style={{
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0,
                    userSelect: 'none'
                }}
            >
                <Group justify="space-between" align="center" wrap="nowrap">
                    <Box
                        className={layoutMode === 'floating' ? "analysis-window-handle" : ""}
                        style={{ cursor: layoutMode === 'floating' ? 'grab' : 'default', flex: 1, minWidth: 0 }}
                    >
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
                    </Box>

                    <Group wrap="nowrap" gap="xs" style={{ flexShrink: 0 }}>
                        {filterContent && (
                            <Button
                                variant="subtle"
                                size="xs"
                                color="gray"
                                leftSection={<Filter size={14} />}
                                visibleFrom="xs"
                                rightSection={showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                onClick={() => setShowFilters(!showFilters)}
                            >
                                Filters
                            </Button>
                        )}
                        {filterContent && (
                            <ActionIcon variant="subtle" hiddenFrom="xs" onClick={() => setShowFilters(!showFilters)}>
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
                            <Tooltip label="Download JSON/CSV" withArrow position="bottom" withinPortal zIndex={zIndex + 100}>
                                <ActionIcon variant="subtle" onClick={onExport}>
                                    <Download size={16} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        
                        {layoutMode === 'floating' && (
                            <Tooltip label={isMaximized ? "Restore" : "Maximize"} withArrow position="bottom" withinPortal zIndex={zIndex + 100}>
                                <ActionIcon variant={isMaximized ? "filled" : "subtle"} color={isMaximized ? "blue" : "gray"} onClick={handleMaximize}>
                                    <Maximize2 size={16} />
                                </ActionIcon>
                            </Tooltip>
                        )}

                        {onMinimize && (
                            <Tooltip label={isMinimized ? "Unpin (Expand)" : "Pin (Collapse)"} withArrow position="bottom" withinPortal zIndex={zIndex + 100}>
                                <ActionIcon 
                                    variant={isMinimized ? "filled" : "subtle"} 
                                    onClick={onMinimize} 
                                    color={isMinimized ? "blue" : "gray"}
                                >
                                    {isMinimized ? <PinOff size={16} /> : <Pin size={16} />}
                                </ActionIcon>
                            </Tooltip>
                        )}
                        
                        <ActionIcon variant="subtle" onClick={onClose} title="Close" color="gray">
                            <X size={16} />
                        </ActionIcon>
                    </Group>
                </Group>

                {filterContent && (
                    <Collapse in={showFilters}>
                        <Box mt="md" mb="xs">
                            {filterContent}
                        </Box>
                    </Collapse>
                )}
            </Box>

            {/* Content Area */}
                {!isMinimized && (
                    <Box
                        className="analysis-window-content"
                        style={{
                            flex: 1,
                            position: 'relative',
                            width: '100%',
                            overflow: 'auto',
                            padding: '10px',
                            minHeight: loading ? 200 : 100,
                            ...contentStyle,
                        }}
                    >
                        {children}
                    </Box>
                )}
        </Paper>
    );

    if (!isOpen) return null;

    if (layoutMode === 'grid') {
        return windowContent;
    }

    return (
        <Rnd
            ref={rndRef}
            size={{ 
                width: rndState.width, 
                height: isMinimized ? 'auto' : rndState.height 
            }}
            position={{ x: rndState.x, y: rndState.y }}
            onDrag={(_e, d) => handleRndChange({ x: d.x, y: d.y })}
            onResize={(_e, _direction, ref, _delta, position) => {
                if (isMinimized) return;
                handleRndChange({
                    width: ref.offsetWidth,
                    height: ref.offsetHeight,
                    ...position,
                });
            }}
            minWidth={300}
            minHeight={isMinimized ? 0 : 200}
            bounds="parent"
            dragHandleClassName="analysis-window-handle"
            enableResizing={isMinimized ? false : {
                top: true, right: true, bottom: true, left: true,
                topRight: true, bottomRight: true, bottomLeft: true, topLeft: true
            }}
            style={{ 
                zIndex,
                pointerEvents: isMinimized ? 'none' : 'auto'
            }}
        >
            <div style={{ pointerEvents: 'auto', width: '100%', height: '100%' }}>
                {windowContent}
            </div>
        </Rnd>
    );
}

/* ── Helpers ─────────────────────────────────────────────── */

function defaultPosition(initialWidth?: number | string, initialHeight?: number | string) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topMargin = vh < 600 ? 50 : 100;
    
    // Width
    let width: number;
    if (initialWidth !== undefined) {
        width = typeof initialWidth === 'number' ? initialWidth : parseInt(initialWidth.toString());
    } else {
        width = Math.min(900, vw - 40);
    }
    width = Math.min(width, vw - 40);
    
    // Height
    let height: number;
    if (initialHeight !== undefined) {
        height = typeof initialHeight === 'number' ? initialHeight : parseInt(initialHeight.toString());
    } else {
        height = Math.min(vh - topMargin - 40, 700);
    }
    height = Math.min(height, vh - topMargin - 40);

    return {
        x: Math.max(20, (vw - width) / 2),
        y: Math.max(topMargin + 20, (vh - height) / 2 + 50),
        width,
        height,
    };
}

function clampToViewport(pos: { x: number; y: number; width: number | string; height: number | string }) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topMargin = vh < 600 ? 40 : 80;

    // Width
    const maxW = vw - 20;
    let w: number;
    if (typeof pos.width === 'number') {
        w = Math.min(pos.width, maxW);
    } else if (pos.width === 'auto') {
        w = Math.min(800, maxW);
    } else {
        w = Math.min(parseInt(pos.width) || 800, maxW);
    }
    w = Math.max(300, w);

    // Height
    const maxH = vh - topMargin - 20;
    let h: number | 'auto';
    if (pos.height === 'auto') {
        h = Math.min(600, maxH); // Cap auto heights to something sensible
    } else if (typeof pos.height === 'number') {
        h = Math.min(pos.height, maxH);
    } else {
        h = Math.min(parseInt(pos.height) || 400, maxH);
    }
    if (typeof h === 'number') h = Math.max(200, h);

    // Position X
    const maxX = Math.max(10, vw - w - 10);
    const x = Math.max(10, Math.min(pos.x, maxX));

    // Position Y
    const effectiveH = typeof h === 'number' ? h : 400;
    const maxY = Math.max(topMargin + 10, vh - effectiveH - 10);
    const y = Math.max(topMargin + 10, Math.min(pos.y, maxY));

    return { x, y, width: w, height: h };
}

export const AnalysisWindow = memo(AnalysisWindowComponent);
