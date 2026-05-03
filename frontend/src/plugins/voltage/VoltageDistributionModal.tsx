import { memo, useEffect, useRef } from 'react';
import { Group, Box, Text, Select, Grid, Button, Stack, Paper } from '@mantine/core';
import { AlertTriangle, Clock, Activity } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { ScadaLoadingAnimation, AnalysisWindow, perf } from '@plugin-sdk';
import { autoExport, getDataToCopy } from '../../shared/utils/exportUtils';
import { ResizableChartPanel } from '../../shared/components/ResizableChartPanel';
import { buildKdeOption, buildStabilityOption, buildHeatmapOption } from './model/voltageChartOptions';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    loading: boolean;
    data: any[];
    scatterData: any[];
    timeSeriesData: any[];
    estimatedRows?: number;
    nodeName: string | undefined;
    degrees: number | null;
    onDegreesChange: (degrees: number | null) => void;
    isMinimized?: boolean;
    onMinimize?: () => void;
    isPaused?: boolean;
    onConfirm?: () => void;
    onFocus?: () => void;
    zIndex?: number;
    layoutMode?: 'floating' | 'grid';
}

/** Empty-state placeholder centred in the panel. */
function ChartEmpty({ message }: { message: string }) {
    return (
        <Box style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text size="xs" c="dimmed" fs="italic">{message}</Text>
        </Box>
    );
}

