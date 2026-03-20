import { memo, useState, useMemo, useEffect } from 'react';
import { Group, Box, Text, Stack, Select, Slider, SimpleGrid, Button, Paper } from '@mantine/core';
import { AlertTriangle, Clock, Activity } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { ScadaLoadingAnimation } from '../../../components/ScadaLoadingAnimation';
import { AnalysisWindow } from './AnalysisWindow';
import { autoExport, getDataToCopy } from '../../../shared/utils/exportUtils';

interface ReadingData {
    timestamp: string;
    kwh_delivered: number | null;
    kwh_received: number | null;
    net_consumption: number | null;
    kwh_a: number | null;
    kwh_b: number | null;
    kwh_c: number | null;
    temperature: number | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    loading: boolean;
    data: ReadingData[];
    estimatedRows?: number;
    nodeName: string | undefined;
    isMinimized?: boolean;
    onMinimize?: () => void;
    isPaused?: boolean;
    onConfirm?: () => void;
}

const MONTH_OPTIONS = [
    { value: '0', label: 'Jan' },
    { value: '1', label: 'Feb' },
    { value: '2', label: 'Mar' },
    { value: '3', label: 'Apr' },
    { value: '4', label: 'May' },
    { value: '5', label: 'Jun' },
    { value: '6', label: 'Jul' },
    { value: '7', label: 'Aug' },
    { value: '8', label: 'Sep' },
    { value: '9', label: 'Oct' },
    { value: '10', label: 'Nov' },
    { value: '11', label: 'Dec' },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
    value: i.toString(),
    label: `${i.toString().padStart(2, '0')}:00`
}));

