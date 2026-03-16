import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const ScrollingNumbersAnimation: React.FC = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dataSize, setDataSize] = useState("0 MB");

    useEffect(() => {
        if (!containerRef.current) return;

        const container = d3.select(containerRef.current);
        const width = 200;
        const height = 200; // Match sibling components exactly

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

        const driftSpeed = 1.0; 
        let points: { x: number, y: number, value: number, elapsed: number }[] = [];

        const names = [
            "Million", "Billion", "Trillion", "Quadrillion", "Quintillion", 
            "Sextillion", "Septillion", "Octillion", "Nonillion", "Decillion"
        ];

        const formatSize = (mb: number) => {
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
            // ULTRA extreme growth rate
            // Starts near zero for a long time then explodes vertically
            const growthRate = 0.0008; 
            const currentMB = Math.exp(elapsed * growthRate) - 1;
            const displayMB = Math.max(0, currentMB);
            setDataSize(formatSize(displayMB));

            // Viewport rescales: Linear Y logic for "zoom out" effect
            // Tight viewMax for extreme verticality at the right
            const viewMax = displayMB * 1.015;
            const yScale = d3.scaleLinear()
                .domain([0, viewMax])
                .range([height - 20, 10]);

            // Vertical Drift
            points.push({ x: width, y: 0, value: displayMB, elapsed });
            points = points.map(p => ({
                ...p,
                x: p.x - driftSpeed,
                y: yScale(p.value)
            }));
            points = points.filter(p => p.x > -100);

            gridGroup.selectAll("*").remove();

            // 1. Horizontal Zooming Grid (Y) - Extend fully to the left
            const minPower = Math.floor(Math.log10(Math.max(1, displayMB / 10000)));
            const maxPower = Math.ceil(Math.log10(viewMax));

            for (let p = minPower; p <= maxPower; p++) {
                const baseVal = Math.pow(10, p);
                const pixelsPerStep = Math.abs(yScale(0) - yScale(baseVal));
                const opacity = Math.max(0, Math.min(0.6, (pixelsPerStep - 4) / 40));
                
                if (opacity <= 0 && p < maxPower) continue;

                for (let i = 1; i < 10; i++) {
                    const val = i * baseVal;
                    const gy = yScale(val);
                    if (gy < -20 || gy > height + 20) continue;

                    const isMajor = i === 1;
                    gridGroup.append("line")
                        .attr("x1", -150) // Extend far left to cover the line's start
                        .attr("x2", width + 20)
                        .attr("y1", gy)
                        .attr("y2", gy)
                        .attr("stroke", "var(--ifm-color-emphasis-300)")
                        .attr("stroke-width", isMajor ? 1.5 : 0.8) // Higher opacity/thickness
                        .attr("opacity", isMajor ? Math.min(0.7, opacity * 2) : opacity);
                }
            }

            // 2. Vertical Zooming Grid (X) - Also extend
            const vPixelsPerMs = driftSpeed / (1000/60); 
            const timePower = Math.floor(Math.log10(Math.max(1, elapsed / 2000)));
            const tScale = Math.pow(10, timePower) * 300; 
            const vGap = tScale * vPixelsPerMs;
            const vOpacity = Math.max(0, Math.min(0.5, (vGap - 10) / 40));

            for (let t = Math.floor((elapsed - (width+150)/vPixelsPerMs)/tScale)*tScale; t <= elapsed; t += tScale) {
                if (t < 0) continue;
                const actualX = width - (elapsed - t) * vPixelsPerMs;
                if (actualX < -150 || actualX > width + 20) continue;

                gridGroup.append("line")
                    .attr("x1", actualX)
                    .attr("x2", actualX)
                    .attr("y1", -20)
                    .attr("y2", height + 20)
                    .attr("stroke", "var(--ifm-color-emphasis-300)")
                    .attr("stroke-width", 1.0)
                    .attr("opacity", vOpacity);
            }

            // Path & Area
            areaGroup.selectAll("*").remove();
            curveGroup.selectAll("*").remove();
            labelGroup.selectAll("*").remove();

            const lineGen = d3.line<{x:number, y:number}>().x(d=>d.x).y(d=>d.y).curve(d3.curveMonotoneX);
            const areaGen = d3.area<{x:number, y:number}>().x(d=>d.x).y0(height-20).y1(d=>d.y).curve(d3.curveMonotoneX);

            areaGroup.append("path")
                .datum(points)
                .attr("fill", "#888")
                .attr("opacity", 0.2)
                .attr("d", areaGen);

            curveGroup.append("path")
                .datum(points)
                .attr("fill", "none")
                .attr("stroke", "#888")
                .attr("stroke-width", 2.2)
                .attr("opacity", 0.7)
                .attr("d", lineGen);

            // Lead point & Floating label
            if (points.length > 0) {
                const lead = points[points.length - 1];
                
                // Glow Dot
                curveGroup.append("circle")
                    .attr("cx", lead.x)
                    .attr("cy", lead.y)
                    .attr("r", 4.5)
                    .attr("fill", "var(--ifm-color-primary)")
                    .attr("filter", "drop-shadow(0 0 10px var(--ifm-color-primary))");

                // Label follows dot, smaller and closer
                labelGroup.append("text")
                    .attr("x", lead.x - 8)
                    .attr("y", lead.y - 8)
                    .attr("text-anchor", "end")
                    .attr("fill", "var(--ifm-color-primary)")
                    .style("font-family", "monospace")
                    .style("font-size", "10px") // Smaller font
                    .style("font-weight", "bold")
                    .style("text-shadow", "0 0 4px rgba(0,0,0,0.8)")
                    .text(dataSize);
            }
        });

        return () => timer.stop();
    }, []);

    return (
        <div style={{ position: 'relative', height: 200, width: 200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
                ref={containerRef}
                style={{ width: '200px', height: '200px', overflow: 'visible' }}
            />
        </div>
    );
};

export default ScrollingNumbersAnimation;