export const VoltageDistributionModal = memo(function VoltageDistributionModal({
    isOpen,
    onClose,
    loading,
    data,
    scatterData,
    timeSeriesData,
    estimatedRows,
    nodeName,
    degrees,
    onDegreesChange,
    isMinimized,
    onMinimize,
    isPaused,
    onConfirm,
    onFocus,
    zIndex,
    layoutMode,
}: Props) {
    const dataArrivedAtRef = useRef<number | null>(null);
    const firstChartReportedRef = useRef<boolean>(false);
    const safeName = nodeName ?? 'unknown';

    useEffect(() => {
        const hasAny = (data && data.length > 0) || (scatterData && scatterData.length > 0) || (timeSeriesData && timeSeriesData.length > 0);
        if (hasAny && dataArrivedAtRef.current === null) {
            dataArrivedAtRef.current = performance.now();
            firstChartReportedRef.current = false;
        }
        if (!hasAny) {
            dataArrivedAtRef.current = null;
        }
    }, [data, scatterData, timeSeriesData]);

    const reportChartReady = () => {
        if (!firstChartReportedRef.current && dataArrivedAtRef.current !== null) {
            firstChartReportedRef.current = true;
            perf.mark('chart:first_ready', performance.now() - dataArrivedAtRef.current);
            setTimeout(() => perf.dump('voltage'), 0);
        }
    };

    const handleExport = () => {
        if (!data || data.length === 0) return;
        autoExport(data, `voltage_${nodeName?.replace(/\s+/g, '_')}`);
    };

    const handleCopy = () => {
        if (!data || data.length === 0) return '';
        return getDataToCopy(data);
    };

    const filterContent = (
        <Group gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">Search Depth:</Text>
            <Select
                size="xs"
                w={120}
                value={degrees === null ? 'downstream' : degrees.toString()}
                onChange={(val: string | null) => {
                    if (val === null) return;
                    onDegreesChange(val === 'downstream' ? null : parseInt(val));
                }}
                allowDeselect={false}
                data={[
                    { label: 'Strictly Downstream', value: 'downstream' },
                    { label: '1 Degree (Proximal)', value: '1' },
                    { label: '2 Degrees', value: '2' },
                    { label: '3 Degrees', value: '3' },
                    { label: '4 Degrees', value: '4' },
                    { label: '5 Degrees', value: '5' },
                    { label: '10 Degrees', value: '10' },
                ]}
                comboboxProps={{ withinPortal: true, zIndex: 100000 }}
            />
        </Group>
    );

    return (
        <AnalysisWindow
            isOpen={isOpen}
            onClose={onClose}
            onMinimize={onMinimize}
            isMinimized={isMinimized}
            title={`Voltage Analysis: ${nodeName}`}
            storageKey="voltageWindowPos"
            zIndex={zIndex ?? 20}
            onFocus={onFocus}
            filterContent={filterContent}
            onExport={handleExport}
            onCopy={handleCopy}
            loading={loading}
            layoutMode={layoutMode}
        >
            {isPaused ? (
                <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '20px' }}>
                    <Stack align="center" gap="xl" style={{ maxWidth: 500 }}>
                        <Box style={{ position: 'relative', width: '100%' }}>
                            <Box
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    backgroundImage:
                                        'linear-gradient(rgba(51, 154, 240, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(51, 154, 240, 0.05) 1px, transparent 1px)',
                                    backgroundSize: '15px 15px',
                                    border: '1px solid rgba(51, 154, 240, 0.2)',
                                    borderRadius: '8px',
                                    backgroundColor: 'rgba(26, 27, 30, 0.3)',
                                }}
                            />

                            <Stack p="xl" align="center" gap="md" style={{ position: 'relative' }}>
                                <Group gap="xs">
                                    <AlertTriangle size={18} color="#fab005" />
                                    <Text size="sm" ff="monospace" fw={700} c="blue.4" style={{ letterSpacing: '1px' }}>
                                        DATASET_CAPACITY_WARNING
                                    </Text>
                                </Group>

                                <Stack gap={4} align="center">
                                    <Text size="xs" ff="monospace" c="dimmed">ANALYSIS SCOPE</Text>
                                    <Text size="xl" ff="monospace" fw={700} c="white">
                                        {(estimatedRows! / 1000000).toFixed(1)}M READINGS
                                    </Text>
                                </Stack>

                                <Paper
                                    withBorder
                                    p="xs"
                                    bg="rgba(51, 154, 240, 0.05)"
                                    style={{ borderStyle: 'dashed', borderColor: 'rgba(51, 154, 240, 0.3)' }}
                                >
                                    <Group gap="sm">
                                        <Clock size={14} color="#339af0" />
                                        <Text size="xs" ff="monospace" c="blue.4">
                                            EST. COMPUTE TIME: {Math.ceil((estimatedRows! / 10000000) * 8)}s
                                        </Text>
                                    </Group>
                                </Paper>

                                <Box mt="xs">
                                    <Text size="xs" c="dimmed" ff="monospace" ta="center" style={{ maxWidth: 350, lineHeight: 1.4 }}>
                                        SYSTEM IMPACT: MODERATE<br />
                                        LARGE QUERIES MAY TEMPORARILY AFFECT CONCURRENT ANALYTICS PERFORMANCE.
                                    </Text>
                                </Box>

                                <Group mt="lg" gap="md">
                                    <Button variant="subtle" size="xs" color="gray" onClick={onClose} ff="monospace">
                                        [ ABORT_ADJUST ]
                                    </Button>
                                    <Button
                                        color="blue"
                                        size="sm"
                                        onClick={onConfirm}
                                        leftSection={<Activity size={16} />}
                                        ff="monospace"
                                        variant="light"
                                        style={{ border: '1px solid rgba(51, 154, 240, 0.4)' }}
                                    >
                                        EXECUTE_QUERY_PLAN
                                    </Button>
                                </Group>
                            </Stack>
                        </Box>
                    </Stack>
                </Box>
            ) : loading ? (
                <ScadaLoadingAnimation estimatedRows={estimatedRows} />
            ) : data.length === 0 && scatterData.length === 0 ? (
                <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Text c="dimmed">No distribution data found for this node in the selected date range.</Text>
                </Box>
            ) : (
                <Box style={{ height: '100%', padding: '16px', overflowY: 'auto' }}>
                    <Grid gutter="xl" align="start">
                        {/* 1. KDE Distribution */}
                        <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
                            <ResizableChartPanel
                                title="VOLTAGE_DISTRIBUTION (KDE)"
                                storageKey={`voltage-kde-${safeName}`}
                                defaultHeight={380}
                            >
                                {data.length === 0 ? (
                                    <ChartEmpty message="No distribution data" />
                                ) : (
                                    <ReactECharts
                                        key={`kde-${data.length}`}
                                        notMerge
                                        lazyUpdate
                                        onChartReady={reportChartReady}
                                        style={{ height: '100%', width: '100%' }}
                                        option={buildKdeOption(data)}
                                    />
                                )}
                            </ResizableChartPanel>
                        </Grid.Col>

                        {/* 2. Daily Timeseries (Median + 10/90 Bands) */}
                        <Grid.Col span={{ base: 12, md: 8, lg: 5 }}>
                            <ResizableChartPanel
                                title="VOLTAGE_STABILITY (MEDIAN & 10/90 BANDS)"
                                storageKey={`voltage-timeseries-${safeName}`}
                                defaultHeight={380}
                            >
                                {timeSeriesData.length === 0 ? (
                                    <ChartEmpty message="No stability data" />
                                ) : (
                                    <ReactECharts
                                        key={`stability-${timeSeriesData.length}`}
                                        notMerge
                                        lazyUpdate
                                        onChartReady={reportChartReady}
                                        style={{ height: '100%', width: '100%' }}
                                        option={buildStabilityOption(timeSeriesData)}
                                    />
                                )}
                            </ResizableChartPanel>
                        </Grid.Col>

                        {/* 3. Heatmap */}
                        <Grid.Col span={{ base: 12, md: 12, lg: 4 }}>
                            <ResizableChartPanel
                                title="VOLTAGE_VS_LOADING (HEATMAP)"
                                storageKey={`voltage-heatmap-${safeName}`}
                                defaultHeight={380}
                            >
                                {scatterData.length === 0 ? (
                                    <ChartEmpty message="No correlation data" />
                                ) : (
                                    <ReactECharts
                                        key={`scatter-${scatterData.length}`}
                                        notMerge
                                        lazyUpdate
                                        onChartReady={reportChartReady}
                                        style={{ height: '100%', width: '100%' }}
                                        option={buildHeatmapOption(scatterData)}
                                    />
                                )}
                            </ResizableChartPanel>
                        </Grid.Col>
                    </Grid>
                </Box>
            )}
        </AnalysisWindow>
    );
});
