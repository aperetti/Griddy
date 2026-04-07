import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Loader, Text, ActionIcon, ScrollArea } from '@mantine/core';
import { X, Zap, GitBranch, Minus } from 'lucide-react';
import { fetchNodeAttributes, fetchEquipmentAttributes } from '../api';
import type { LayoutEdge } from '../model/OneLineModel';

// ── Types ────────────────────────────────────────────────────────────────────

interface CimAttributePopupProps {
    id: string | null;
    type: 'node' | 'equipment' | null;
    anchorEl: HTMLElement | null;
    onClose: () => void;
    /** When set, the popup renders this data locally without an API fetch. */
    virtualEdge?: LayoutEdge;
}

// ── Key formatting ────────────────────────────────────────────────────────────

const KEY_OVERRIDES: Record<string, string> = {
    mrid: 'MRID',
    node_id: 'Node ID',
    cim_class: 'CIM Class',
    base_voltage_kv: 'Base Voltage',
    rated_s_kva: 'Rated S',
    rated_u_kv: 'Rated U',
    r_ohm_per_km: 'R (Ω/km)',
    x_ohm_per_km: 'X (Ω/km)',
    b_us_per_km: 'B (µS/km)',
    length_m: 'Length',
    is_open: 'State',
    is_fuse: 'Fuse',
    is_recloser: 'Recloser',
    is_disconnector: 'Disconnector',
    customer_count: 'Customers',
    aliasName: 'Alias',
    description: 'Description',
    latitude: 'Latitude',
    longitude: 'Longitude',
    active_power_w: 'Active Power',
    reactive_power_var: 'Reactive Power',
    p_mw: 'Active Power',
    q_mvar: 'Reactive Power',
    voltage_pu: 'Voltage (p.u.)',
    angle_deg: 'Voltage Angle',
    step: 'Current Step',
    neutralStep: 'Neutral Step',
    lowStep: 'Lower Limit',
    highStep: 'Upper Limit',
    neutralU: 'Neutral Voltage',
    stepVoltageIncrement: 'Step Increment',
    targetValue: 'Set Point',
    targetDeadband: 'Bandwidth',
    lineDropR: 'LDC R-Setting',
    lineDropX: 'LDC X-Setting',
    lineDropCompensation: 'LDC Enabled',
    timeDelay: 'Time Delay',
    discrete: 'Discrete Control',
    mode: 'Control Mode',
    monitoredPhase: 'Monitored Phase',
};

function formatKey(k: string): string {
    if (KEY_OVERRIDES[k]) return KEY_OVERRIDES[k];
    return k
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

// ── Value formatting ──────────────────────────────────────────────────────────

function formatNumber(k: string, v: number): string {
    if (k === 'base_voltage_kv' || k === 'rated_u_kv') return `${v} kV`;
    if (k === 'rated_s_kva')   return `${v.toLocaleString()} kVA`;
    if (k === 'length_m')      return `${v.toLocaleString()} m`;
    if (k === 'active_power_w' || k === 'p_mw') return `${v} W`;
    if (k === 'reactive_power_var' || k === 'q_mvar') return `${v} VAr`;
    if (k === 'step' || k === 'neutralStep' || k === 'lowStep' || k === 'highStep') return v.toString();
    if (k === 'stepVoltageIncrement') return `${v}%`;
    if (k === 'neutralU' || k === 'targetValue') return `${v} V`;
    if (k === 'targetDeadband') return `${v} V`;
    if (k === 'lineDropR' || k === 'lineDropX') return `${v} Ω`;
    if (k === 'timeDelay') return `${v} s`;
    if (Number.isInteger(v))   return v.toLocaleString();
    return parseFloat(v.toPrecision(6)).toString();
}

function formatValue(k: string, val: unknown): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'number') return formatNumber(k, val);
    if (Array.isArray(val)) {
        if (val.length === 0) return '—';
        if (val.every(v => typeof v === 'string' || typeof v === 'number')) {
            return val.join(', ');
        }
        return JSON.stringify(val);
    }
    return String(val);
}

// ── Styles (inline — avoids CSS-module coupling) ──────────────────────────────

