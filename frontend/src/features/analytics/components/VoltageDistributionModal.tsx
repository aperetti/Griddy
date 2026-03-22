import { memo } from 'react';
import { Group, Box, Text, Select, Grid, Button, Stack, Paper } from '@mantine/core';
import { AlertTriangle, Clock, Activity } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { ScadaLoadingAnimation } from '../../../components/ScadaLoadingAnimation';
import { AnalysisWindow } from './AnalysisWindow';
import { autoExport, getDataToCopy } from '../../../shared/utils/exportUtils';

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
}: Props) {
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
                <Grid style={{ width: '100%', height: '100%' }} gutter="md" align="stretch">
                    {/* 1. KDE Distribution */}
                    <Grid.Col span={{ base: 12, md: 4, lg: 3 }} style={{ height: 350 }}>
                        <Text size="xs" c="dimmed" mb={4} ta="center">Distribution (KDE)</Text>
                        <Box h="calc(100% - 24px)" w="100%">
                            <ReactECharts
                                style={{ height: '100%', width: '100%' }}
                                option={{
                                    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
                                    legend: { data: ['Phase A', 'Phase B', 'Phase C'], textStyle: { color: '#A6A7AB', fontSize: 10 }, top: 0, itemWidth: 10 },
                                    grid: { left: 10, right: 10, bottom: 20, top: 30, containLabel: true },
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
                                            data: data.map((d: any) => d.a),
                                            itemStyle: { color: '#fa5252' },
                                            areaStyle: { opacity: 0.2 },
                                            showSymbol: false,
                                            smooth: true
                                        },
                                        {
                                            name: 'Phase B',
                                            type: 'line',
                                            data: data.map((d: any) => d.b),
                                            itemStyle: { color: '#40c057' },
                                            areaStyle: { opacity: 0.2 },
                                            showSymbol: false,
                                            smooth: true
                                        },
                                        {
                                            name: 'Phase C',
                                            type: 'line',
                                            data: data.map((d: any) => d.c),
                                            itemStyle: { color: '#228be6' },
                                            areaStyle: { opacity: 0.2 },
                                            showSymbol: false,
                                            smooth: true
                                        }
                                    ]
                                }}
                            />
                        </Box>
                    </Grid.Col>

                    {/* 2. Daily Timeseries (Median + 10/90 Bands) */}
                    <Grid.Col span={{ base: 12, md: 8, lg: 5 }} style={{ height: 350 }}>
                        <Text size="xs" c="dimmed" mb={4} ta="center">Daily Voltage stability (Median & 10/90 Bands)</Text>
                        <Box h="calc(100% - 24px)" w="100%">
                            <ReactECharts
                                style={{ height: '100%', width: '100%' }}
                                option={{
                                    tooltip: { 
                                        trigger: 'axis',
                                        formatter: (params: any) => {
                                            const date = params[0].axisValue;
                                            const p10 = params.find((p: any) => p.seriesName === 'P10');
                                            const p90_delta = params.find((p: any) => p.seriesName === 'P90');
                                            const median = params.find((p: any) => p.seriesName === 'Median');
                                            
                                            // Since it's stacked, the absolute p90 is p10 + delta
                                            const p90_val = (p10 && p90_delta) ? (p10.value + p90_delta.value).toFixed(2) : 'N/A';
                                            
                                            return `
                                                <div style="font-family: monospace; font-size: 11px;">
                                                    <div style="margin-bottom: 4px; border-bottom: 1px solid #333; padding-bottom: 2px;">${date}</div>
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
                                                        <span style="color: #fff; font-weight: bold;">${p10?.value.toFixed(2)}V</span>
                                                    </div>
                                                </div>
                                            `;
                                        }
                                    },
                                    grid: { left: 40, right: 20, bottom: 20, top: 30, containLabel: true },
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
                                            data: timeSeriesData.map(d => parseFloat(d.p10.toFixed(2))),
                                            lineStyle: { opacity: 0 },
                                            stack: 'confidence-band',
                                            symbol: 'none'
                                        },
                                        {
                                            name: 'P90',
                                            type: 'line',
                                            data: timeSeriesData.map(d => parseFloat((d.p90 - d.p10).toFixed(2))),
                                            lineStyle: { opacity: 0 },
                                            stack: 'confidence-band',
                                            areaStyle: { color: 'rgba(200, 200, 200, 0.2)' },
                                            symbol: 'none'
                                        },
                                        {
                                            name: 'Median',
                                            type: 'line',
                                            data: timeSeriesData.map(d => parseFloat(d.p50.toFixed(2))),
                                            itemStyle: { color: '#fab005' },
                                            showSymbol: false,
                                            smooth: true,
                                            zIndex: 10
                                        }
                                    ]
                                }}
                            />
                        </Box>
                    </Grid.Col>

                    {/* 3. Heatmap */}
                    <Grid.Col span={{ base: 12, md: 12, lg: 4 }} style={{ height: 350 }}>
                        <Text size="xs" c="dimmed" mb={4} ta="center">Voltage vs Loading (Heatmap)</Text>
                        <Box h="calc(100% - 24px)" w="100%">
                            <ReactECharts
                                style={{ height: '100%', width: '100%' }}
                                option={{
                                    tooltip: {
                                        trigger: 'item',
                                        formatter: (params: any) => {
                                            const [x, y, count] = params.data;
                                            return `Loading: ${x} kWh<br/>Voltage: ${y} V<br/>Count: ${count}`;
                                        }
                                    },
                                    grid: { left: 40, right: 20, bottom: 40, top: 30, containLabel: true },
                                    xAxis: {
                                        type: 'value',
                                        name: 'Loading (kWh)',
                                        nameLocation: 'middle',
                                        nameGap: 25,
                                        scale: true,
                                        nameTextStyle: { color: '#A6A7AB', fontSize: 10 },
                                        axisLabel: { color: '#A6A7AB', fontSize: 10 },
                                        splitLine: { lineStyle: { color: '#25262B' } }
                                    },
                                    yAxis: {
                                        type: 'value',
                                        name: 'Voltage (V)',
                                        nameLocation: 'middle',
                                        nameGap: 30,
                                        scale: true,
                                        nameTextStyle: { color: '#A6A7AB', fontSize: 10 },
                                        axisLabel: { color: '#A6A7AB', fontSize: 10 },
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
                                                opacity: 0.5
                                            },
                                            data: scatterData[0]?.data?.map((d: any) => [d.x, d.y, d.count]) || []
                                        }
                                    ]
                                }}
                            />
                        </Box>
                    </Grid.Col>
                </Grid>
            )}
        </AnalysisWindow>
    );
});
