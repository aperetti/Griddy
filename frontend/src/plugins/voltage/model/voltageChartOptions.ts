/**
 * Pure functions that build ECharts option objects for the voltage analysis window.
 * Extracted from VoltageDistributionModal to follow clean architecture:
 * data transformation (chart config) goes in the model, not in JSX.
 */

/** KDE Distribution chart — three-phase voltage density. */
export function buildKdeOption(data: Array<{ voltage: number; phase_a: number; phase_b: number; phase_c: number }>) {
    return {
        tooltip: { trigger: 'axis' as const, axisPointer: { type: 'cross' as const } },
        legend: {
            data: ['Phase A', 'Phase B', 'Phase C'],
            textStyle: { color: '#A6A7AB', fontSize: 10 },
            top: 0,
            itemWidth: 10,
        },
        grid: { left: 10, right: 10, bottom: 20, top: 40, containLabel: true },
        xAxis: {
            type: 'category' as const,
            data: data.map((d) => d.voltage),
            axisLabel: { color: '#A6A7AB', fontSize: 10 },
            splitLine: { show: true, lineStyle: { color: '#25262B' } },
        },
        yAxis: {
            type: 'value' as const,
            show: false,
            splitLine: { lineStyle: { color: '#25262B' } },
        },
        series: [
            {
                name: 'Phase A',
                type: 'line' as const,
                data: data.map((d) => d.phase_a),
                itemStyle: { color: '#fa5252' },
                areaStyle: { opacity: 0.2 },
                showSymbol: false,
                smooth: true,
            },
            {
                name: 'Phase B',
                type: 'line' as const,
                data: data.map((d) => d.phase_b),
                itemStyle: { color: '#40c057' },
                areaStyle: { opacity: 0.2 },
                showSymbol: false,
                smooth: true,
            },
            {
                name: 'Phase C',
                type: 'line' as const,
                data: data.map((d) => d.phase_c),
                itemStyle: { color: '#228be6' },
                areaStyle: { opacity: 0.2 },
                showSymbol: false,
                smooth: true,
            },
        ],
    };
}

/** Daily voltage stability chart — median line with 10/90 percentile confidence band. */
export function buildStabilityOption(data: Array<{ date: string; p10: number; p50: number; p90: number }>) {
    return {
        tooltip: {
            trigger: 'axis' as const,
            backgroundColor: 'rgba(26, 27, 30, 0.95)',
            borderColor: '#373A40',
            textStyle: { color: '#C1C2C5' },
            formatter: (params: any) => {
                const date = params[0].axisValue;
                const p10 = params.find((p: any) => p.seriesName === 'P10');
                const p90_delta = params.find((p: any) => p.seriesName === 'P90');
                const median = params.find((p: any) => p.seriesName === 'Median');
                const p10_val = p10?.value || 0;
                const p90_val = p10 && p90_delta ? (p10_val + p90_delta.value).toFixed(2) : 'N/A';

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
            },
        },
        grid: { left: 40, right: 20, bottom: 20, top: 40, containLabel: true },
        xAxis: {
            type: 'category' as const,
            data: data.map((d) => d.date),
            axisLabel: { color: '#A6A7AB', fontSize: 10 },
            splitLine: { show: true, lineStyle: { color: '#25262B' } },
        },
        yAxis: {
            type: 'value' as const,
            scale: true,
            axisLabel: { color: '#A6A7AB', fontSize: 10 },
            splitLine: { lineStyle: { color: '#25262B' } },
        },
        series: [
            {
                name: 'P10',
                type: 'line' as const,
                data: data.map((d) => parseFloat((d.p10 || 0).toFixed(2))),
                lineStyle: { opacity: 0 },
                stack: 'confidence-band',
                symbol: 'none' as const,
            },
            {
                name: 'P90',
                type: 'line' as const,
                data: data.map((d) => parseFloat(((d.p90 || 0) - (d.p10 || 0)).toFixed(2))),
                lineStyle: { opacity: 0 },
                stack: 'confidence-band',
                areaStyle: { color: 'rgba(200, 200, 200, 0.2)' },
                symbol: 'none' as const,
            },
            {
                name: 'Median',
                type: 'line' as const,
                data: data.map((d) => parseFloat((d.p50 || 0).toFixed(2))),
                itemStyle: { color: '#fab005' },
                showSymbol: false,
                smooth: true,
                zIndex: 10,
            },
        ],
    };
}

/** Voltage-vs-loading heatmap — scatter density chart. */
export function buildHeatmapOption(data: Array<{ loading: number; voltage: number; count: number }>) {
    return {
        tooltip: {
            trigger: 'item' as const,
            backgroundColor: 'rgba(26, 27, 30, 0.95)',
            borderColor: '#373A40',
            textStyle: { color: '#C1C2C5', fontSize: 11, fontFamily: 'monospace' },
            formatter: (params: any) => {
                const [x, y, count] = params.data;
                return `Loading: ${x.toFixed(1)} kWh<br/>Voltage: ${y.toFixed(1)} V<br/>Occurrences: ${count}`;
            },
        },
        grid: { left: 40, right: 20, bottom: 40, top: 40, containLabel: true },
        xAxis: {
            type: 'value' as const,
            name: 'Loading (kWh)',
            nameLocation: 'middle' as const,
            nameGap: 25,
            scale: true,
            nameTextStyle: { color: '#A6A7AB', fontSize: 10 },
            axisLabel: { color: '#A6A7AB', fontSize: 10, fontFamily: 'monospace' },
            splitLine: { lineStyle: { color: '#25262B' } },
        },
        yAxis: {
            type: 'value' as const,
            name: 'Voltage (V)',
            nameLocation: 'middle' as const,
            nameGap: 30,
            scale: true,
            nameTextStyle: { color: '#A6A7AB', fontSize: 10 },
            axisLabel: { color: '#A6A7AB', fontSize: 10, fontFamily: 'monospace' },
            splitLine: { lineStyle: { color: '#25262B' } },
        },
        visualMap: {
            show: false,
            dimension: 1,
            min: 110,
            max: 130,
            inRange: { color: ['#fa5252', '#fab005', '#40c057', '#fab005', '#fa5252'] },
        },
        series: [
            {
                name: 'Density',
                type: 'scatter' as const,
                symbolSize: 4,
                symbol: 'roundRect' as const,
                itemStyle: { borderRadius: 1, opacity: 0.6 },
                data: data.map((d) => [d.loading, d.voltage, d.count]),
            },
        ],
    };
}
