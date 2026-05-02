import { memo, useEffect, useRef } from 'react';
import { Group, Box, Text, Select, Grid, Button, Stack, Paper, Center } from '@mantine/core';
import { AlertTriangle, Clock, Activity } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { ScadaLoadingAnimation, AnalysisWindow, perf } from '@plugin-sdk';
import { autoExport, getDataToCopy } from '../../shared/utils/exportUtils';

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
        if (!data || data.length === 0) return "";
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
                                    backgroundImage: 'linear-gradient(rgba(51, 154, 240, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(51, 154, 240, 0.05) 1px, transparent 1px)',
                                    backgroundSize: '15px 15px',
                                    border: '1px solid rgba(51, 154, 240, 0.2)',
                                    borderRadius: '8px',
                                    backgroundColor: 'rgba(26, 27, 30, 0.3)'
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

                                <Paper withBorder p="xs" bg="rgba(51, 154, 240, 0.05)" style={{ borderStyle: 'dashed', borderColor: 'rgba(51, 154, 240, 0.3)' }}>
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
                    <Grid gutter="xl" align="stretch">
                    {/* 1. KDE Distribution */}
                    <Grid.Col span={{ base: 12, md: 4, lg: 3 }}>
                        <Paper withBorder p="sm" radius="md" bg="rgba(26, 27, 30, 0.3)" style={{ height: 380 }}>
                            <Text size="xs" fw={700} c="dimmed" mb={12} ta="center" style={{ letterSpacing: '0.5px' }}>
                                VOLTAGE_DISTRIBUTION (KDE)
                            </Text>
                            {data.length === 0 ? (
                                <Center h={300}>
                                    <Text size="xs" c="dimmed" fs="italic">No distribution data</Text>
                                </Center>
                            ) : (
                                <Box h={300} w="100%">
                                    <ReactECharts
                                        key={`kde-${data.length}`}
                                        notMerge={true}
                                        lazyUpdate={true}
                                        onChartReady={reportChartReady}
                                        style={{ height: '100%', width: '100%' }}
                                        option={{
                                            tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
                                            legend: { data: ['Phase A', 'Phase B', 'Phase C'], textStyle: { color: '#A6A7AB', fontSize: 10 }, top: 0, itemWidth: 10 },
                                            grid: { left: 10, right: 10, bottom: 20, top: 40, containLabel: true },
                                            xAxis: {
                                                type: 'category',
                                                data: data.map((d: any) => d.voltage),
                                                axisLabel: { color: '#A6A7AB', fontSize: 10 },
                                                splitLine: { show: true, lineStyle: { color: '#25262B' } }
                                            },
                                            yAxis: {
                                                type: 'value',
                                                show: false,
                                                splitLine: { lineStyle: { color: '#25262B' } }
                                            },
                                            series: [
                                                {
                                                    name: 'Phase A',
                                                    type: 'line',
                                                    data: data.map((d: any) => d.phase_a),
                                                    itemStyle: { color: '#fa5252' },
                                                    areaStyle: { opacity: 0.2 },
                                                    showSymbol: false,
                                                    smooth: true
                                                },
                                                {
                                                    name: 'Phase B',
                                                    type: 'line',
                                                    data: data.map((d: any) => d.phase_b),
                                                    itemStyle: { color: '#40c057' },
                                                    areaStyle: { opacity: 0.2 },
                                                    showSymbol: false,
                                                    smooth: true
                                                },
                                                {
                                                    name: 'Phase C',
                                                    type: 'line',
                                                    data: data.map((d: any) => d.phase_c),
                                                    itemStyle: { color: '#228be6' },
                                                    areaStyle: { opacity: 0.2 },
                                                    showSymbol: false,
                                                    smooth: true
                                                }
                                            ]
                                        }}
                                    />
                                </Box>
                            )}
                        </Paper>
                    </Grid.Col>

                    {/* 2. Daily Timeseries (Median + 10/90 Bands) */}
                    <Grid.Col span={{ base: 12, md: 8, lg: 5 }}>
                        <Paper withBorder p="sm" radius="md" bg="rgba(26, 27, 30, 0.3)" style={{ height: 380 }}>
                            <Text size="xs" fw={700} c="dimmed" mb={12} ta="center" style={{ letterSpacing: '0.5px' }}>
                                VOLTAGE_STABILITY (MEDIAN & 10/90 BANDS)
                            </Text>
                            {timeSeriesData.length === 0 ? (
                                <Center h={300}>
                                    <Text size="xs" c="dimmed" fs="italic">No stability data</Text>
                                </Center>
                            ) : (
                                <Box h={300} w="100%">
                                    <ReactECharts
                                        key={`stability-${timeSeriesData.length}`}
                                        notMerge={true}
                                        lazyUpdate={true}
                                        onChartReady={reportChartReady}
                                        style={{ height: '100%', width: '100%' }}
                                        option={{
                                            tooltip: { 
                                                trigger: 'axis',
                                                backgroundColor: 'rgba(26, 27, 30, 0.95)',
                                                borderColor: '#373A40',
                                                textStyle: { color: '#C1C2C5' },
                                                formatter: (params: any) => {
                                                    const date = params[0].axisValue;
                                                    const p10 = params.find((p: any) => p.seriesName === 'P10');
                                                    const p90_delta = params.find((p: any) => p.seriesName === 'P90');
                                                    const median = params.find((p: any) => p.seriesName === 'Median');
                                                    
                                                    // Since it's stacked, the absolute p90 is p10 + delta
                                                    const p10_val = p10?.value || 0;
                                                    const p90_val = (p10 && p90_delta) ? (p10_val + p90_delta.value).toFixed(2) : 'N/A';
                                                    
                                                    return `
                                                        <div style="font-family: monospace; font-size: 11px;">
                                                            <div style="margin-bottom: 4px; border-bottom: 1px solid #373A40; padding-bottom: 2px;">${date}</div>
                                                            <div style="display: flex; justify-content: space-between; gap: 20px;">
                                                                <span style="color: #A6A7AB">90p:</span>
                                                                <span style="color: #fff; font-weight: bold;">${p90_val}V</span>
                                                            </div>
                                                            <div style="display: flex; justify-content: space-between; gap: 20px;">
                                                                <span style="color: #fab005">Median:</span>
                                                                <span style="color: #fff; font-weight: bold;">${median?.value.toFixed(2)}V</span>
                                                            </div>
                                                            <div style="display: flex; justify-content: space-between; gap: 20px;">
                                                                <span style="color: #A6A7AB">10p:</span>
                                                                <span style="color: #fff; font-weight: bold;">${p10_val.toFixed(2)}V</span>
                                                            </div>
                                                        </div>
                                                    `;
                                                }
                                            },
                                            grid: { left: 40, right: 20, bottom: 20, top: 40, containLabel: true },
                                            xAxis: {
                                                type: 'category',
                                                data: timeSeriesData.map(d => d.date),
                                                axisLabel: { color: '#A6A7AB', fontSize: 10 },
                                                splitLine: { show: true, lineStyle: { color: '#25262B' } }
                                            },
                                            yAxis: {
                                                type: 'value',
                                                scale: true,
                                                axisLabel: { color: '#A6A7AB', fontSize: 10 },
                                                splitLine: { lineStyle: { color: '#25262B' } }
                                            },
                                            series: [
                                                {
                                                    name: 'P10',
                                                    type: 'line',
                                                    data: timeSeriesData.map(d => parseFloat((d.p10 || 0).toFixed(2))),
                                                    lineStyle: { opacity: 0 },
                                                    stack: 'confidence-band',
                                                    symbol: 'none'
                                                },
                                                {
                                                    name: 'P90',
                                                    type: 'line',
                                                    data: timeSeriesData.map(d => parseFloat(((d.p90 || 0) - (d.p10 || 0)).toFixed(2))),
                                                    lineStyle: { opacity: 0 },
                                                    stack: 'confidence-band',
                                                    areaStyle: { color: 'rgba(200, 200, 200, 0.2)' },
                                                    symbol: 'none'
                                                },
                                                {
                                                    name: 'Median',
                                                    type: 'line',
                                                    data: timeSeriesData.map(d => parseFloat((d.p50 || 0).toFixed(2))),
                                                    itemStyle: { color: '#fab005' },
                                                    showSymbol: false,
                                                    smooth: true,
                                                    zIndex: 10
                                                }
                                            ]
                                        }}
                                    />
                                </Box>
                            )}
                        </Paper>
                    </Grid.Col>

                    {/* 3. Heatmap */}
                    <Grid.Col span={{ base: 12, md: 12, lg: 4 }}>
                        <Paper withBorder p="sm" radius="md" bg="rgba(26, 27, 30, 0.3)" style={{ height: 380 }}>
                            <Text size="xs" fw={700} c="dimmed" mb={12} ta="center" style={{ letterSpacing: '0.5px' }}>
                                VOLTAGE_VS_LOADING (HEATMAP)
                            </Text>
                            {scatterData.length === 0 ? (
                                <Center h={300}>
                                    <Text size="xs" c="dimmed" fs="italic">No correlation data</Text>
                                </Center>
                            ) : (
                                <Box h={300} w="100%">
                                    <ReactECharts
                                        key={`scatter-${scatterData.length}`}
                                        notMerge={true}
                                        lazyUpdate={true}
                                        onChartReady={reportChartReady}
                                        style={{ height: '100%', width: '100%' }}
                                        option={{
                                            tooltip: {
                                                trigger: 'item',
                                                backgroundColor: 'rgba(26, 27, 30, 0.95)',
                                                borderColor: '#373A40',
                                                textStyle: { color: '#C1C2C5', fontSize: 11, fontFamily: 'monospace' },
                                                formatter: (params: any) => {
                                                    const [x, y, count] = params.data;
                                                    return `Loading: ${x.toFixed(1)} kWh<br/>Voltage: ${y.toFixed(1)} V<br/>Occurrences: ${count}`;
                                                }
                                            },
                                            grid: { left: 40, right: 20, bottom: 40, top: 40, containLabel: true },
                                            xAxis: {
                                                type: 'value',
                                                name: 'Loading (kWh)',
                                                nameLocation: 'middle',
                                                nameGap: 25,
                                                scale: true,
                                                nameTextStyle: { color: '#A6A7AB', fontSize: 10 },
                                                axisLabel: { color: '#A6A7AB', fontSize: 10, fontFamily: 'monospace' },
                                                splitLine: { lineStyle: { color: '#25262B' } }
                                            },
                                            yAxis: {
                                                type: 'value',
                                                name: 'Voltage (V)',
                                                nameLocation: 'middle',
                                                nameGap: 30,
                                                scale: true,
                                                nameTextStyle: { color: '#A6A7AB', fontSize: 10 },
                                                axisLabel: { color: '#A6A7AB', fontSize: 10, fontFamily: 'monospace' },
                                                splitLine: { lineStyle: { color: '#25262B' } }
                                            },
                                            visualMap: {
                                                show: false,
                                                dimension: 1,
                                                min: 110,
                                                max: 130,
                                                inRange: {
                                                    color: ['#fa5252', '#fab005', '#40c057', '#fab005', '#fa5252']
                                                }
                                            },
                                            series: [
                                                {
                                                    name: 'Density',
                                                    type: 'scatter',
                                                    symbolSize: 4,
                                                    symbol: 'roundRect',
                                                    itemStyle: {
                                                        borderRadius: 1,
                                                        opacity: 0.6
                                                    },
                                                    data: scatterData?.map((d: any) => [d.loading, d.voltage, d.count]) || []
                                                }
                                            ]
                                        }}
                                    />
                                </Box>
                            )}
                        </Paper>
                    </Grid.Col>
                    </Grid>
                </Box>
            )}
        </AnalysisWindow>
    );
});
