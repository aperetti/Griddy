import { useState, useCallback } from 'react';

// Global state for z-index to coordinate between instances without complex context
let globalMaxZIndex = 1100;

/**
 * Simple hook to manage z-index for draggable windows.
 * Calling bringToFront() will increment the global counter and return the new value.
 */
export function useZIndex(initialZIndex = 1100) {
    const [zIndex, setZIndex] = useState(initialZIndex);

    const bringToFront = useCallback(() => {
        globalMaxZIndex += 1;
        setZIndex(globalMaxZIndex);
        return globalMaxZIndex;
    }, []);

    return { zIndex, bringToFront };
}
