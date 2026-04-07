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
import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
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
    // Clamp so content never starts off the left or top edge.
    const tx    = Math.max(0, (containerW  - totalWidth  * scale) / 2);
    const ty    = Math.max(0, (containerH - totalHeight * scale) / 2);
    return { scale, tx, ty };
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
    // useLayoutEffect fires synchronously after DOM mutations and BEFORE the
    // browser paints, so the diagram always opens already fitted — no visible
    // flash of the full-scale overflowing state.
    useLayoutEffect(() => {
        if (totalWidth === 0 || totalHeight === 0) return;
        const el = containerRef.current;
        if (!el) return;
        const { offsetWidth: w, offsetHeight: h } = el;
        if (w === 0 || h === 0) return;
        const fit = calcFit(w, h, totalWidth, totalHeight);
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

    // ── Unified pan + pinch-zoom via Pointer Events API ──────────────────────
    // Using the Pointer Events API instead of separate mouse/touch handlers
    // avoids conflicts with react-rnd (which uses mouse/touch, not pointer
    // events) and works identically for mouse, touch, and stylus.
    // setPointerCapture keeps events flowing even when the pointer leaves the div.
    const pointers    = useRef<Map<number, { x: number; y: number }>>(new Map());
    // Tracks whether the current gesture moved enough to be a drag (vs a tap).
    // onNodeClick / onEdgeClick bail out when this is true so a drag on a bus
    // bar doesn't accidentally open the popup.
    const didDrag     = useRef(false);
    const pointerDownTarget = useRef<Element | null>(null);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        // Always capture so panning works even when starting on a bus bar.
        e.currentTarget.setPointerCapture(e.pointerId);
        e.stopPropagation();
        didDrag.current = false;
        pointerDownTarget.current = e.target as Element;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const prev = pointers.current.get(e.pointerId);
        if (!prev) return;
        e.stopPropagation();

        const curr = { x: e.clientX, y: e.clientY };
        // Mark as drag once movement exceeds a small threshold so accidental
        // micro-movement during a tap doesn't suppress click events.
        if (!didDrag.current && Math.hypot(curr.x - prev.x, curr.y - prev.y) > 4) {
            didDrag.current = true;
        }

        const ids  = Array.from(pointers.current.keys());

        if (ids.length === 1) {
            // Single pointer — pan
            setTx(x => x + curr.x - prev.x);
            setTy(y => y + curr.y - prev.y);
        } else if (ids.length >= 2) {
            // Two pointers — pinch-zoom centred on midpoint + pan by midpoint delta
            const otherId  = ids.find(id => id !== e.pointerId)!;
            const other    = pointers.current.get(otherId)!;
            const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
            const currDist = Math.hypot(curr.x - other.x, curr.y - other.y);

            if (prevDist > 1) {
                const factor = currDist / prevDist;
                const el     = containerRef.current;
                if (el) {
                    const rect = el.getBoundingClientRect();
                    const midX = (curr.x + other.x) / 2 - rect.left;
                    const midY = (curr.y + other.y) / 2 - rect.top;
                    setScale(s => {
                        const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s * factor));
                        setTx(x => midX - (midX - x) * (ns / s));
                        setTy(y => midY - (midY - y) * (ns / s));
                        return ns;
                    });
                }
            }

            // Pan contribution from midpoint movement
            const prevMidX = (prev.x + other.x) / 2;
            const prevMidY = (prev.y + other.y) / 2;
            const currMidX = (curr.x + other.x) / 2;
            const currMidY = (curr.y + other.y) / 2;
            setTx(x => x + currMidX - prevMidX);
            setTy(y => y + currMidY - prevMidY);
        }

        pointers.current.set(e.pointerId, curr);
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId);
        // Explicitly release pointer capture to prevent frozen-view state.
        try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* already released */ }

        // Tap (not drag) on a data-clickable element → dispatch a synthetic
        // click so the element's onClick handler fires.  setPointerCapture
        // redirects all events to the container div and suppresses the
        // browser's normal click synthesis, so we re-create it here.
        if (!didDrag.current && pointerDownTarget.current) {
            const clickable = pointerDownTarget.current.closest?.('[data-clickable]');
            if (clickable) {
                clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: e.clientX, clientY: e.clientY }));
            }
        }
        pointerDownTarget.current = null;
    }, []);

    // ── Zoom button handlers ──────────────────────────────────────────────────
    const zoomIn  = useCallback(() => setScale(s => Math.min(MAX_SCALE, s * 1.3)), []);
    const zoomOut = useCallback(() => setScale(s => Math.max(MIN_SCALE, s / 1.3)), []);

    const onNodeClick = useCallback((e: React.MouseEvent, nodeId: string) => {
        if (didDrag.current) return; // pointer moved — this was a pan, not a tap
        e.stopPropagation();
        setSelection({ id: nodeId, type: 'node', anchorEl: e.currentTarget as HTMLElement });
    }, []);

    const onEdgeClick = useCallback((e: React.MouseEvent, edge: LayoutEdge) => {
        if (didDrag.current) return;
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
                userSelect: 'none',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
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
                            {/* Name label above bus bar (offset to right of vertical centerline) */}
                            <text
                                x={n.cx + 30}
                                y={n.y - 6}
                                textAnchor="start"
                                fontSize={10}
                                fontWeight={n.data.is_centre ? 700 : 400}
                                fill={n.data.is_centre ? '#ffd43b' : '#c1c2c5'}
                            >
                                {n.data.name}
                            </text>
                            {/* Voltage below bus bar (offset to right of vertical centerline) */}
                            {n.data.base_voltage_kv != null && (
                                <text
                                    x={n.cx + 30}
                                    y={n.y + BUS_H + 12}
                                    textAnchor="start"
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