export const ConsumptionTimeSeriesModal = memo(function ConsumptionTimeSeriesModal({
    isOpen,
    onClose,
    loading,
    data,
    estimatedRows,
    nodeName,
    isMinimized,
    onMinimize,
    isPaused,
    onConfirm,
}: Props) {
    const [startHour, setStartHour] = useState<string>('0');
    const [endHour, setEndHour] = useState<string>('23');
    const [startMonth, setStartMonth] = useState<string>('0');
    const [endMonth, setEndMonth] = useState<string>('11');
    const [winterTarget, setWinterTarget] = useState<number>(-5);
    const [summerTarget, setSummerTarget] = useState<number>(30);

    const handleExport = () => {
        if (!data || data.length === 0) return;
        autoExport(data, `consumption_${nodeName?.replace(/\s+/g, '_')}`);
    };

    const handleCopy = () => {
        if (!data || data.length === 0) return "";
        return getDataToCopy(data);
    };

    useEffect(() => {
        if (isOpen && data && data.length > 0) {
            let minMonth = 11;
            let maxMonth = 0;

            for (let i = 0; i < data.length; i++) {
                const m = new Date(data[i].timestamp).getUTCMonth();
                if (m < minMonth) minMonth = m;
                if (m > maxMonth) maxMonth = m;
            }

            setStartMonth(minMonth.toString());
            setEndMonth(maxMonth.toString());
        }
    }, [isOpen, data]);

    const filteredByMonth = useMemo(() => {
        const sM = parseInt(startMonth);
        const eM = parseInt(endMonth);

        return data.filter(d => {
            const date = new Date(d.timestamp);
            const month = date.getUTCMonth();

            return sM <= eM
                ? (month >= sM && month <= eM)
                : (month >= sM || month <= eM);
        });
    }, [data, startMonth, endMonth]);

    const filteredData = useMemo(() => {
        const sH = parseInt(startHour);
        const eH = parseInt(endHour);

        return filteredByMonth.filter(d => {
            const date = new Date(d.timestamp);
            const hour = date.getUTCHours();

            return sH <= eH
                ? (hour >= sH && hour <= eH)
                : (hour >= sH || hour <= eH);
        });
    }, [filteredByMonth, startHour, endHour]);

    const seasonalData = useMemo(() => {
        const summerPoints: { x: number; y: number }[] = [];
        const winterPoints: { x: number; y: number }[] = [];
        const neutralPoints: { x: number; y: number }[] = [];

        filteredData.forEach(d => {
            if (d.temperature != null && d.kwh_delivered != null) {
                const date = new Date(d.timestamp);
                const month = date.getUTCMonth();
                const p = { x: d.temperature, y: d.kwh_delivered };

                if (month >= 4 && month <= 8) {
                    summerPoints.push(p);
                }
                else if (month >= 10 || month <= 2) {
                    winterPoints.push(p);
                }
                else {
                    neutralPoints.push(p);
                }
            }
        });

        const calcReg = (points: { x: number, y: number }[]) => {
            if (points.length < 2) return null;
            const n = points.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            let minX = points[0].x, maxX = points[0].x;
            for (const p of points) {
                sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumX2 += p.x * p.x;
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
            }
            const denominator = (n * sumX2 - sumX * sumX);
            if (denominator === 0) return null;
            const slope = (n * sumXY - sumX * sumY) / denominator;
            const intercept = (sumY - slope * sumX) / n;
            return { start: [minX, slope * minX + intercept], end: [maxX, slope * maxX + intercept], slope, intercept };
        };

        return {
            summer: calcReg(summerPoints),
            winter: calcReg(winterPoints),
            summerRaw: summerPoints,
            winterRaw: winterPoints,
            neutralRaw: neutralPoints
        };
    }, [filteredData]);

    const smoothedTemperatures = useMemo(() => {
        if (data.length === 0) return [];
        const windowSize = 96; // 24h at 15m resolution
        const result: (number | null)[] = [];
        let sum = 0;
        let count = 0;

        for (let i = 0; i < data.length; i++) {
            if (data[i].temperature != null) {
                sum += data[i].temperature!;
                count++;
            }
            if (i >= windowSize) {
                const old = data[i - windowSize].temperature;
                if (old != null) {
                    sum -= old;
                    count--;
                }
            }
            result.push(count > 0 ? sum / count : null);
        }
        return result;
    }, [data]);

    const timeSeriesData = useMemo(() => {
        if (data.length === 0) return [];

        const first = new Date(data[0].timestamp).getTime();
        const last = new Date(data[data.length - 1].timestamp).getTime();
        const spanDays = (last - first) / (1000 * 60 * 60 * 24);

        if (spanDays <= 90) {
            return data.map((d, i) => {
                const ka = d.kwh_a || 0;
                const kb = d.kwh_b || 0;
                const kc = d.kwh_c || 0;

                // Symmetrical component S2 magnitude (imbalance)
                const real = ka - 0.5 * kb - 0.5 * kc;
                const imag = 0.866 * (kb - kc);
                const s2 = Math.sqrt(real * real + imag * imag) / 3;

                return [
                    new Date(d.timestamp).getTime(),
                    d.kwh_delivered,
                    smoothedTemperatures[i],
                    ka,
                    kb,
                    kc,
                    s2,
                    d.kwh_received,
                    d.net_consumption
                ];
            });
        }

        const bucketHours = spanDays > 365 ? 3 : 1;
        const bucketMs = bucketHours * 60 * 60 * 1000;
        const aggregated: [number, number | null, number | null, number, number, number, number, number | null, number | null][] = [];
        let curKwh: number[] = [];
        let curTemp: number[] = [];
        let curKa: number[] = [];
        let curKb: number[] = [];
        let curKc: number[] = [];
        let curKwhRcv: number[] = [];
        let curNet: number[] = [];
        let bucketStartTime = Math.floor(first / bucketMs) * bucketMs;

        data.forEach((d, i) => {
            const time = new Date(d.timestamp).getTime();
            const sTemp = smoothedTemperatures[i];
            if (time < bucketStartTime + bucketMs) {
                if (d.kwh_delivered != null) curKwh.push(d.kwh_delivered);
                if (sTemp != null) curTemp.push(sTemp);
                if (d.kwh_a != null) curKa.push(d.kwh_a);
                if (d.kwh_b != null) curKb.push(d.kwh_b);
                if (d.kwh_c != null) curKc.push(d.kwh_c);
                if (d.kwh_received != null) curKwhRcv.push(d.kwh_received);
                if (d.net_consumption != null) curNet.push(d.net_consumption);
            } else {
                if (curKwh.length > 0 || curTemp.length > 0 || curKa.length > 0) {
                    const avgKwh = curKwh.length > 0 ? curKwh.reduce((a, b) => a + b, 0) / curKwh.length : null;
                    const avgTemp = curTemp.length > 0 ? curTemp.reduce((a, b) => a + b, 0) / curTemp.length : null;
                    const avgKa = curKa.length > 0 ? curKa.reduce((a, b) => a + b, 0) / curKa.length : 0;
                    const avgKb = curKb.length > 0 ? curKb.reduce((a, b) => a + b, 0) / curKb.length : 0;
                    const avgKc = curKc.length > 0 ? curKc.reduce((a, b) => a + b, 0) / curKc.length : 0;
                    const avgKwhRcv = curKwhRcv.length > 0 ? curKwhRcv.reduce((a, b) => a + b, 0) / curKwhRcv.length : null;
                    const avgNet = curNet.length > 0 ? curNet.reduce((a, b) => a + b, 0) / curNet.length : null;

                    const real = avgKa - 0.5 * avgKb - 0.5 * avgKc;
                    const imag = 0.866 * (avgKb - avgKc);
                    const s2 = Math.sqrt(real * real + imag * imag) / 3;

                    aggregated.push([bucketStartTime, avgKwh, avgTemp, avgKa, avgKb, avgKc, s2, avgKwhRcv, avgNet]);
                }
                bucketStartTime = Math.floor(time / bucketMs) * bucketMs;
                curKwh = d.kwh_delivered != null ? [d.kwh_delivered] : [];
                curTemp = sTemp != null ? [sTemp] : [];
                curKa = d.kwh_a != null ? [d.kwh_a] : [];
                curKb = d.kwh_b != null ? [d.kwh_b] : [];
                curKc = d.kwh_c != null ? [d.kwh_c] : [];
                curKwhRcv = d.kwh_received != null ? [d.kwh_received] : [];
                curNet = d.net_consumption != null ? [d.net_consumption] : [];
            }
        });

        if (curKwh.length > 0 || curTemp.length > 0 || curKa.length > 0) {
            const avgKwh = curKwh.length > 0 ? curKwh.reduce((a, b) => a + b, 0) / curKwh.length : null;
            const avgTemp = curTemp.length > 0 ? curTemp.reduce((a, b) => a + b, 0) / curTemp.length : null;
            const avgKa = curKa.length > 0 ? curKa.reduce((a, b) => a + b, 0) / curKa.length : 0;
            const avgKb = curKb.length > 0 ? curKb.reduce((a, b) => a + b, 0) / curKb.length : 0;
            const avgKc = curKc.length > 0 ? curKc.reduce((a, b) => a + b, 0) / curKc.length : 0;
            const avgKwhRcv = curKwhRcv.length > 0 ? curKwhRcv.reduce((a, b) => a + b, 0) / curKwhRcv.length : null;
            const avgNet = curNet.length > 0 ? curNet.reduce((a, b) => a + b, 0) / curNet.length : null;

            const real = avgKa - 0.5 * avgKb - 0.5 * avgKc;
            const imag = 0.866 * (avgKb - avgKc);
            const s2 = Math.sqrt(real * real + imag * imag) / 3;

            aggregated.push([bucketStartTime, avgKwh, avgTemp, avgKa, avgKb, avgKc, s2, avgKwhRcv, avgNet]);
        }

        return aggregated;
    }, [data]);

    const hourlyAggregation = useMemo(() => {
        const buckets = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));

        filteredByMonth.forEach(d => {
            if (d.kwh_delivered != null) {
                const date = new Date(d.timestamp);
                const hour = date.getUTCHours();
                if (hour >= 0 && hour < 24) {
                    buckets[hour].total += d.kwh_delivered;
                    buckets[hour].count += 1;
                }
            }
        });

        return buckets.map((b, i) => ({
            hour: `${i.toString().padStart(2, '0')}:00`,
            avg: b.count > 0 ? b.total / b.count : 0
        }));
    }, [filteredByMonth]);

    const markLines = useMemo(() => {
        if (data.length === 0) return [];
        const marks: any[] = [];
        let lastMonth = -1;

        data.forEach((d) => {
            const date = new Date(d.timestamp);
            const month = date.getUTCMonth();
            const timestamp = date.getTime();

            if (lastMonth !== -1 && month !== lastMonth) {
                marks.push({
                    xAxis: timestamp,
                    label: {
                        show: true,
                        position: 'end',
                        formatter: MONTH_OPTIONS[month].label,
                        color: '#A6A7AB',
                        fontSize: 10,
                        backgroundColor: 'rgba(26, 27, 30, 0.7)',
                        padding: [2, 4],
                        borderRadius: 2
                    },
                    lineStyle: { type: 'solid', color: 'rgba(255, 255, 255, 0.2)', width: 1 }
                });
            }
            lastMonth = month;
        });
        return marks;
    }, [data]);

    const filterContent = (
        <Group gap="xl" wrap="wrap">
            <Group gap="xs" wrap="wrap">
                <Text size="xs" c="dimmed">Month Range:</Text>
                <Select
                    id="select-month-start"
                    data={MONTH_OPTIONS}
                    value={startMonth}
                    onChange={(v) => v && setStartMonth(v)}
                    size="xs"
                    w={80}
                    comboboxProps={{ withinPortal: true, zIndex: 2000 }}
                />
                <Text size="xs" c="dimmed">to</Text>
                <Select
                    id="select-month-end"
                    data={MONTH_OPTIONS}
                    value={endMonth}
                    onChange={(v) => v && setEndMonth(v)}
                    size="xs"
                    w={80}
                    comboboxProps={{ withinPortal: true, zIndex: 2000 }}
                />
            </Group>

            <Group gap="xs" wrap="wrap">
                <Text size="xs" c="dimmed">Time Range (Slicer):</Text>
                <Select
                    id="select-hour-start"
                    data={HOUR_OPTIONS}
                    value={startHour}
                    onChange={(v) => v && setStartHour(v)}
                    size="xs"
                    w={90}
                    comboboxProps={{ withinPortal: true, zIndex: 2000 }}
                />
                <Text size="xs" c="dimmed">to</Text>
                <Select
                    id="select-hour-end"
                    data={HOUR_OPTIONS}
                    value={endHour}
                    onChange={(v) => v && setEndHour(v)}
                    size="xs"
                    w={90}
                    comboboxProps={{ withinPortal: true, zIndex: 2000 }}
                />
            </Group>
            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>*Month slicer affects Daily Profile; Hour slicer affects Correlation</Text>
        </Group>
    );

    return (
        <AnalysisWindow
            isOpen={isOpen}
            onClose={onClose}
            onMinimize={onMinimize}
            isMinimized={isMinimized}
            title={`Grid Analytics: ${nodeName}`}
            storageKey="consumptionWindowPos"
            zIndex={1000}
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
                                            EST. COMPUTE TIME: {Math.ceil((estimatedRows! / 10000000) * 5)}s
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
            ) : data.length === 0 ? (
                <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Text c="dimmed">No readings found for this node in the selected date range.</Text>
                </Box>
            ) : (
                <Box style={{ height: '100%', overflowY: 'auto', paddingRight: '10px' }}>
                    <Stack gap="xl">
                        <Box style={{ height: 280 }}>
                            <Text size="xs" fw={700} c="dimmed" mb={4} ta="center">Consumption Time-Series (Full Period)</Text>
                            <ReactECharts
                                style={{ height: 240, width: '100%' }}
                                option={{
                                    tooltip: {
                                        trigger: 'axis',
                                        backgroundColor: 'rgba(26, 27, 30, 0.9)',
                                        borderColor: '#373A40',
                                        textStyle: { color: '#C1C2C5', fontSize: 11 }
                                    },
                                    useUTC: true,
                                    legend: {
                                        data: ['kWh Delivered', 'kWh Received', 'Net Consumption', 'Temp (24h Avg)'],
                                        selected: { 'kWh Delivered': false },
                                        textStyle: { color: '#A6A7AB', fontSize: 10 },
                                        top: 0
                                    },
                                    grid: { left: 40, right: 40, bottom: 35, top: 45, containLabel: true },
                                    dataZoom: [
                                        { type: 'inside', start: 0, end: 100, xAxisIndex: 0 },
                                        {
                                            type: 'slider',
                                            start: 0,
                                            end: 100,
                                            height: 15,
                                            bottom: 10,
                                            textStyle: { color: '#A6A7AB' },
                                            borderColor: '#373A40',
                                            fillerColor: 'rgba(51, 154, 240, 0.2)',
                                            xAxisIndex: 0
                                        }
                                    ],
                                    xAxis: {
                                        type: 'time',
                                        axisLabel: {
                                            color: '#A6A7AB',
                                            fontSize: 10,
                                            formatter: (value: number) => {
                                                const date = new Date(value);
                                                return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                            }
                                        },
                                        axisLine: { lineStyle: { color: '#373A40' } },
                                        splitLine: { show: false }
                                    },
                                    yAxis: [
                                        {
                                            type: 'value',
                                            name: 'kWh',
                                            scale: true,
                                            axisLabel: { color: '#A6A7AB', fontSize: 10 },
                                            splitLine: { lineStyle: { color: '#25262B' } }
                                        },
                                        {
                                            type: 'value',
                                            name: '°C',
                                            scale: true,
                                            axisLabel: { color: '#FA5252', fontSize: 10 },
                                            splitLine: { show: false }
                                        }
                                    ],
                                    series: [
                                        {
                                            name: 'kWh Delivered',
                                            type: 'line',
                                            data: timeSeriesData.map(d => [d[0], d[1]]),
                                            smooth: true,
                                            showSymbol: false,
                                            itemStyle: { color: '#339af0' },
                                            areaStyle: {
                                                opacity: 0.1,
                                                color: {
                                                    type: 'linear',
                                                    x: 0, y: 0, x2: 0, y2: 1,
                                                    colorStops: [{ offset: 0, color: '#339af0' }, { offset: 1, color: 'rgba(51, 154, 240, 0)' }]
                                                }
                                            },
                                            markLine: {
                                                symbol: ['none', 'none'],
                                                silent: true,
                                                data: markLines
                                            }
                                        },
                                        {
                                            name: 'kWh Received',
                                            type: 'line',
                                            data: timeSeriesData.map(d => [d[0], d[7]]),
                                            smooth: true,
                                            showSymbol: false,
                                            itemStyle: { color: '#40c057' },
                                            areaStyle: {
                                                opacity: 0.1,
                                                color: {
                                                    type: 'linear',
                                                    x: 0, y: 0, x2: 0, y2: 1,
                                                    colorStops: [{ offset: 0, color: '#40c057' }, { offset: 1, color: 'rgba(64, 192, 87, 0)' }]
                                                }
                                            }
                                        },
                                        {
                                            name: 'Net Consumption',
                                            type: 'line',
                                            data: timeSeriesData.map(d => [d[0], d[8]]),
                                            smooth: true,
                                            showSymbol: false,
                                            itemStyle: { color: '#ffd43b' },
                                            lineStyle: { width: 2, type: 'dashed' }
                                        },
                                        {
                                            name: 'Temp (24h Avg)',
                                            type: 'line',
                                            yAxisIndex: 1,
                                            data: timeSeriesData.map(d => [d[0], d[2]]),
                                            smooth: true,
                                            showSymbol: false,
                                            itemStyle: { color: '#fa5252' },
                                            lineStyle: { width: 1, opacity: 0.5 }
                                        }
                                    ]
                                }}
                                onChartReady={(chart) => {
                                    chart.group = 'consumption-sync';
                                    echarts.connect('consumption-sync');
                                }}
                            />
                        </Box>

                        <Box style={{ height: 320, border: '1px solid rgba(51, 154, 240, 0.1)', borderRadius: '8px', padding: '12px', backgroundColor: 'rgba(26, 27, 30, 0.2)' }}>
                            <Text size="xs" fw={700} c="dimmed" mb={8} ta="center" style={{ letterSpacing: '0.5px' }}>PHASE_LOADING_&_ENERGY_IMBALANCE (|S₂|)</Text>
                            <ReactECharts
                                style={{ height: 260, width: '100%' }}
                                option={{
                                    tooltip: {
                                        trigger: 'axis',
                                        backgroundColor: 'rgba(26, 27, 30, 0.95)',
                                        borderColor: '#373A40',
                                        textStyle: { color: '#C1C2C5', fontSize: 11, fontFamily: 'monospace' },
                                        formatter: (params: any) => {
                                            let res = `<div style="font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid #373A40; padding-bottom: 2px;">${new Date(params[0].value[0]).toISOString()}</div>`;
                                            params.forEach((p: any) => {
                                                const val = Math.abs(p.value[1]).toFixed(3);
                                                res += `<div style="display: flex; justify-content: space-between; gap: 8px;">
                                                    <span style="color: ${p.color};">■</span> ${p.seriesName}: 
                                                    <span style="font-weight: bold;">${val} kWh</span>
                                                </div>`;
                                            });
                                            return res;
                                        }
                                    },
                                    legend: {
                                        data: ['Phase A', 'Phase B', 'Phase C', 'Imbalance (|S₂|)'],
                                        textStyle: { color: '#A6A7AB', fontSize: 10, fontFamily: 'monospace' },
                                        top: 0
                                    },
                                    grid: { left: 45, right: 15, bottom: 25, top: 40, containLabel: true },
                                    xAxis: {
                                        type: 'time',
                                        axisLabel: { color: '#A6A7AB', fontSize: 10, fontFamily: 'monospace' },
                                        axisLine: { lineStyle: { color: '#373A40' } },
                                        splitLine: { show: true, lineStyle: { color: 'rgba(55, 58, 64, 0.3)', type: 'dashed' } }
                                    },
                                    dataZoom: [
                                        { type: 'inside', start: 0, end: 100, xAxisIndex: 0 },
                                        {
                                            type: 'slider',
                                            start: 0,
                                            end: 100,
                                            height: 15,
                                            bottom: 10,
                                            textStyle: { color: '#A6A7AB' },
                                            borderColor: '#373A40',
                                            fillerColor: 'rgba(51, 154, 240, 0.2)',
                                            xAxisIndex: 0
                                        }
                                    ],
                                    yAxis: {
                                        type: 'value',
                                        name: 'kWh',
                                        nameTextStyle: { color: '#A6A7AB', fontSize: 10, fontFamily: 'monospace' },
                                        axisLabel: { color: '#A6A7AB', fontSize: 10, fontFamily: 'monospace' },
                                        splitLine: { lineStyle: { color: '#25262B' } },
                                        zeroGuideline: { show: true, lineStyle: { color: '#A6A7AB', type: 'solid', width: 1 } }
                                    },
                                    series: [
                                        {
                                            name: 'Phase A', type: 'line', data: timeSeriesData.map(d => [d[0], d[3]]),
                                            smooth: true, showSymbol: false, itemStyle: { color: '#fa5252' }, lineStyle: { width: 1.5 }
                                        },
                                        {
                                            name: 'Phase B', type: 'line', data: timeSeriesData.map(d => [d[0], d[4]]),
                                            smooth: true, showSymbol: false, itemStyle: { color: '#40c057' }, lineStyle: { width: 1.5 }
                                        },
                                        {
                                            name: 'Phase C', type: 'line', data: timeSeriesData.map(d => [d[0], d[5]]),
                                            smooth: true, showSymbol: false, itemStyle: { color: '#339af0' }, lineStyle: { width: 1.5 }
                                        },
                                        {
                                            name: 'Imbalance (|S₂|)',
                                            type: 'line',
                                            data: timeSeriesData.map(d => [d[0], -(d[6] || 0)]),
                                            smooth: true,
                                            showSymbol: false,
                                            itemStyle: { color: '#ffd43b' },
                                            lineStyle: { width: 2 },
                                            areaStyle: {
                                                opacity: 0.15,
                                                color: {
                                                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                                                    colorStops: [{ offset: 0, color: 'rgba(255, 212, 59, 0)' }, { offset: 1, color: 'rgba(255, 212, 59, 0.3)' }]
                                                }
                                            }
                                        }
                                    ]
                                }}
                                onChartReady={(chart) => {
                                    chart.group = 'consumption-sync';
                                    echarts.connect('consumption-sync');
                                }}
                            />
                        </Box>

                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="xl">
                            <Box style={{ height: 380 }}>
                                <Text size="xs" fw={700} c="dimmed" mb={4} ta="center">Typical Daily Load Profile (Hourly Avg)</Text>
                                <ReactECharts
                                    style={{ height: 340, width: '100%' }}
                                    option={{
                                        tooltip: {
                                            trigger: 'axis',
                                            backgroundColor: 'rgba(26, 27, 30, 0.9)',
                                            borderColor: '#373A40',
                                            textStyle: { color: '#C1C2C5' }
                                        },
                                        grid: { left: 50, right: 30, bottom: 25, top: 40, containLabel: true },
                                        xAxis: {
                                            type: 'category',
                                            data: Array.from({ length: 24 }, (_, i) => `${i}:00`),
                                            axisLabel: { color: '#A6A7AB', fontSize: 10 },
                                            axisLine: { lineStyle: { color: '#373A40' } }
                                        },
                                        yAxis: {
                                            type: 'value',
                                            name: 'Avg kWh',
                                            scale: true,
                                            axisLabel: { color: '#A6A7AB', fontSize: 10 },
                                            splitLine: { lineStyle: { color: '#25262B' } }
                                        },
                                        series: [{
                                            name: 'Average Load',
                                            type: 'line',
                                            data: hourlyAggregation.map(h => h.avg),
                                            itemStyle: { color: '#ffd43b' },
                                            areaStyle: {
                                                opacity: 0.2,
                                                color: {
                                                    type: 'linear',
                                                    x: 0, y: 0, x2: 0, y2: 1,
                                                    colorStops: [{ offset: 0, color: 'rgba(255, 212, 59, 0.3)' }, { offset: 1, color: 'rgba(255, 212, 59, 0)' }]
                                                }
                                            },
                                            smooth: true,
                                            showSymbol: false
                                        }]
                                    }}
                                />
                            </Box>

                            <Box style={{ height: 420 }}>
                                <Text size="xs" fw={700} c="dimmed" mb={12} ta="center">Load vs Temperature Correlation (Filtered)</Text>
                                <SimpleGrid cols={2} mb="xl" px="xs">
                                    <Box px="md">
                                        <Text size="xs" fw={500} c="blue" mb={6}>Winter Target: {winterTarget}°C</Text>
                                        <Slider
                                            value={winterTarget}
                                            onChange={setWinterTarget}
                                            min={-15}
                                            max={40}
                                            step={0.5}
                                            marks={[
                                                { value: -10, label: '-10' },
                                                { value: 0, label: '0' },
                                                { value: 10, label: '10' },
                                                { value: 20, label: '20' },
                                                { value: 30, label: '30' },
                                                { value: 40, label: '40' }
                                            ]}
                                            color="blue"
                                            styles={{ markLabel: { fontSize: 9, color: '#A6A7AB', marginTop: 5 } }}
                                        />
                                    </Box>
                                    <Box px="md">
                                        <Text size="xs" fw={500} c="red" mb={6}>Summer Target: {summerTarget}°C</Text>
                                        <Slider
                                            value={summerTarget}
                                            onChange={setSummerTarget}
                                            min={-15}
                                            max={40}
                                            step={0.5}
                                            marks={[
                                                { value: -10, label: '-10' },
                                                { value: 0, label: '0' },
                                                { value: 10, label: '10' },
                                                { value: 20, label: '20' },
                                                { value: 30, label: '30' },
                                                { value: 40, label: '40' }
                                            ]}
                                            color="red"
                                            styles={{ markLabel: { fontSize: 9, color: '#A6A7AB', marginTop: 5 } }}
                                        />
                                    </Box>
                                </SimpleGrid>
                                <ReactECharts
                                    style={{ height: 260, width: '100%' }}
                                    option={{
                                        tooltip: { trigger: 'item', axisPointer: { type: 'cross' } },
                                        grid: { left: 40, right: 20, bottom: 25, top: 10, containLabel: true },
                                        xAxis: {
                                            type: 'value',
                                            nameTextStyle: { color: '#A6A7AB' },
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
                                                name: 'Summer Points',
                                                type: 'scatter',
                                                data: seasonalData.summerRaw.map(d => [d.x, d.y]),
                                                itemStyle: { color: '#fa5252', opacity: 0.5 },
                                                symbolSize: 6,
                                            },
                                            {
                                                name: 'Winter Points',
                                                type: 'scatter',
                                                data: seasonalData.winterRaw.map(d => [d.x, d.y]),
                                                itemStyle: { color: '#339af0', opacity: 0.5 },
                                                symbolSize: 6,
                                            },
                                            {
                                                name: 'Transition Points',
                                                type: 'scatter',
                                                data: seasonalData.neutralRaw.map(d => [d.x, d.y]),
                                                itemStyle: { color: '#868e96', opacity: 0.5 },
                                                symbolSize: 6,
                                            },
                                            seasonalData.summer && {
                                                name: 'Summer Regression',
                                                type: 'line',
                                                data: [seasonalData.summer.start, seasonalData.summer.end],
                                                itemStyle: { color: '#e03131' },
                                                showSymbol: false,
                                                lineStyle: { width: 2, type: 'dashed' },
                                                smooth: false
                                            },
                                            seasonalData.winter && {
                                                name: 'Winter Regression',
                                                type: 'line',
                                                data: [seasonalData.winter.start, seasonalData.winter.end],
                                                itemStyle: { color: '#1c7ed6' },
                                                showSymbol: false,
                                                lineStyle: { width: 2, type: 'dashed' },
                                                smooth: false
                                            },
                                            seasonalData.summer && {
                                                name: 'Summer Target',
                                                type: 'scatter',
                                                data: [[summerTarget, seasonalData.summer.slope * summerTarget + seasonalData.summer.intercept]],
                                                itemStyle: {
                                                    color: '#e03131',
                                                    borderColor: '#fff',
                                                    borderWidth: 1,
                                                    shadowBlur: 5,
                                                    shadowColor: 'rgba(224, 49, 49, 0.8)'
                                                },
                                                symbolSize: 12,
                                                symbol: 'diamond',
                                                label: {
                                                    show: true,
                                                    formatter: (params: any) => `Summer: ${params.value[1].toFixed(2)} kWh`,
                                                    position: 'top',
                                                    color: '#fff',
                                                    fontSize: 10,
                                                    fontWeight: 'bold',
                                                    backgroundColor: 'rgba(0,0,0,0.6)',
                                                    padding: [2, 4],
                                                    borderRadius: 2
                                                }
                                            },
                                            seasonalData.winter && {
                                                name: 'Winter Target',
                                                type: 'scatter',
                                                data: [[winterTarget, seasonalData.winter.slope * winterTarget + seasonalData.winter.intercept]],
                                                itemStyle: {
                                                    color: '#1c7ed6',
                                                    borderColor: '#fff',
                                                    borderWidth: 1,
                                                    shadowBlur: 5,
                                                    shadowColor: 'rgba(28, 126, 214, 0.8)'
                                                },
                                                symbolSize: 12,
                                                symbol: 'diamond',
                                                label: {
                                                    show: true,
                                                    formatter: (params: any) => `Winter: ${params.value[1].toFixed(2)} kWh`,
                                                    position: 'bottom',
                                                    color: '#fff',
                                                    fontSize: 10,
                                                    fontWeight: 'bold',
                                                    backgroundColor: 'rgba(0,0,0,0.6)',
                                                    padding: [2, 4],
                                                    borderRadius: 2
                                                }
                                            }
                                        ].filter(Boolean)
                                    }}
                                />
                            </Box>
                        </SimpleGrid>
                    </Stack>
                </Box>
            )}
        </AnalysisWindow>
    );
});
