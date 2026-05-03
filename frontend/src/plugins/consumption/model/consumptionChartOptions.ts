/**
 * Pure functions that build ECharts option objects for the consumption analysis window.
 * Extracted from ConsumptionTimeSeriesModal to follow clean architecture.
 */

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

interface ReadingData {
    timestamp: string;
    kwh_delivered: number | null;
    kwh_received: number | null;
    net_consumption: number | null;
    temperature: number | null;
}

/** Build month-separator mark lines from raw data. */
export function buildMarkLines(data: ReadingData[]) {
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
                    position: 'end' as const,
                    formatter: MONTH_OPTIONS[month].label,
                    color: '#A6A7AB',
                    fontSize: 10,
                    backgroundColor: 'rgba(26, 27, 30, 0.7)',
                    padding: [2, 4],
                    borderRadius: 2,
                },
                lineStyle: { type: 'solid' as const, color: 'rgba(255, 255, 255, 0.2)', width: 1 },
            });
        }
        lastMonth = month;
    });
    return marks;
}

/** Full-period consumption time-series chart. */
export function buildTimeSeriesOption(
    timeSeriesData: Array<[number, number | null, number | null, number | null, number | null]>,
    markLines: any[],
) {
    return {
        tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(26, 27, 30, 0.9)',
            borderColor: '#373A40',
            textStyle: { color: '#C1C2C5', fontSize: 11 },
        },
        useUTC: true,
        legend: {
            data: ['kWh Delivered', 'kWh Received', 'Net Consumption', 'Temp (24h Avg)'],
            selected: { 'kWh Delivered': false },
            textStyle: { color: '#A6A7AB', fontSize: 10 },
            top: 0,
        },
        grid: { left: 40, right: 40, bottom: 35, top: 45, containLabel: true },
        dataZoom: [
            { type: 'inside' as const, start: 0, end: 100, xAxisIndex: 0 },
            {
                type: 'slider' as const,
                start: 0,
                end: 100,
                height: 15,
                bottom: 10,
                textStyle: { color: '#A6A7AB' },
                borderColor: '#373A40',
                fillerColor: 'rgba(51, 154, 240, 0.2)',
                xAxisIndex: 0,
            },
        ],
        xAxis: {
            type: 'time' as const,
            axisLabel: {
                color: '#A6A7AB',
                fontSize: 10,
                formatter: (value: number) => {
                    const date = new Date(value);
                    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                },
            },
            axisLine: { lineStyle: { color: '#373A40' } },
            splitLine: { show: false },
        },
        yAxis: [
            {
                type: 'value' as const,
                name: 'kWh',
                scale: true,
                axisLabel: { color: '#A6A7AB', fontSize: 10 },
                splitLine: { lineStyle: { color: '#25262B' } },
            },
            {
                type: 'value' as const,
                name: '°C',
                scale: true,
                axisLabel: { color: '#FA5252', fontSize: 10 },
                splitLine: { show: false },
            },
        ],
        series: [
            {
                name: 'kWh Delivered',
                type: 'line' as const,
                data: timeSeriesData.map((d) => [d[0], d[1]]),
                smooth: true,
                showSymbol: false,
                itemStyle: { color: '#339af0' },
                areaStyle: {
                    opacity: 0.1,
                    color: {
                        type: 'linear' as const,
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: '#339af0' },
                            { offset: 1, color: 'rgba(51, 154, 240, 0)' },
                        ],
                    },
                },
                markLine: {
                    symbol: ['none' as const, 'none' as const],
                    silent: true,
                    data: markLines,
                },
            },
            {
                name: 'kWh Received',
                type: 'line' as const,
                data: timeSeriesData.map((d) => [d[0], d[3]]),
                smooth: true,
                showSymbol: false,
                itemStyle: { color: '#40c057' },
                areaStyle: {
                    opacity: 0.1,
                    color: {
                        type: 'linear' as const,
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: '#40c057' },
                            { offset: 1, color: 'rgba(64, 192, 87, 0)' },
                        ],
                    },
                },
            },
            {
                name: 'Net Consumption',
                type: 'line' as const,
                data: timeSeriesData.map((d) => [d[0], d[4]]),
                smooth: true,
                showSymbol: false,
                itemStyle: { color: '#ffd43b' },
                lineStyle: { width: 1.5, type: 'solid' as const },
            },
            {
                name: 'Temp (24h Avg)',
                type: 'line' as const,
                yAxisIndex: 1,
                data: timeSeriesData.map((d) => [d[0], d[2]]),
                smooth: true,
                showSymbol: false,
                itemStyle: { color: '#fa5252' },
                lineStyle: { width: 1, opacity: 0.5 },
            },
        ],
    };
}