const styles = {
    card: {
        width: 380,
        background: 'rgba(22, 23, 26, 0.98)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden',
        fontFamily: 'inherit',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px 8px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.09)',
        background: 'rgba(255,255,255,0.03)',
        flexShrink: 0,
    },
    headerIcon: {
        flexShrink: 0,
        opacity: 0.6,
    },
    headerTitle: {
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap' as const,
        textOverflow: 'ellipsis',
        fontSize: 13,
        fontWeight: 600,
        color: '#c1c2c5',
    },
    headerSub: {
        fontSize: 10,
        color: '#868e96',
        marginTop: 1,
    },
    body: {
        padding: '6px 0',
    },
    section: {
        padding: '4px 12px 8px',
    },
    sectionLabel: {
        fontSize: 10,
        fontWeight: 700,
        color: '#5c5f66',
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        marginBottom: 4,
        marginTop: 4,
    },
    divider: {
        borderTop: '1px solid rgba(255,255,255,0.06)',
        margin: '4px 0',
    },
    row: {
        display: 'grid',
        gridTemplateColumns: '110px 1fr',
        columnGap: 8,
        padding: '3px 12px',
        alignItems: 'baseline',
    },
    rowKey: {
        fontSize: 11,
        color: '#5c5f66',
        whiteSpace: 'nowrap' as const,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    },
    rowVal: {
        fontSize: 12,
        color: '#c1c2c5',
        wordBreak: 'break-word' as const,
    },
    eqCard: {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 5,
        padding: '5px 8px',
        marginBottom: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    },
    eqName: {
        fontSize: 12,
        color: '#c1c2c5',
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        whiteSpace: 'nowrap' as const,
        textOverflow: 'ellipsis',
    },
    terminalRow: {
        display: 'flex',
        flexWrap: 'wrap' as const,
        gap: 4,
        marginTop: 2,
    },
} as const;

// Keys shown in the main attribute table (others handled specially or skipped)
const SKIP_KEYS = new Set([
    'name', 'model_id', 'terminals', 'connected_equipment', 'RatioTapChanger', 'PhaseTapChanger',
    'TapChangerControl', 'RegulatingControl', 'display_class', 'hierarchy', 'transformerends'
]);

// ── Sub-components ─────────────────────────────────────────────────────────────

