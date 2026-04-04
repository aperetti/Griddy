import { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { Table, Text, Badge, Stack, Center, Group, Pagination, Select, Box, TextInput, UnstyledButton } from '@mantine/core';
import { Zap, Search, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { AnalysisWindow, ScadaLoadingAnimation, type SdkAnalysisInstance, type SdkPluginCallbacks } from '@plugin-sdk';
import { type TransformerRecord, type TransformerEnd, fetchTransformerLoading } from './api';
import { useDebouncedValue } from '@mantine/hooks';

interface Props extends SdkPluginCallbacks {
    instance: SdkAnalysisInstance;
}

function formatKva(val: number | null): string {
    if (val == null) return '—';
    const kva = val / 1000;
    return kva >= 1000 ? `${(kva / 1000).toFixed(2)} MVA` : `${kva.toFixed(1)} kVA`;
}

function formatKv(volts: number | null): string {
    if (volts == null) return '—';
    return `${(volts / 1000).toFixed(2)} kV`;
}

function formatOhm(val: number | null): string {
    if (val == null) return '—';
    return `${val} Ω`;
}

function getLoadingColor(percent: number | null): string {
    if (percent == null) return 'gray';
    if (percent > 100) return 'red';
    if (percent > 80) return 'orange';
    return 'green';
}

function SortHeader({ label, sortField, activeField, direction, onSort }: {
    label: string;
    sortField: string;
    activeField: string;
    direction: 'asc' | 'desc';
    onSort: (field: string) => void;
}) {
    const active = activeField === sortField;
    return (
        <Table.Th>
            <UnstyledButton onClick={() => onSort(sortField)} style={{ width: '100%' }}>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                    <Text size="xs" fw={700}>{label}</Text>
                    {active ? (
                        direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                    ) : (
                        <ArrowUpDown size={12} style={{ opacity: 0.3 }} />
                    )}
                </Group>
            </UnstyledButton>
        </Table.Th>
    );
}

const EndRow = memo(function EndRow({ transformer, end, isFirst, rowCount, onSelect }: { 
    transformer: TransformerRecord;
    end: TransformerEnd; 
    isFirst: boolean;
    rowCount: number;
    onSelect?: (id: string) => void;
}) {
    return (
        <Table.Tr 
            onClick={() => onSelect?.(transformer.mrid)}
            style={{ 
                cursor: onSelect ? 'pointer' : 'default',
                contentVisibility: 'auto',
                containIntrinsicSize: '1px 50px'
            }}
        >
            {isFirst && (
                <Table.Td rowSpan={rowCount}>
                    <Stack gap={2}>
                        <Text size="sm" fw={500}>{transformer.name || 'Unknown'}</Text>
                        <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                            {transformer.mrid.split('_').pop()}
                        </Text>
                    </Stack>
                </Table.Td>
            )}
            {isFirst && (
                <Table.Td rowSpan={rowCount}>
                    <Badge 
                        color={getLoadingColor(transformer.loading_percent)} 
                        variant="filled"
                        size="sm"
                    >
                        {transformer.loading_percent?.toFixed(1) ?? '—'}%
                    </Badge>
                </Table.Td>
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
});

export const TransformerLoadingWindow = memo(function TransformerLoadingWindow({
    instance,
    onClose,
    onMinimize,
    updateWindow,
    setNodeAverages,
    selectAndNavigateToNode,
}: Props) {
    const records = (instance.data ?? []) as TransformerRecord[];
    const totalCount = (instance.totalCount ?? 0) as number;
    const limit = (instance.limit ?? 25) as number;
    const offset = (instance.offset ?? 0) as number;
    const nodeIds = useMemo(() => (instance.nodeIds ?? []) as string[], [instance.nodeIds]);
    const loading = instance.loading as boolean;
    const currentSearch = (instance.search ?? "") as string;
    const currentSortField = (instance.sortField ?? "name") as string;
    const currentSortDir = (instance.sortDirection ?? "asc") as 'asc' | 'desc';

    const [searchTerm, setSearchTerm] = useState(currentSearch);
    const [debouncedSearch] = useDebouncedValue(searchTerm, 400);

    const totalPages = Math.ceil(totalCount / limit);
    const activePage = Math.floor(offset / limit) + 1;

    const handleFetch = useCallback(async (
        newLimit: number, 
        newOffset: number, 
        search: string,
        sortField: string,
        sortDir: 'asc' | 'desc'
    ) => {
        updateWindow?.({ loading: true });
        try {
            const resp = await fetchTransformerLoading(nodeIds, newLimit, newOffset, search, sortField, sortDir);
            updateWindow?.({
                data: resp.transformers,
                totalCount: resp.total_count,
                limit: resp.limit,
                offset: resp.offset,
                search: resp.search,
                sortField: resp.sort_field,
                sortDirection: resp.sort_direction,
                loading: false,
            });

            const averages: Record<string, number> = {};
            resp.transformers.forEach(t => {
                if (t.loading_percent != null) {
                    averages[t.mrid] = t.loading_percent / 100;
                }
            });
            setNodeAverages?.(averages);
        } catch (err) {
            console.error('Refetch failed', err);
            updateWindow?.({ loading: false });
        }
    }, [nodeIds, updateWindow, setNodeAverages]);

    useEffect(() => {
        if (debouncedSearch !== currentSearch && !loading) {
            handleFetch(limit, 0, debouncedSearch, currentSortField, currentSortDir);
        }
    }, [debouncedSearch, currentSearch, handleFetch, limit, loading]); 

    const onPageChange = (page: number) => {
        const newOffset = (page - 1) * limit;
        handleFetch(limit, newOffset, debouncedSearch, currentSortField, currentSortDir);
    };

    const onLimitChange = (val: string | null) => {
        if (!val) return;
        const newLimit = parseInt(val, 10);
        handleFetch(newLimit, 0, debouncedSearch, currentSortField, currentSortDir); 
    };

    const onSort = (field: string) => {
        const isSame = field === currentSortField;
        const newDir = isSame && currentSortDir === 'asc' ? 'desc' : 'asc';
        handleFetch(limit, 0, debouncedSearch, field, newDir);
    };

    const rows = useMemo(() => records.flatMap((t) =>
        t.ends.length > 0
            ? t.ends.map((end, i) => (
                <EndRow
                    key={`${t.mrid}-${i}`}
                    transformer={t}
                    end={end}
                    isFirst={i === 0}
                    rowCount={t.ends.length}
                    onSelect={selectAndNavigateToNode}
                />
            ))
            : [
                <Table.Tr 
                    key={t.mrid}
                    onClick={() => selectAndNavigateToNode?.(t.mrid)}
                    style={{ cursor: selectAndNavigateToNode ? 'pointer' : 'default' }}
                >
                    <Table.Td>
                        <Stack gap={2}>
                            <Text size="sm" fw={500}>{t.name || 'Unknown'}</Text>
                            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                                {t.mrid.split('_').pop()}
                            </Text>
                        </Stack>
                    </Table.Td>
                    <Table.Td>
                        <Badge 
                            color={getLoadingColor(t.loading_percent)} 
                            variant="filled"
                            size="sm"
                        >
                            {t.loading_percent?.toFixed(1) ?? '—'}%
                        </Badge>
                    </Table.Td>
                    <Table.Td colSpan={7}>
                        <Text size="xs" c="dimmed" fs="italic">No winding data available</Text>
                    </Table.Td>
                </Table.Tr>
            ]
    ), [records, selectAndNavigateToNode]);

    return (
        <AnalysisWindow
            isOpen={instance.isOpen}
            onClose={onClose}
            onMinimize={onMinimize}
            isMinimized={instance.isMinimized}
            title={`Transformer Overload — ${instance.nodeName}`}
            storageKey={`plugin_transformer_loading_${instance.id}`}
            zIndex={instance.zIndex ?? 1000}
            loading={loading}
            layoutMode="floating"
            initialWidth={900}
            initialHeight={550}
        >
            <Stack gap="xs" style={{ height: '100%', position: 'relative' }}>
                <Group px="md" pt="xs" justify="space-between">
                    <TextInput
                        placeholder="Search by name or mRID..."
                        size="xs"
                        leftSection={<Search size={14} />}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.currentTarget.value)}
                        style={{ width: 250 }}
                    />
                </Group>

                {loading && records.length === 0 ? (
                    <ScadaLoadingAnimation />
                ) : records.length === 0 ? (
                    <Center py="xl">
                        <Stack align="center" gap="xs">
                            <Zap size={28} color="var(--mantine-color-yellow-5)" />
                            <Text c="dimmed" size="sm">
                                {searchTerm ? `No results for "${searchTerm}"` : 'No transformer data found for selection.'}
                            </Text>
                        </Stack>
                    </Center>
                ) : (
                    <>
                        <Box style={{ flex: 1, overflowY: 'auto' }}>
                            <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs" stickyHeader>
                                <Table.Thead>
                                    <Table.Tr>
                                        <SortHeader 
                                            label="Transformer" 
                                            sortField="name" 
                                            activeField={currentSortField} 
                                            direction={currentSortDir} 
                                            onSort={onSort} 
                                        />
                                        <SortHeader 
                                            label="Load (%)" 
                                            sortField="load" 
                                            activeField={currentSortField} 
                                            direction={currentSortDir} 
                                            onSort={onSort} 
                                        />
                                        <Table.Th ta="center">End</Table.Th>
                                        <Table.Th>Rated S</Table.Th>
                                        <Table.Th>Rated U</Table.Th>
                                        <Table.Th>R (Ω)</Table.Th>
                                        <Table.Th>X (Ω)</Table.Th>
                                        <Table.Th>ShortTermS</Table.Th>
                                        <Table.Th>EmergencyS</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>{rows}</Table.Tbody>
                            </Table>
                        </Box>

                        <Group justify="space-between" px="md" py={10} style={{ borderTop: '1px solid var(--mantine-color-dark-4)' }}>
                            <Group gap="xs">
                                <Text size="xs" c="dimmed">Show</Text>
                                <Select
                                    size="xs"
                                    value={limit.toString()}
                                    onChange={onLimitChange}
                                    comboboxProps={{ zIndex: (instance.zIndex ?? 1000) + 500 }}
                                    data={[
                                        { value: '10', label: '10' },
                                        { value: '25', label: '25' },
                                        { value: '50', label: '50' },
                                        { value: '100', label: '100' },
                                        { value: '250', label: '250' },
                                    ]}
                                    style={{ width: 80 }}
                                />
                                <Text size="xs" c="dimmed">per page (Total: {totalCount})</Text>
                            </Group>

                            <Pagination 
                                size="sm" 
                                total={totalPages} 
                                value={activePage} 
                                onChange={onPageChange}
                                withEdges
                            />
                        </Group>
                    </>
                )}
            </Stack>
        </AnalysisWindow>
    );
});
