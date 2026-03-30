import { useState, useRef, useCallback } from 'react';
import type { Node, Edge } from '../../../shared/types';
import { fetchCimEquipmentExpanded, fetchCimNode } from '../../../shared/api';

export interface HoverInfo {
    x: number;
    y: number;
    obj: Node | Edge;
}

export function useCimTooltip() {
    const [cimCache, setCimCache] = useState<Record<string, any>>({});
    const pendingFetches = useRef(new Set<string>());
    const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

    const onTooltipHover = useCallback((obj: Node | Edge | null, x: number, y: number) => {
        if (!obj?.display_tooltip) {
            setHoverInfo(null);
            return;
        }
        const id = obj.id;
        if (!id) { setHoverInfo(null); return; }

        setHoverInfo({ x, y, obj });

        if (!cimCache[id] && !pendingFetches.current.has(id)) {
            pendingFetches.current.add(id);
            const isNode = 'position' in obj;
            (isNode ? fetchCimNode(id) : fetchCimEquipmentExpanded(id))
                .then(data => setCimCache(prev => ({ ...prev, [id]: data })))
                .catch(() => {})
                .finally(() => { pendingFetches.current.delete(id); });
        }
    }, [cimCache]);

    const clearTooltipHover = useCallback(() => setHoverInfo(null), []);

    return { cimCache, hoverInfo, onTooltipHover, clearTooltipHover };
}
