import { useState, useRef, useCallback } from 'react';

interface UseResizeHandleOptions {
    storageKey: string;
    defaultHeight: number;
    minHeight?: number;
    maxHeight?: number;
}

interface DragState {
    startY: number;
    startHeight: number;
}

/**
 * Hook that manages vertical resize via pointer events.
 * Persists the height to localStorage keyed by `storageKey`.
 * Returns the current height and pointer-event props to spread onto a resize handle element.
 */
export function useResizeHandle({
    storageKey,
    defaultHeight,
    minHeight = 100,
    maxHeight = 1200,
}: UseResizeHandleOptions) {
    const [height, setHeight] = useState<number>(() => {
        try {
            const saved = localStorage.getItem(`chart-panel-${storageKey}`);
            if (saved != null) {
                const parsed = JSON.parse(saved);
                if (typeof parsed === 'number' && !isNaN(parsed)) {
                    return Math.max(minHeight, Math.min(maxHeight, parsed));
                }
            }
        } catch {
            // Corrupt value — fall through to default
        }
        return defaultHeight;
    });

    const dragRef = useRef<DragState | null>(null);

    const persistHeight = useCallback(
        (h: number) => {
            try {
                localStorage.setItem(`chart-panel-${storageKey}`, JSON.stringify(h));
            } catch {
                // storage full or unavailable — silently ignore
            }
        },
        [storageKey],
    );

    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();
            const el = e.currentTarget as HTMLElement;
            el.setPointerCapture(e.pointerId);
            dragRef.current = { startY: e.clientY, startHeight: height };
        },
        [height],
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!dragRef.current) return;
            const delta = e.clientY - dragRef.current.startY;
            const newHeight = Math.max(minHeight, Math.min(maxHeight, dragRef.current.startHeight + delta));
            setHeight(newHeight);
        },
        [minHeight, maxHeight],
    );

    const onPointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (!dragRef.current) return;
            try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                // capture already released
            }
            const finalHeight = height;
            persistHeight(finalHeight);
            dragRef.current = null;
        },
        [height, persistHeight],
    );

    const onPointerCancel = useCallback(
        (e: React.PointerEvent) => {
            if (!dragRef.current) return;
            try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                // capture already released
            }
            // Revert to start height on cancel
            setHeight(dragRef.current.startHeight);
            dragRef.current = null;
        },
        [],
    );

    const resetHeight = useCallback(() => {
        setHeight(defaultHeight);
        persistHeight(defaultHeight);
    }, [defaultHeight, persistHeight]);

    return {
        height,
        resetHeight,
        resizeHandleProps: {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
        },
    };
}
