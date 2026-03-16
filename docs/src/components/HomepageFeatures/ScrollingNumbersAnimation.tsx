import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const ScrollingNumbersAnimation: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const container = d3.select(containerRef.current);
        const width = 260; // Wide canvas
        const height = 200;

        container.selectAll("*").remove();

        const svg = container.append("svg")
            .attr("width", width)
            .attr("height", height)
            .style("background", "transparent")
            .style("overflow", "visible");

        const gridGroup = svg.append("g").attr("class", "grid");
        const areaGroup = svg.append("g").attr("class", "area");
        const curveGroup = svg.append("g").attr("class", "curve");
        const labelGroup = svg.append("g").attr("class", "label");

        const names = [
            "Million", "Billion", "Trillion", "Quadrillion", "Quintillion", 
            "Sextillion", "Septillion", "Octillion", "Nonillion", "Decillion"
        ];

        const formatSize = (mb: number) => {
            if (mb < 0.1) return "0.00 MB";
            const si = ["MB", "GB", "TB", "PB", "EB", "ZB", "YB", "RB", "QB"];
            let unitIndex = 0;
            let val = mb;
            
            while (val >= 1000 && unitIndex < si.length - 1) {
                val /= 1000;
                unitIndex++;
            }

            if (unitIndex === si.length - 1 && val >= 1000) {
                let nameIndex = Math.floor(Math.log10(mb) / 3) - 3;
                if (nameIndex >= 0 && nameIndex < names.length) {
                    const divisor = Math.pow(10, (nameIndex + 3) * 3);
                    return `${(mb / divisor).toFixed(2)} ${names[nameIndex]} MB`;
                }
            }
            return `${val.toFixed(unitIndex === 0 ? 0 : 2)} ${si[unitIndex]}`;
        };

        const timer = d3.timer((elapsed) => {
            // 1. DYNAMIC GROWTH RATE
            // Slower controlled growth as requested
            const growthRate = 0.0011; 
            const currentMB = Math.exp(elapsed * growthRate) - 1;
            const displayMB = Math.max(0.1, currentMB);

            // 2. DYNAMIC Y-SCALE (The "Zoom Out" engine)
            // As displayMB grows, the top of the domain increases, 
            // causing existing power-of-10 values to move downwards.
            const viewMax = displayMB * 1.05;
            const yPaddingTop = 30;
            const yPaddingBottom = 15;
            const yScale = d3.scaleLinear()
                .domain([0, viewMax])
                .range([height - yPaddingBottom, yPaddingTop]);

            // 3. FULL CURVE REDRAW
            // To prevent a "stuttered" look, we redraw the entire span [0, width]
            // every frame, matching the growth seen on the leading edge.
            const pointsCount = 40;
            const curvePoints = d3.range(pointsCount).map(i => {
                const fraction = i / (pointsCount - 1);
                // Map the full elapsed growth across the current viewport width
                const localVal = Math.exp((fraction * elapsed) * growthRate) - 1;
                return {
                    x: fraction * width,
                    y: yScale(localVal)
                };
            });

            // --- GRID UPDATE ---
            gridGroup.selectAll("*").remove();
            
            // Horizontal GRID (Power-of-10 Zooming)
            const minPower = Math.floor(Math.log10(Math.max(1, displayMB / 10000)));
            const maxPower = Math.ceil(Math.log10(viewMax));

            for (let p = minPower; p <= maxPower; p++) {
                const baseVal = Math.pow(10, p);
                const stepPx = Math.abs(yScale(0) - yScale(baseVal));
                const opacity = Math.max(0, Math.min(0.5, (stepPx - 5) / 30));
                if (opacity <= 0 && p < maxPower) continue;

                for (let i = 1; i < 10; i++) {
                    const val = i * baseVal;
                    const gy = yScale(val);
                    if (gy < 0 || gy > height) continue;
                    const isMajor = i === 1;
                    gridGroup.append("line")
                        .attr("x1", 0).attr("x2", width).attr("y1", gy).attr("y2", gy)
                        .attr("stroke", "var(--ifm-color-emphasis-300)")
                        .attr("stroke-width", isMajor ? 1.5 : 0.8)
                        .attr("opacity", isMajor ? Math.min(0.6, opacity * 2.5) : opacity);
                }
            }

            // Vertical GRID (Scrolling for activity)
            const vGap = 40;
            const scrollOffset = (elapsed * 0.05) % vGap;
            for (let x = width + vGap - scrollOffset; x >= -vGap; x -= vGap) {
                if (x < 0 || x > width) continue;
                gridGroup.append("line")
                    .attr("x1", x).attr("x2", x).attr("y1", 0).attr("y2", height)
                    .attr("stroke", "var(--ifm-color-emphasis-300)")
                    .attr("stroke-width", 0.8)
                    .attr("opacity", 0.15);
            }

            // --- ARC UPDATE ---
            areaGroup.selectAll("*").remove();
            curveGroup.selectAll("*").remove();
            labelGroup.selectAll("*").remove();

            const line = d3.line<{x:number, y:number}>().x(d=>d.x).y(d=>d.y).curve(d3.curveMonotoneX);
            const area = d3.area<{x:number, y:number}>().x(d=>d.x).y0(height - yPaddingBottom).y1(d=>d.y).curve(d3.curveMonotoneX);

            areaGroup.append("path").datum(curvePoints).attr("fill", "var(--ifm-color-emphasis-400)").attr("opacity", 0.12).attr("d", area);
            curveGroup.append("path").datum(curvePoints).attr("fill", "none").attr("stroke", "var(--ifm-color-emphasis-400)").attr("stroke-width", 2).attr("opacity", 0.6).attr("d", line);

            if (curvePoints.length > 0) {
                const lead = curvePoints[curvePoints.length - 1];
                curveGroup.append("circle").attr("cx", lead.x).attr("cy", lead.y).attr("r", 4.5).attr("fill", "var(--ifm-color-primary)").attr("filter", "drop-shadow(0 0 10px var(--ifm-color-primary))");

                const textX = Math.min(width - 5, lead.x - 12);
                const textY = Math.max(15, lead.y - 12);

                labelGroup.append("text")
                    .attr("x", textX)
                    .attr("y", textY)
                    .attr("text-anchor", "end")
                    .attr("fill", "var(--ifm-color-primary)")
                    .style("font-family", "monospace")
                    .style("font-size", "12px")
                    .style("font-weight", "900")
                    .style("text-shadow", "0 0 8px rgba(0,0,0,1)")
                    .text(formatSize(displayMB)); // DYNAMIC NUMBER CLIMBING
            }
        });

        return () => timer.stop();
    }, []);

    return (
        <div style={{ position: 'relative', height: 200, width: 260, margin: '0 auto', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', background: 'rgba(255,255,255,0.01)' }}>
            <div
                ref={containerRef}
                style={{ width: '260px', height: '200px', overflow: 'hidden' }}
            />
        </div>
    );
};

export default ScrollingNumbersAnimation;
