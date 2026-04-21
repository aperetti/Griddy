import type { Node, Edge } from '../../../shared/types';

export const SWITCH_EDGE_TYPES = new Set(['Breaker', 'LoadBreakSwitch', 'Fuse', 'Disconnector', 'Recloser', 'Sectionaliser', 'Switch']);

export const getBearing = (start: [number, number], end: [number, number]): number => {
    let dLon = end[0] - start[0];
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    
    const avgLat = ((start[1] + end[1]) / 2 * Math.PI) / 180;
    const dx = dLon * Math.cos(avgLat);
    const dy = end[1] - start[1];
    
    // Deck.gl getAngle is counter-clockwise, so we negate the clockwise bearing
    // and add 90 degrees to make the icon perpendicular to the line
    const bearingCW = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
    return (360 - bearingCW + 90) % 360;
};

export const stringToColor = (str: string): [number, number, number] => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    const hex = '00000'.substring(0, 6 - c.length) + c;
    const r = Math.floor((parseInt(hex.substring(0, 2), 16) + 150) / 2);
    const g = Math.floor((parseInt(hex.substring(2, 4), 16) + 150) / 2);
    const b = Math.floor((parseInt(hex.substring(4, 6), 16) + 150) / 2);
    return [r, g, b];
};

export const getVisualType = (node: Node): string => {
    if (node.display_type) return node.display_type;
    if (node.type === 'Substation') return 'Substation';
    const attached = node.attached_equipment ?? [];
    if (attached.some(eq => eq.type === 'EnergySource')) return 'Substation';
    if (attached.some(eq => eq.type === 'EnergyConsumer')) return 'Meter';
    if (attached.some(eq => eq.type === 'Capacitor')) return 'Capacitor';
    return 'Bus';
};

export const getNodeColor = (node: Node, visualType: string, isHighlighted: boolean, isSelected: boolean, circuitId?: string): [number, number, number] => {
    if (isSelected) return [255, 200, 50];
    if (isHighlighted) return [60, 160, 240];
    if (node.display_color) {
        const hex = node.display_color.replace('#', '');
        if (hex.length === 6) {
            return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
        }
    }
    if (circuitId && circuitId !== 'unknown') return stringToColor(circuitId);
    switch (visualType) {
        case 'Substation': return [255, 50, 50];
        case 'Meter':      return [100, 255, 100];
        case 'Capacitor':  return [255, 210, 80];
        case 'Regulator':  return [255, 120, 0];
        case 'Recloser':   return [0, 200, 255];
        default:           return [200, 200, 200];
    }
};

export const getEdgeColor = (edge: Edge, isHighlighted: boolean, isHovered: boolean, circuitId?: string): [number, number, number] => {
    if (isHighlighted) return [60, 160, 240];
    if (isHovered) return [255, 255, 255];
    if (edge.display_color) {
        const hex = edge.display_color.replace('#', '');
        if (hex.length === 6) {
            return [parseInt(hex.substring(0, 2), 16), parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(4, 6), 16)];
        }
    }
    if (edge.edge_type && SWITCH_EDGE_TYPES.has(edge.edge_type)) {
        return edge.is_open ? [255, 107, 107] : [105, 219, 124];
    }
    if (circuitId && circuitId !== 'unknown') return stringToColor(circuitId);
    return [150, 150, 150];
};

export const getPathMidpoint = (path: [number, number][]): { position: [number, number], bearing: number, segmentIndex: number } => {
    if (path.length < 2) return { position: path[0] || [0, 0], bearing: 0, segmentIndex: 0 };
    
    let totalLength = 0;
    const segments: { start: [number, number], end: [number, number], len: number }[] = [];
    for (let i = 0; i < path.length - 1; i++) {
        const start = path[i];
        const end = path[i+1];
        const dx = (end[0] - start[0]) * Math.cos((start[1] * Math.PI) / 180);
        const dy = end[1] - start[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        segments.push({ start, end, len });
        totalLength += len;
    }
    
    let halfLen = totalLength / 2;
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.len === 0) continue;
        if (halfLen <= seg.len) {
            const ratio = halfLen / seg.len;
            const pos: [number, number] = [
                seg.start[0] + (seg.end[0] - seg.start[0]) * ratio,
                seg.start[1] + (seg.end[1] - seg.start[1]) * ratio
            ];
            const bearing = getBearing(seg.start, seg.end);
            return { position: pos, bearing, segmentIndex: i };
        }
        halfLen -= seg.len;
    }
    
    return { position: path[path.length - 1], bearing: 0, segmentIndex: segments.length - 1 };
};

export const edgeMidpoint = (d: Edge): [number, number] => {
    if (d.waypoints && d.waypoints.length >= 2) {
        return getPathMidpoint(d.waypoints).position;
    }
    return [
        (d.sourcePosition[0] + d.targetPosition[0]) / 2,
        (d.sourcePosition[1] + d.targetPosition[1]) / 2,
    ];
};
