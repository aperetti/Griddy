import { memo } from 'react';
import { Table, Text, Badge, Stack, Center } from '@mantine/core';
import { Zap } from 'lucide-react';
import { AnalysisWindow, ScadaLoadingAnimation, type SdkAnalysisInstance } from '@plugin-sdk';
import type { TransformerRecord, TransformerEnd } from './api';

interface Props {
    instance: SdkAnalysisInstance;
    onClose: () => void;
    onMinimize: () => void;
}

function formatKva(val: number | null): string {
    if (val == null) return '—';
    return val >= 1000 ? `${(val / 1000).toFixed(2)} MVA` : `${val} kVA`;
}

function formatKv(volts: number | null): string {
    if (volts == null) return '—';
    return `${(volts / 1000).toFixed(2)} kV`;
}

function formatOhm(val: number | null): string {
    if (val == null) return '—';
    return `${val} Ω`;
}

function EndRow({ end, mrid, name, loading_percent, rowSpan }: { end: TransformerEnd; mrid: string; name: string | null; loading_percent: number | null; rowSpan: number }) {
    return (
        <Table.Tr>
            {rowSpan > 0 && (
                <>
                    <Table.Td rowSpan={rowSpan}>
                        <Stack gap={2}>
                            <Text size="sm" fw={600}>{name || '—'}</Text>
                            <Text size="xs" c="dimmed" ff="monospace">{mrid.slice(0, 14)}…</Text>
                        </Stack>
                    </Table.Td>
                    <Table.Td rowSpan={rowSpan}>
                        <Badge 
                            color={loading_percent != null && loading_percent > 100 ? 'red' : 'green'} 
                            variant="filled"
                        >
                            {loading_percent?.toFixed(1) ?? '—'}%
                        </Badge>
                    </Table.Td>
                </>
            )}
            <Table.Td ta="center">
                <Badge size="xs" variant="outline" color="gray">{end.end_number ?? '—'}</Badge>
            </Table.Td>
            <Table.Td>
                <Badge color="yellow" variant="light" size="sm">{formatKva(end.rated_s_kva)}</Badge>
            </Table.Td>
            <Table.Td>{formatKv(end.rated_u_v)}</Table.Td>
            <Table.Td c="blue.3">{formatOhm(end.resistance_ohm)}</Table.Td>
            <Table.Td c="cyan.3">{formatOhm(end.reactance_ohm)}</Table.Td>
            <Table.Td c="dimmed">{formatKva(end.short_term_s_kva)}</Table.Td>
            <Table.Td c="dimmed">{formatKva(end.emergency_s_kva)}</Table.Td>
        </Table.Tr>
    );
}

export const TransformerLoadingWindow = memo(function TransformerLoadingWindow({
    instance,
    onClose,
    onMinimize,
}: Props) {
    const records = (instance.data ?? []) as TransformerRecord[];

    const rows = records.flatMap((t) =>
        t.ends.length > 0
            ? t.ends.map((end, i) => (
                <EndRow
                    key={`${t.mrid}-${i}`}
                    end={end}
                    mrid={t.mrid}
                    name={t.name}
                    loading_percent={t.loading_percent}
                    rowSpan={i === 0 ? t.ends.length : 0}
                />
            ))
            : [
                <Table.Tr key={t.mrid}>
                    <Table.Td>
                        <Stack gap={2}>
                            <Text size="sm" fw={600}>{t.name || '—'}</Text>
                            <Text size="xs" c="dimmed" ff="monospace">{t.mrid.slice(0, 14)}…</Text>
                        </Stack>
                    </Table.Td>
                    <Table.Td colSpan={7}>
                        <Text size="xs" c="dimmed">No winding data found</Text>
                    </Table.Td>
                </Table.Tr>,
            ]
    );

    return (
        <AnalysisWindow
            isOpen={instance.isOpen}
            onClose={onClose}
            onMinimize={onMinimize}
            isMinimized={instance.isMinimized}
            title={`Transformer Loading — ${instance.nodeName}`}
            storageKey={`plugin_transformer_loading_${instance.id}`}
            zIndex={instance.zIndex ?? 1000}
            loading={instance.loading}
            layoutMode="floating"
            initialWidth={820}
            initialHeight={440}
        >
            {instance.loading ? (
                <ScadaLoadingAnimation />
            ) : records.length === 0 ? (
                <Center py="xl">
                    <Stack align="center" gap="xs">
                        <Zap size={28} color="var(--mantine-color-yellow-5)" />
                        <Text c="dimmed" size="sm">No transformer data found for selection.</Text>
                        <Text c="dimmed" size="xs">Select a node with attached PowerTransformer equipment.</Text>
                    </Stack>
                </Center>
            ) : (
                <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Transformer</Table.Th>
                            <Table.Th>Load (%)</Table.Th>
                            <Table.Th ta="center">End</Table.Th>
                            <Table.Th>Rated S</Table.Th>
                            <Table.Th>Rated U</Table.Th>
                            <Table.Th>R (Ω)</Table.Th>
                            <Table.Th>X (Ω)</Table.Th>
                            <Table.Th>Short-term S</Table.Th>
                            <Table.Th>Emergency S</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>{rows}</Table.Tbody>
                </Table>
            )}
        </AnalysisWindow>
    );
});