/** Hourly average daily load profile chart. */
export function buildDailyProfileOption(hourlyData: Array<{ hour: string; avg: number }>) {
    return {
        tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(26, 27, 30, 0.9)',
            borderColor: '#373A40',
            textStyle: { color: '#C1C2C5' },
        },
        grid: { left: 50, right: 30, bottom: 25, top: 40, containLabel: true },
        xAxis: {
            type: 'category' as const,
            data: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            axisLabel: { color: '#A6A7AB', fontSize: 10 },
            axisLine: { lineStyle: { color: '#373A40' } },
        },
        yAxis: {
            type: 'value' as const,
            name: 'Avg kWh',
            scale: true,
            axisLabel: { color: '#A6A7AB', fontSize: 10 },
            splitLine: { lineStyle: { color: '#25262B' } },
        },
        series: [
            {
                name: 'Average Load',
                type: 'line' as const,
                data: hourlyData.map((h) => h.avg),
                itemStyle: { color: '#ffd43b' },
                areaStyle: {
                    opacity: 0.2,
                    color: {
                        type: 'linear' as const,
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(255, 212, 59, 0.3)' },
                            { offset: 1, color: 'rgba(255, 212, 59, 0)' },
                        ],
                    },
                },
                smooth: true,
                showSymbol: false,
            },
        ],
    };
}

/** Load vs Temperature correlation scatter with regression lines. */
export function buildCorrelationOption(
    summerRaw: Array<{ x: number; y: number }>,
    winterRaw: Array<{ x: number; y: number }>,
    neutralRaw: Array<{ x: number; y: number }>,
    summerLine: { start: number[]; end: number[]; slope: number; intercept: number } | null,
    winterLine: { start: number[]; end: number[]; slope: number; intercept: number } | null,
    summerTarget: number,
    winterTarget: number,
) {
    const series: any[] = [
        {
            name: 'Summer Points',
            type: 'scatter' as const,
            data: summerRaw.map((d) => [d.x, d.y]),
            itemStyle: { color: '#fa5252', opacity: 0.5 },
            symbolSize: 6,
        },
        {
            name: 'Winter Points',
            type: 'scatter' as const,
            data: winterRaw.map((d) => [d.x, d.y]),
            itemStyle: { color: '#339af0', opacity: 0.5 },
            symbolSize: 6,
        },
        {
            name: 'Transition Points',
            type: 'scatter' as const,
            data: neutralRaw.map((d) => [d.x, d.y]),
            itemStyle: { color: '#868e96', opacity: 0.5 },
            symbolSize: 6,
        },
    ];

    if (summerLine) {
        series.push({
            name: 'Summer Regression',
            type: 'line' as const,
            data: [summerLine.start, summerLine.end],
            itemStyle: { color: '#e03131' },
            showSymbol: false,
            lineStyle: { width: 2, type: 'dashed' as const },
            smooth: false,
        });
    }
    if (winterLine) {
        series.push({
            name: 'Winter Regression',
            type: 'line' as const,
            data: [winterLine.start, winterLine.end],
            itemStyle: { color: '#1c7ed6' },
            showSymbol: false,
            lineStyle: { width: 2, type: 'dashed' as const },
            smooth: false,
        });
    }
    if (summerLine) {
        series.push({
            name: 'Summer Target',
            type: 'scatter' as const,
            data: [[summerTarget, summerLine.slope * summerTarget + summerLine.intercept]],
            itemStyle: {
                color: '#e03131',
                borderColor: '#fff',
                borderWidth: 1,
                shadowBlur: 5,
                shadowColor: 'rgba(224, 49, 49, 0.8)',
            },
            symbolSize: 12,
            symbol: 'diamond' as const,
            label: {
                show: true,
                formatter: (params: any) => `Summer: ${params.value[1].toFixed(2)} kWh`,
                position: 'top' as const,
                color: '#fff',
                fontSize: 10,
                fontWeight: 'bold' as const,
                backgroundColor: 'rgba(0,0,0,0.6)',
                padding: [2, 4],
                borderRadius: 2,
            },
        });
    }
    if (winterLine) {
        series.push({
            name: 'Winter Target',
            type: 'scatter' as const,
            data: [[winterTarget, winterLine.slope * winterTarget + winterLine.intercept]],
            itemStyle: {
                color: '#1c7ed6',
                borderColor: '#fff',
                borderWidth: 1,
                shadowBlur: 5,
                shadowColor: 'rgba(28, 126, 214, 0.8)',
            },
            symbolSize: 12,
            symbol: 'diamond' as const,
            label: {
                show: true,
                formatter: (params: any) => `Winter: ${params.value[1].toFixed(2)} kWh`,
                position: 'bottom' as const,
                color: '#fff',
                fontSize: 10,
                fontWeight: 'bold' as const,
                backgroundColor: 'rgba(0,0,0,0.6)',
                padding: [2, 4],
                borderRadius: 2,
            },
        });
    }

    return {
        tooltip: { trigger: 'item' as const, axisPointer: { type: 'cross' as const } },
        grid: { left: 40, right: 20, bottom: 25, top: 10, containLabel: true },
        xAxis: {
            type: 'value' as const,
            nameTextStyle: { color: '#A6A7AB' },
            axisLabel: { color: '#A6A7AB', fontSize: 10 },
            splitLine: { show: true, lineStyle: { color: '#25262B' } },
        },
        yAxis: {
            type: 'value' as const,
            scale: true,
            axisLabel: { color: '#A6A7AB', fontSize: 10 },
            splitLine: { lineStyle: { color: '#25262B' } },
        },
        series,
    };
}
