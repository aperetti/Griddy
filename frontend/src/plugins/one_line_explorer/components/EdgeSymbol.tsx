/**
 * ANSI/IEEE standard equipment symbols for one-line diagrams.
 *
 * Symbols are centred at (symbolX, symbolY) on the connecting wire.
 * A background rect blanks the wire beneath each symbol so the
 * symbol reads cleanly without overlapping strokes.
 */
import type { LayoutEdge } from '../model/OneLineModel';

const BG = '#0a0a0a';

// ── Individual symbol renderers ───────────────────────────────────

function TransformerSymbol({ x, y, color }: { x: number; y: number; color: string }) {
    // ANSI: two tangent circles stacked vertically on the wire
    const r = 10;
    return (
        <g>
            <rect x={x - r - 2} y={y - r * 2 - 2} width={r * 2 + 4} height={r * 4 + 4} fill={BG} />
            <circle cx={x} cy={y - r} r={r} fill="none" stroke={color} strokeWidth={1.8} />
            <circle cx={x} cy={y + r} r={r} fill="none" stroke={color} strokeWidth={1.8} />
        </g>
    );
}

function BreakerSymbol({ x, y, color }: { x: number; y: number; color: string }) {
    // ANSI: solid filled square
    const s = 7;
    return (
        <g>
            <rect x={x - s - 1} y={y - s - 1} width={(s + 1) * 2} height={(s + 1) * 2} fill={BG} />
            <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={color} />
        </g>
    );
}

function RecloserSymbol({ x, y, color }: { x: number; y: number; color: string }) {
    // ANSI: solid square with a small arc inside (distinguishes from plain breaker)
    const s = 7;
    return (
        <g>
            <rect x={x - s - 1} y={y - s - 1} width={(s + 1) * 2} height={(s + 1) * 2} fill={BG} />
            <rect x={x - s} y={y - s} width={s * 2} height={s * 2} fill={color} />
            <path
                d={`M ${x - 4} ${y + 3} A 4 4 0 0 0 ${x + 4} ${y + 3}`}
                fill="none"
                stroke={BG}
                strokeWidth={1.2}
            />
        </g>
    );
}

function FuseSymbol({ x, y, color }: { x: number; y: number; color: string }) {
    // ANSI: hollow rectangle with a break-element line inside
    const w = 8, h = 16;
    return (
        <g>
            <rect x={x - w - 1} y={y - h - 1} width={(w + 1) * 2} height={(h + 1) * 2} fill={BG} />
            <rect x={x - w} y={y - h} width={w * 2} height={h * 2} fill={BG} stroke={color} strokeWidth={1.5} />
            {/* Fuse element: small S-curve */}
            <path
                d={`M ${x} ${y - 6} Q ${x + 5} ${y - 2} ${x} ${y + 2} Q ${x - 5} ${y + 6} ${x} ${y + 6}`}
                fill="none"
                stroke={color}
                strokeWidth={1.2}
            />
        </g>
    );
}

function DisconnectorSymbol({ x, y, isOpen, color }: { x: number; y: number; isOpen: boolean; color: string }) {
    // ANSI: knife-blade disconnect switch
    // Two terminal dots + a blade (angled = open, straight = closed)
    const termR = 2.5;
    const bladeLen = 12;
    return (
        <g>
            <rect x={x - 14} y={y - 16} width={28} height={32} fill={BG} />
            {/* Upper terminal */}
            <circle cx={x} cy={y - 12} r={termR} fill={color} />
            {/* Lower terminal */}
            <circle cx={x} cy={y + 12} r={termR} fill={color} />
            {/* Blade */}
            {isOpen ? (
                <line
                    x1={x} y1={y - 10}
                    x2={x + bladeLen} y2={y - 10 + bladeLen * 0.6}
                    stroke={color} strokeWidth={2}
                />
            ) : (
                <line
                    x1={x} y1={y - 10}
                    x2={x} y2={y + 10}
                    stroke={color} strokeWidth={2}
                />
            )}
        </g>
    );
}

function LoadBreakSwitchSymbol({ x, y, isOpen, color }: { x: number; y: number; isOpen: boolean; color: string }) {
    // ANSI: like disconnector but with a box around the blade (load-break rated)
    const termR = 2.5;
    return (
        <g>
            <rect x={x - 10} y={y - 16} width={20} height={32} fill={BG} />
            <circle cx={x} cy={y - 12} r={termR} fill={color} />
            <circle cx={x} cy={y + 12} r={termR} fill={color} />
            {/* Switch box */}
            <rect x={x - 7} y={y - 8} width={14} height={16} fill={BG} stroke={color} strokeWidth={1.2} />
            {/* Blade inside box */}
            {isOpen ? (
                <line x1={x - 4} y1={y + 5} x2={x + 4} y2={y - 5} stroke={color} strokeWidth={1.5} />
            ) : (
                <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke={color} strokeWidth={1.5} />
            )}
        </g>
    );
}

function LineSegmentMarker({ x, y, color }: { x: number; y: number; color: string }) {
    // Subtle diagonal tick mark — identifies an ACLineSegment on the wire
    return (
        <line x1={x - 6} y1={y - 4} x2={x + 6} y2={y + 4} stroke={color} strokeWidth={1.5} />
    );
}

// ── Dispatch ──────────────────────────────────────────────────────

const TRANSFORMER_TYPES = new Set(['PowerTransformer', 'Regulator', 'TransformerTank']);

export function EdgeSymbol({ edge }: { edge: LayoutEdge }) {
    const { symbolX: x, symbolY: y, color, data } = edge;
    const et = data.edge_type;

    if (TRANSFORMER_TYPES.has(et)) {
        return <TransformerSymbol x={x} y={y} color={color} />;
    }
    if (et === 'Recloser') {
        return <RecloserSymbol x={x} y={y} color={color} />;
    }
    if (et === 'Breaker' || et === 'CircuitBreaker') {
        return <BreakerSymbol x={x} y={y} color={color} />;
    }
    if (et === 'Fuse') {
        return <FuseSymbol x={x} y={y} color={color} />;
    }
    if (et === 'Disconnector') {
        return <DisconnectorSymbol x={x} y={y} isOpen={data.is_open} color={color} />;
    }
    if (et === 'LoadBreakSwitch') {
        return <LoadBreakSwitchSymbol x={x} y={y} isOpen={data.is_open} color={color} />;
    }
    if (et === 'ACLineSegment') {
        return <LineSegmentMarker x={x} y={y} color={color} />;
    }
    return null;
}