function ContainerRow({ container }: { container: { mrid: string; name: string; class: string } }) {
    return (
        <div style={styles.row}>
            <span style={styles.rowKey}>Container</span>
            <span style={{ ...styles.rowVal, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>{container.name || '—'}</span>
                <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>
                    {container.class}
                </Badge>
            </span>
        </div>
    );
}

function TerminalsSection({ terminals }: { terminals: Array<{ connectivity_node: string; phases: string[] }> }) {
    if (!terminals || terminals.length === 0) return null;
    return (
        <>
            <div style={styles.divider} />
            <div style={styles.section}>
                <div style={styles.sectionLabel}>Terminals</div>
                {terminals.map((t, i) => (
                    <div key={i} style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 10, color: '#5c5f66', marginBottom: 2 }}>
                            T{i + 1} — <span style={{ color: '#868e96', fontFamily: 'monospace', fontSize: 10 }}>
                                {typeof t.connectivity_node === 'string'
                                    ? t.connectivity_node.slice(0, 20) + (t.connectivity_node.length > 20 ? '…' : '')
                                    : '?'}
                            </span>
                        </div>
                        <div style={styles.terminalRow}>
                            {(t.phases ?? []).map(ph => (
                                <Badge key={ph} size="xs" variant="light" color="blue">{ph}</Badge>
                            ))}
                            {(!t.phases || t.phases.length === 0) && (
                                <span style={{ fontSize: 10, color: '#5c5f66' }}>no phases</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

function RegulatorControlSection({ data }: { data: any }) {
    const control = data.TapChangerControl || {};
    const reg = data.RegulatingControl || {};
    const combined = { ...reg, ...control };
    
    // Filter out common metadata keys
    const entries = Object.entries(combined).filter(([k]) => {
        return !['mrid', 'name', 'cim_class', 'class', 'uri', 'uuid'].includes(k);
    });

    if (entries.length === 0) return null;

    return (
        <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 10, color: '#5c5f66', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600, letterSpacing: '0.02em' }}>
                Regulator Control Settings
            </div>
            {entries.map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: '#888' }}>{formatKey(k)}</span>
                    <span style={{ fontSize: 11, color: '#ccc', fontFamily: 'monospace' }}>{formatValue(k, v)}</span>
                </div>
            ))}
        </div>
    );
}

function ConnectedEquipmentSection({ equipment }: { equipment: any[] }) {
    if (!equipment || equipment.length === 0) return null;
    return (
        <>
            <div style={styles.divider} />
            <div style={styles.section}>
                <div style={styles.sectionLabel}>Connected Equipment ({equipment.length})</div>
                {equipment.map((eq: any) => (
                    <div key={eq.mrid} style={styles.eqCard}>
                        <Badge size="xs" variant="light" color="indigo" style={{ flexShrink: 0 }}>
                            {eq.cim_class}
                        </Badge>
                        <span style={styles.eqName}>{eq.name || eq.mrid?.slice(0, 16) + '…'}</span>
                        {eq.base_voltage_kv != null && (
                            <span style={{ fontSize: 10, color: '#868e96', flexShrink: 0 }}>
                                {eq.base_voltage_kv} kV
                            </span>
                        )}
                        {eq.rated_s_kva != null && (
                            <span style={{ fontSize: 10, color: '#868e96', flexShrink: 0 }}>
                                {eq.rated_s_kva} kVA
                            </span>
                        )}
                        {eq.length_m != null && (
                            <span style={{ fontSize: 10, color: '#868e96', flexShrink: 0 }}>
                                {eq.length_m} m
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </>
    );
}

function TapChangerSection({ data, label }: { data: any; label: string }) {
    if (!data) return null;
    const entries = Object.entries(data).filter(([k]) => k !== 'mrid' && k !== 'name');
    
    return (
        <>
            <div style={styles.divider} />
            <div style={styles.section}>
                <div style={styles.sectionLabel}>{label}</div>
                <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 4,
                    padding: '4px 0',
                    border: '1px solid rgba(255,255,255,0.05)'
                }}>
                    {entries.map(([k, v]) => (
                        <div key={k} style={styles.row}>
                            <span style={styles.rowKey}>{formatKey(k)}</span>
                            <span style={styles.rowVal}>{formatValue(k, v)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

// ── Virtual edge summary ───────────────────────────────────────────────────────

function VirtualEdgeSummary({ edge }: { edge: LayoutEdge }) {
    const d = edge.data;
    const rows: Array<[string, string]> = [];
    if (d.length_m != null)       rows.push(['Total Length',      `${d.length_m.toLocaleString()} m`]);
    if (d.transformer_kva != null) rows.push(['Combined kVA',     `${d.transformer_kva.toLocaleString()} kVA`]);
    if (d.customer_count != null)  rows.push(['Customers',        d.customer_count.toLocaleString()]);
    if (d.phases?.length)          rows.push(['Phases',           d.phases.join(', ')]);
    rows.push(['State', d.is_open ? 'OPEN' : 'Closed']);

    return (
        <div style={styles.body}>
            <div style={{ padding: '6px 12px 4px', ...styles.sectionLabel }}>
                Collapsed Segment Summary
            </div>
            {rows.map(([k, v]) => (
                <div key={k} style={styles.row}>
                    <span style={styles.rowKey}>{k}</span>
                    <span style={{
                        ...styles.rowVal,
                        color: k === 'State' && d.is_open ? '#ff6b6b' : styles.rowVal.color,
                    }}>{v}</span>
                </div>
            ))}
            <div style={{ padding: '6px 12px 4px' }}>
                <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
                    This segment represents multiple collapsed buses. Individual CIM attributes
                    are not available for virtual segments.
                </Text>
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CimAttributePopup({ id, type, anchorEl, onClose, virtualEdge }: CimAttributePopupProps) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!id || !type || virtualEdge) { setData(null); return; }
        let cancelled = false;
        setLoading(true);
        setError(null);
        const load = async () => {
            try {
                const result = type === 'node'
                    ? await fetchNodeAttributes(id)
                    : await fetchEquipmentAttributes(id);
                if (!cancelled) setData(result);
            } catch (err: any) {
                if (!cancelled) setError(err.message || 'Failed to fetch attributes');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [id, type, virtualEdge]);

    if (!anchorEl || !id) return null;

    const rect = anchorEl.getBoundingClientRect();
    // Position popup: prefer below-right, shift left if near viewport edge
    const POPUP_W = 380;
    const rawLeft = rect.left;
    const left = Math.min(rawLeft, window.innerWidth - POPUP_W - 12);
    const top = rect.bottom + 6;

    const title = virtualEdge
        ? (virtualEdge.data.name || 'Collapsed Segment')
        : (data?.name || (type === 'node' ? 'Bus' : 'Equipment'));
    const subtitle = virtualEdge
        ? 'Virtual · ACLineSegment'
        : (data?.display_class ?? (data?.RatioTapChanger || data?.TapChangerControl ? 'Regulator' : (data?.cim_class ?? (type === 'node' ? 'ConnectivityNode' : null))));

    // Entries to show in the main attribute table
    const tableEntries = data
        ? Object.entries(data).filter(([k, v]) => {
            if (SKIP_KEYS.has(k)) return false;
            if (k === 'container') return false; // rendered separately
            if (typeof v === 'object' && v !== null) return false; // no raw objects
            return true;
        })
        : [];

    const popup = (
        <div
            style={{ position: 'fixed', top, left, zIndex: 10000, ...styles.card }}
            onMouseDown={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onPointerUp={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
        >
            {/* Header */}
            <div style={styles.header}>
                <span style={styles.headerIcon}>
                    {virtualEdge
                        ? <Minus size={14} color="#868e96" />
                        : type === 'node'
                            ? <GitBranch size={14} color="#4dabf7" />
                            : <Zap size={14} color="#ffd43b" />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.headerTitle}>{title}</div>
                    {subtitle && <div style={styles.headerSub}>{subtitle}</div>}
                </div>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
                    <X size={14} />
                </ActionIcon>
            </div>

            {/* Body */}
            <ScrollArea.Autosize mah={420} type="auto">
                {virtualEdge ? (
                    <VirtualEdgeSummary edge={virtualEdge} />
                ) : (
                <div style={styles.body}>
                    {loading && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                            <Loader size="sm" color="blue" />
                        </div>
                    )}

                    {error && (
                        <div style={{ padding: '8px 12px' }}>
                            <Text size="xs" c="red">{error}</Text>
                        </div>
                    )}

                    {!loading && !error && data && (
                        <>
                            {/* Core attribute rows */}
                            {tableEntries.map(([k, v]) => (
                                <div key={k} style={styles.row}>
                                    <span style={styles.rowKey}>{formatKey(k)}</span>
                                    <span style={{
                                        ...styles.rowVal,
                                        ...(typeof v === 'boolean'
                                            ? { color: v ? '#51cf66' : '#ff6b6b' }
                                            : {}),
                                    }}>
                                        {formatValue(k, v)}
                                    </span>
                                </div>
                            ))}

                            {/* Container */}
                            {data.container && <ContainerRow container={data.container} />}

                            {/* Terminals (equipment) */}
                            {data.terminals && <TerminalsSection terminals={data.terminals} />}

                            {/* Regulator Control */}
                            <RegulatorControlSection data={data} />

                            {/* Tap Changers */}
                            {data.RatioTapChanger && (
                                <TapChangerSection data={data.RatioTapChanger} label="Ratio Tap Changer" />
                            )}
                            {data.PhaseTapChanger && (
                                <TapChangerSection data={data.PhaseTapChanger} label="Phase Tap Changer" />
                            )}

                            {/* Connected equipment (node) */}
                            {data.connected_equipment && (
                                <ConnectedEquipmentSection equipment={data.connected_equipment} />
                            )}
                        </>
                    )}

                    {!loading && !error && !data && (
                        <div style={{ padding: '8px 12px' }}>
                            <Text size="xs" c="dimmed">No data available.</Text>
                        </div>
                    )}
                </div>
                )}
            </ScrollArea.Autosize>
        </div>
    );

    return createPortal(popup, document.body);
}
