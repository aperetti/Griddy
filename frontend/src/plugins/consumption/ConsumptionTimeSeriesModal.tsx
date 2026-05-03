import { memo, useState, useMemo, useEffect, useRef } from 'react';
import { Group, Box, Text, Stack, Select, Slider, SimpleGrid, Button, Paper } from '@mantine/core';
import { AlertTriangle, Clock, Activity } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { ScadaLoadingAnimation, AnalysisWindow, perf } from '@plugin-sdk';
import { autoExport, getDataToCopy } from '../../shared/utils/exportUtils';
import { ResizableChartPanel } from '../../shared/components/ResizableChartPanel';
import {
    buildTimeSeriesOption,
    buildDailyProfileOption,
    buildCorrelationOption,
} from './model/consumptionChartOptions';

interface ReadingData {
    timestamp: string;
    kwh_delivered: number | null;
    kwh_received: number | null;
    net_consumption: number | null;
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
    onFocus?: () => void;
    zIndex?: number;
    layoutMode?: 'floating' | 'grid';
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
    label: `${i.toString().padStart(2, '0')}:00`,
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
    onFocus,
    zIndex,
    layoutMode,
}: Props) {
    const [startHour, setStartHour] = useState<string>('0');
    const [endHour, setEndHour] = useState<string>('23');
    const [startMonth, setStartMonth] = useState<string>('0');
    const [endMonth, setEndMonth] = useState<string>('11');
    const [winterTarget, setWinterTarget] = useState<number>(-5);
    const [summerTarget, setSummerTarget] = useState<number>(30);

    const safeName = nodeName ?? 'unknown';

    // ── Performance timing ──────────────────────────────────────
    const dataArrivedAtRef = useRef<number | null>(null);
    const firstChartReportedRef = useRef<boolean>(false);
    useEffect(() => {
        if (data && data.length > 0 && dataArrivedAtRef.current === null) {
            dataArrivedAtRef.current = performance.now();
            firstChartReportedRef.current = false;
        }
        if (!data || data.length === 0) {
            dataArrivedAtRef.current = null;
        }
    }, [data]);

    const handleExport = () => {
        if (!data || data.length === 0) return;
        autoExport(data, `consumption_${nodeName?.replace(/\s+/g, '_')}`);
    };

    const handleCopy = () => {
        if (!data || data.length === 0) return '';
        return getDataToCopy(data);
    };

    // ── Month range auto-detection ──────────────────────────────
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

    // ── Data filtering ──────────────────────────────────────────
    const filteredByMonth = useMemo(() => {
        const sM = parseInt(startMonth);
        const eM = parseInt(endMonth);

        return data.filter((d) => {
            const date = new Date(d.timestamp);
            const month = date.getUTCMonth();

            return sM <= eM
                ? month >= sM && month <= eM
                : month >= sM || month <= eM;
        });
    }, [data, startMonth, endMonth]);

    const filteredData = useMemo(() => {
        const sH = parseInt(startHour);
        const eH = parseInt(endHour);

        return filteredByMonth.filter((d) => {
            const date = new Date(d.timestamp);
            const hour = date.getUTCHours();

            return sH <= eH
                ? hour >= sH && hour <= eH
                : hour >= sH || hour <= eH;
        });
    }, [filteredByMonth, startHour, endHour]);

    // ── Seasonal correlation ────────────────────────────────────
    const seasonalData = useMemo(
        () =>
            perf.measureSync('memo:seasonal_regression', () => {
                const summerPoints: { x: number; y: number }[] = [];
                const winterPoints: { x: number; y: number }[] = [];
                const neutralPoints: { x: number; y: number }[] = [];

                filteredData.forEach((d) => {
                    if (d.temperature != null && d.kwh_delivered != null) {
                        const date = new Date(d.timestamp);
                        const month = date.getUTCMonth();
                        const p = { x: d.temperature, y: d.kwh_delivered };

                        if (month >= 4 && month <= 8) {
                            summerPoints.push(p);
                        } else if (month >= 10 || month <= 2) {
                            winterPoints.push(p);
                        } else {
                            neutralPoints.push(p);
                        }
                    }
                });

                const calcReg = (points: { x: number; y: number }[]) => {
                    if (points.length < 2) return null;
                    const n = points.length;
                    let sumX = 0,
                        sumY = 0,
                        sumXY = 0,
                        sumX2 = 0;
                    let minX = points[0].x,
                        maxX = points[0].x;
                    for (const p of points) {
                        sumX += p.x;
                        sumY += p.y;
                        sumXY += p.x * p.y;
                        sumX2 += p.x * p.x;
                        if (p.x < minX) minX = p.x;
                        if (p.x > maxX) maxX = p.x;
                    }
                    const denominator = n * sumX2 - sumX * sumX;
                    if (denominator === 0) return null;
                    const slope = (n * sumXY - sumX * sumY) / denominator;
                    const intercept = (sumY - slope * sumX) / n;
                    return {
                        start: [minX, slope * minX + intercept],
                        end: [maxX, slope * maxX + intercept],
                        slope,
                        intercept,
                    };
                };

                return {
                    summer: calcReg(summerPoints),
                    winter: calcReg(winterPoints),
                    summerRaw: summerPoints,
                    winterRaw: winterPoints,
                    neutralRaw: neutralPoints,
                };
            }),
        [filteredData],
    );

    // ── Temperature smoothing ───────────────────────────────────
    const smoothedTemperatures = useMemo(
        () =>
            perf.measureSync('memo:smoothed_temp', () => {
                if (data.length === 0) return [];
                const windowSize = 96;
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
            }),
        [data],
    );

    // ── Time-series downsampling ────────────────────────────────
    const timeSeriesData = useMemo(
        () =>
            perf.measureSync('memo:timeseries_downsample', () => {
                if (data.length === 0) return [];

                const first = new Date(data[0].timestamp).getTime();
                const last = new Date(data[data.length - 1].timestamp).getTime();
                const spanDays = (last - first) / (1000 * 60 * 60 * 24);

                if (spanDays <= 90) {
                    return data.map((d, i) => [
                        new Date(d.timestamp).getTime(),
                        d.kwh_delivered,
                        smoothedTemperatures[i],
                        d.kwh_received,
                        d.net_consumption,
                    ]);
                }

                const bucketHours = spanDays > 365 ? 3 : 1;
                const bucketMs = bucketHours * 60 * 60 * 1000;
                const aggregated: [
                    number,
                    number | null,
                    number | null,
                    number | null,
                    number | null,
                ][] = [];
                let curKwh: number[] = [];
                let curTemp: number[] = [];
                let curKwhRcv: number[] = [];
                let curNet: number[] = [];
                let bucketStartTime = Math.floor(first / bucketMs) * bucketMs;

                data.forEach((d, i) => {
                    const time = new Date(d.timestamp).getTime();
                    const sTemp = smoothedTemperatures[i];
                    if (time < bucketStartTime + bucketMs) {
                        if (d.kwh_delivered != null) curKwh.push(d.kwh_delivered);
                        if (sTemp != null) curTemp.push(sTemp);
                        if (d.kwh_received != null) curKwhRcv.push(d.kwh_received);
                        if (d.net_consumption != null) curNet.push(d.net_consumption);
                    } else {
                        if (curKwh.length > 0 || curTemp.length > 0) {
                            const avgKwh = curKwh.length > 0 ? curKwh.reduce((a, b) => a + b, 0) / curKwh.length : null;
                            const avgTemp = curTemp.length > 0 ? curTemp.reduce((a, b) => a + b, 0) / curTemp.length : null;
                            const avgKwhRcv = curKwhRcv.length > 0 ? curKwhRcv.reduce((a, b) => a + b, 0) / curKwhRcv.length : null;
                            const avgNet = curNet.length > 0 ? curNet.reduce((a, b) => a + b, 0) / curNet.length : null;

                            aggregated.push([bucketStartTime, avgKwh, avgTemp, avgKwhRcv, avgNet]);
                        }
                        bucketStartTime = Math.floor(time / bucketMs) * bucketMs;
                        curKwh = d.kwh_delivered != null ? [d.kwh_delivered] : [];
                        curTemp = sTemp != null ? [sTemp] : [];
                        curKwhRcv = d.kwh_received != null ? [d.kwh_received] : [];
                        curNet = d.net_consumption != null ? [d.net_consumption] : [];
                    }
                });

                if (curKwh.length > 0 || curTemp.length > 0) {
                    const avgKwh = curKwh.length > 0 ? curKwh.reduce((a, b) => a + b, 0) / curKwh.length : null;
                    const avgTemp = curTemp.length > 0 ? curTemp.reduce((a, b) => a + b, 0) / curTemp.length : null;
                    const avgKwhRcv = curKwhRcv.length > 0 ? curKwhRcv.reduce((a, b) => a + b, 0) / curKwhRcv.length : null;
                    const avgNet = curNet.length > 0 ? curNet.reduce((a, b) => a + b, 0) / curNet.length : null;

                    aggregated.push([bucketStartTime, avgKwh, avgTemp, avgKwhRcv, avgNet]);
                }

                return aggregated;
            }),
        [data],
    );

    // ── Hourly aggregation ──────────────────────────────────────
    const hourlyAggregation = useMemo(
        () =>
            perf.measureSync('memo:hourly_aggregation', () => {
                const buckets = Array.from({ length: 24 }, () => ({ total: 0, count: 0 }));

                filteredByMonth.forEach((d) => {
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
                    avg: b.count > 0 ? b.total / b.count : 0,
                }));
            }),
        [filteredByMonth],
    );

    // ── Month marker lines ──────────────────────────────────────
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
                        borderRadius: 2,
                    },
                    lineStyle: { type: 'solid', color: 'rgba(255, 255, 255, 0.2)', width: 1 },
                });
            }
            lastMonth = month;
        });
        return marks;
    }, [data]);

    // ── Filters ─────────────────────────────────────────────────
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
                    comboboxProps={{ withinPortal: true, zIndex: 100000 }}
                />
                <Text size="xs" c="dimmed">to</Text>
                <Select
                    id="select-month-end"
                    data={MONTH_OPTIONS}
                    value={endMonth}
                    onChange={(v) => v && setEndMonth(v)}
                    size="xs"
                    w={80}
                    comboboxProps={{ withinPortal: true, zIndex: 100000 }}
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
                    comboboxProps={{ withinPortal: true, zIndex: 100000 }}
                />
                <Text size="xs" c="dimmed">to</Text>
                <Select
                    id="select-hour-end"
                    data={HOUR_OPTIONS}
                    value={endHour}
                    onChange={(v) => v && setEndHour(v)}
                    size="xs"
                    w={90}
                    comboboxProps={{ withinPortal: true, zIndex: 100000 }}
                />
            </Group>
            <Text size="xs" c="dimmed" style={{ fontStyle: 'italic' }}>
                *Month slicer affects Daily Profile; Hour slicer affects Correlation
            </Text>
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
            zIndex={zIndex ?? 1000}
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
                        {/* 1. Time-Series */}
                        <ResizableChartPanel
                            title="Consumption Time-Series (Full Period)"
                            storageKey={`consumption-ts-${safeName}`}
                            defaultHeight={280}
                        >
                            <ReactECharts
                                style={{ height: '100%', width: '100%' }}
                                option={buildTimeSeriesOption(timeSeriesData, markLines)}
                                onChartReady={(chart) => {
                                    chart.group = 'consumption-sync';
                                    echarts.connect('consumption-sync');
                                    if (!firstChartReportedRef.current && dataArrivedAtRef.current !== null) {
                                        firstChartReportedRef.current = true;
                                        perf.mark('chart:first_ready', performance.now() - dataArrivedAtRef.current);
                                        setTimeout(() => perf.dump('consumption'), 0);
                                    }
                                }}
                            />
                        </ResizableChartPanel>

                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="xl">
                            {/* 2. Daily Load Profile */}
                            <ResizableChartPanel
                                title="Typical Daily Load Profile (Hourly Avg)"
                                storageKey={`consumption-daily-${safeName}`}
                                defaultHeight={380}
                            >
                                <ReactECharts
                                    style={{ height: '100%', width: '100%' }}
                                    option={buildDailyProfileOption(hourlyAggregation)}
                                />
                            </ResizableChartPanel>

                            {/* 3. Load vs Temperature Correlation */}
                            <ResizableChartPanel
                                title="Load vs Temperature Correlation (Filtered)"
                                storageKey={`consumption-corr-${safeName}`}
                                defaultHeight={420}
                                minHeight={320}
                            >
                                <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                    <SimpleGrid cols={2} mb="xs" px="xs">
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
                                                    { value: 40, label: '40' },
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
                                                    { value: 40, label: '40' },
                                                ]}
                                                color="red"
                                                styles={{ markLabel: { fontSize: 9, color: '#A6A7AB', marginTop: 5 } }}
                                            />
                                        </Box>
                                    </SimpleGrid>
                                    <Box style={{ flex: 1, minHeight: 0 }}>
                                        <ReactECharts
                                            style={{ height: '100%', width: '100%' }}
                                            option={buildCorrelationOption(
                                                seasonalData.summerRaw,
                                                seasonalData.winterRaw,
                                                seasonalData.neutralRaw,
                                                seasonalData.summer,
                                                seasonalData.winter,
                                                summerTarget,
                                                winterTarget,
                                            )}
                                        />
                                    </Box>
                                </Box>
                            </ResizableChartPanel>
                        </SimpleGrid>
                    </Stack>
                </Box>
            )}
        </AnalysisWindow>
    );
});
