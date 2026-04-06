/**
 * Pannable / zoomable SVG canvas for the one-line diagram.
 *
 * Interaction model:
 *  - Mouse wheel  → zoom centred on cursor
 *  - Mouse drag   → pan
 *  - 1-finger touch → pan
 *  - 2-finger pinch → zoom + pan by midpoint
 *  - Zoom buttons  → +, −, fit-to-view
 *
 * On mount (and whenever the layout changes) the diagram is automatically
 * scaled and centred so the whole diagram is visible.
 */
import { useRef, useCallback, useState, useEffect } from 'react';
import type { DiagramLayout, LayoutEdge } from '../model/OneLineModel';
import { BUS_W, BUS_H } from '../model/OneLineModel';
import { EdgeSymbol } from './EdgeSymbol';
import { CimAttributePopup } from './CimAttributePopup';

const BG          = '#0a0a0a';
const WIRE_WIDTH  = 2;
const MIN_SCALE   = 0.08;
const MAX_SCALE   = 6;

interface Props {
    layout: DiagramLayout;
}

// ── Fit helper ────────────────────────────────────────────────────────────────

function calcFit(
    containerW: number,
    containerH: number,
    totalWidth:  number,
    totalHeight: number,
) {
    const s     = Math.min(containerW / totalWidth, containerH / totalHeight) * 0.9;
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    return {
        scale,
        tx: (containerW  - totalWidth  * scale) / 2,
        ty: (containerH - totalHeight * scale) / 2,
    };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OneLineDiagramSvg({ layout }: Props) {
    const { nodes, edges, totalWidth, totalHeight } = layout;
    const containerRef = useRef<HTMLDivElement>(null);

    const [tx, setTx]       = useState(0);
    const [ty, setTy]       = useState(0);
    const [scale, setScale] = useState(1);
    const [selection, setSelection] = useState<{
        id: string;
        type: 'node' | 'equipment';
        anchorEl: HTMLElement;
        /** Populated for virtual collapsed edges so popup renders without an API call. */
        virtualEdge?: LayoutEdge;
    } | null>(null);

    // ── Auto-fit on layout change ─────────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el || totalWidth === 0 || totalHeight === 0) return;
        const fit = calcFit(el.offsetWidth, el.offsetHeight, totalWidth, totalHeight);
        setTx(fit.tx);
        setTy(fit.ty);
        setScale(fit.scale);
    }, [totalWidth, totalHeight]);

    const fitView = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const fit = calcFit(el.offsetWidth, el.offsetHeight, totalWidth, totalHeight);
        setTx(fit.tx);
        setTy(fit.ty);
        setScale(fit.scale);
    }, [totalWidth, totalHeight]);

    // ── Native wheel zoom (cursor-centred) ────────────────────────────────────
    // Handled via a non-passive native listener so preventDefault reliably stops
    // any parent scroll container, regardless of React's passive-event defaults.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const rect   = el.getBoundingClientRect();
            const mx     = e.clientX - rect.left;
            const my     = e.clientY - rect.top;
            setScale(s => {
                const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * factor));
                setTx(x => mx - (mx - x) * (ns / s));
                setTy(y => my - (my - y) * (ns / s));
                return ns;
            });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []); // intentionally empty — stable setState setters, no external deps

    // ── Mouse pan (window-level listeners so fast drags don't drop) ───────────
    const dragging  = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        // Don't start a drag when clicking a selectable element (node / edge)
        if ((e.target as Element).closest('[data-clickable="true"]')) return;
        e.preventDefault();
        dragging.current  = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };

        const onMove = (ev: MouseEvent) => {
            if (!dragging.current) return;
            setTx(x => x + ev.clientX - lastMouse.current.x);
            setTy(y => y + ev.clientY - lastMouse.current.y);
            lastMouse.current = { x: ev.clientX, y: ev.clientY };
        };
        const onUp = () => {
            dragging.current = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup',   onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup',   onUp);
    }, []);

    // ── Touch pan + pinch-zoom ────────────────────────────────────────────────
    const lastTouches = useRef<React.Touch[]>([]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onTouchMove = (e: TouchEvent) => {
            e.preventDefault();
            const touches = Array.from(e.touches);
            const prev    = lastTouches.current;
            if (touches.length === 1 && prev.length >= 1) {
                setTx(x => x + touches[0].clientX - prev[0].clientX);
                setTy(y => y + touches[0].clientY - prev[0].clientY);
            } else if (touches.length === 2 && prev.length === 2) {
                const prevDist = Math.hypot(prev[1].clientX - prev[0].clientX, prev[1].clientY - prev[0].clientY);
                const currDist = Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
                if (prevDist > 0) {
                    const factor = currDist / prevDist;
                    setScale(s => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * factor)));
                }
                const pmx = (prev[0].clientX + prev[1].clientX) / 2;
                const pmy = (prev[0].clientY + prev[1].clientY) / 2;
                const cmx = (touches[0].clientX + touches[1].clientX) / 2;
                const cmy = (touches[0].clientY + touches[1].clientY) / 2;
                setTx(x => x + cmx - pmx);
                setTy(y => y + cmy - pmy);
            }
            lastTouches.current = touches;
        };
        const onTouchStart = (e: TouchEvent) => { lastTouches.current = Array.from(e.touches); };
        const onTouchEnd   = (e: TouchEvent) => { lastTouches.current = Array.from(e.touches); };
        el.addEventListener('touchstart', onTouchStart, { passive: true  });
        el.addEventListener('touchmove',  onTouchMove,  { passive: false });
        el.addEventListener('touchend',   onTouchEnd,   { passive: true  });
        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove',  onTouchMove);
            el.removeEventListener('touchend',   onTouchEnd);
        };
    }, []); // intentionally empty — stable setState setters

    // ── Zoom button handlers ──────────────────────────────────────────────────
    const zoomIn  = useCallback(() => setScale(s => Math.min(MAX_SCALE, s * 1.3)), []);
    const zoomOut = useCallback(() => setScale(s => Math.max(MIN_SCALE, s / 1.3)), []);

    const onNodeClick = useCallback((e: React.MouseEvent, nodeId: string) => {
        e.stopPropagation();
        setSelection({ id: nodeId, type: 'node', anchorEl: e.currentTarget as HTMLElement });
    }, []);

    const onEdgeClick = useCallback((e: React.MouseEvent, edge: LayoutEdge) => {
        e.stopPropagation();
        setSelection({
            id: edge.id,
            type: 'equipment',
            anchorEl: e.currentTarget as HTMLElement,
            virtualEdge: edge.id.startsWith('virt_') ? edge : undefined,
        });
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div
            ref={containerRef}
            style={{
                width: '100%', height: '100%',
                overflow: 'hidden', background: BG,
                cursor: 'grab', position: 'relative',
                touchAction: 'none',
            }}
            onMouseDown={onMouseDown}
        >
            <svg width="100%" height="100%" style={{ display: 'block' }}>
                <g transform={`translate(${tx},${ty}) scale(${scale})`}>
                    {/* Wires — drawn first so symbols render on top */}
                    {edges.map(e => (
                        <path
                            key={`wire-${e.id}`}
                            d={e.path}
                            fill="none"
                            stroke={e.color}
                            strokeWidth={WIRE_WIDTH}
                            strokeDasharray={e.dashed ? '6 4' : undefined}
                        />
                    ))}

                    {/* ANSI equipment symbols */}
                    {edges.map(e => (
                        <g 
                            key={`sym-grp-${e.id}`} 
                            onClick={(ev) => onEdgeClick(ev, e)}
                            style={{ cursor: 'pointer' }}
                            data-clickable="true"
                        >
                            <EdgeSymbol edge={e} />
                        </g>
                    ))}

                    {/* Edge labels — type (prominent) + detail (secondary) */}
                    {edges.map(e => (
                        <g key={`lbl-${e.id}`}>
                            <text
                                x={e.labelX}
                                y={e.labelY}
                                fontSize={10}
                                fontWeight={600}
                                fill="#c1c2c5"
                                dominantBaseline="middle"
                            >
                                {e.typeLabel}
                            </text>
                            {e.detailLabel && (
                                <text
                                    x={e.labelX}
                                    y={e.labelY + 12}
                                    fontSize={8}
                                    fill="#868e96"
                                    dominantBaseline="middle"
                                >
                                    {e.detailLabel}
                                </text>
                            )}
                        </g>
                    ))}

                    {/* Bus bars */}
                    {nodes.map(n => (
                        <g 
                            key={n.id} 
                            onClick={(ev) => onNodeClick(ev, n.id)}
                            style={{ cursor: 'pointer' }}
                            data-clickable="true"
                        >
                            <rect
                                x={n.cx - BUS_W / 2}
                                y={n.y}
                                width={n.width}
                                height={n.height}
                                fill={n.fill}
                                rx={1}
                            />
                            {/* Name label above bus bar */}
                            <text
                                x={n.cx}
                                y={n.y - 5}
                                textAnchor="middle"
                                fontSize={10}
                                fontWeight={n.data.is_centre ? 700 : 400}
                                fill={n.data.is_centre ? '#ffd43b' : '#c1c2c5'}
                            >
                                {n.data.name}
                            </text>
                            {/* Voltage below bus bar */}
                            {n.data.base_voltage_kv != null && (
                                <text
                                    x={n.cx}
                                    y={n.y + BUS_H + 12}
                                    textAnchor="middle"
                                    fontSize={9}
                                    fill="#868e96"
                                >
                                    {n.data.base_voltage_kv} kV
                                </text>
                            )}
                            {/* Attached equipment count badge */}
                            {n.data.attached_equipment.length > 0 && (
                                <text
                                    x={n.cx + BUS_W / 2 + 4}
                                    y={n.y + BUS_H / 2}
                                    fontSize={8}
                                    fill="#94d82d"
                                    dominantBaseline="middle"
                                >
                                    {n.data.attached_equipment.length} eq
                                </text>
                            )}
                        </g>
                    ))}
                </g>
            </svg>

            {/* Zoom controls */}
            <div style={{
                position: 'absolute', bottom: 12, right: 12,
                display: 'flex', flexDirection: 'column', gap: 4,
                zIndex: 10,
            }}>
                {([
                    { label: '+', title: 'Zoom in',      onClick: zoomIn  },
                    { label: '−', title: 'Zoom out',     onClick: zoomOut },
                    { label: '⊡', title: 'Fit to view',  onClick: fitView },
                ] as const).map(({ label, title, onClick }) => (
                    <button
                        key={label}
                        title={title}
                        onClick={onClick}
                        style={{
                            width: 36, height: 36,
                            background: 'rgba(30,30,30,0.85)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            color: '#c1c2c5',
                            borderRadius: 6,
                            cursor: 'pointer',
                            fontSize: 18,
                            lineHeight: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            userSelect: 'none',
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <CimAttributePopup
                id={selection?.id ?? null}
                type={selection?.type ?? null}
                anchorEl={selection?.anchorEl ?? null}
                virtualEdge={selection?.virtualEdge}
                onClose={() => setSelection(null)}
            />
        </div>
    );
}
