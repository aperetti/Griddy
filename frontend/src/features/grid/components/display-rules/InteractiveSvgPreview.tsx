import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Box } from '@mantine/core';
import Moveable from 'react-moveable';

interface InteractiveSvgPreviewProps {
    value: string;
    onChange: (val: string) => void;
}

interface Transform {
    x: number;
    y: number;
    scale: number;
    rotate: number;
}

/**
 * Parses an SVG transform string like "translate(10, 20) scale(1.5) rotate(45)"
 */
function parseTransform(transformStr: string): Transform {
    const t = { x: 0, y: 0, scale: 1, rotate: 0 };
    if (!transformStr) return t;

    const translateMatch = transformStr.match(/translate\(([-\d.]+)[,\s]+([-\d.]+)\)/);
    if (translateMatch) {
        t.x = parseFloat(translateMatch[1]);
        t.y = parseFloat(translateMatch[2]);
    }

    const scaleMatch = transformStr.match(/scale\(([-\d.]+)\)/);
    if (scaleMatch) {
        t.scale = parseFloat(scaleMatch[1]);
    }

    const rotateMatch = transformStr.match(/rotate\(([-\d.]+)\)/);
    if (rotateMatch) {
        t.rotate = parseFloat(rotateMatch[1]);
    }

    return t;
}

function stringifyTransform(t: Transform): string {
    const parts = [];
    if (t.x !== 0 || t.y !== 0) parts.push(`translate(${t.x.toFixed(2)}, ${t.y.toFixed(2)})`);
    if (t.scale !== 1) parts.push(`scale(${t.scale.toFixed(2)})`);
    if (t.rotate !== 0) parts.push(`rotate(${t.rotate.toFixed(2)})`);
    return parts.join(' ');
}

export const InteractiveSvgPreview: React.FC<InteractiveSvgPreviewProps> = ({ value, onChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const moveableRef = useRef<Moveable>(null);
    const [target, setTarget] = useState<SVGGraphicsElement | null>(null);

    // Parse the SVG into a DOM structure for rendering
    const parsedSvg = useMemo(() => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(value, 'image/svg+xml');
            const svgElement = doc.querySelector('svg');
            if (!svgElement) return null;

            // Ensure every <g> has an ID for selection tracking
            const groups = svgElement.querySelectorAll('g');
            groups.forEach((g, i) => {
                if (!g.id) g.id = `group-${i}`;
            });

            return svgElement;
        } catch (e) {
            console.error('Failed to parse SVG', e);
            return null;
        }
    }, [value]);

    // Apply the selection and listeners once rendered
    useEffect(() => {
        if (!containerRef.current || !parsedSvg) return;

        // Clear and append
        containerRef.current.innerHTML = '';
        const clone = parsedSvg.cloneNode(true) as SVGSVGElement;
        
        clone.setAttribute('width', '100%');
        clone.setAttribute('height', '100%');
        clone.style.display = 'block';
        clone.style.overflow = 'visible';
        
        containerRef.current.appendChild(clone);
        svgRef.current = clone;

        // Add click listeners to all <g> elements for selection
        const groups = clone.querySelectorAll('g');
        groups.forEach((g) => {
            (g as HTMLElement).style.cursor = 'pointer';
            g.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                setTarget(g as SVGGraphicsElement);
            });
        });

        // Deselect if clicking background
        clone.addEventListener('mousedown', () => setTarget(null));

    }, [parsedSvg]);

    const syncChanges = () => {
        if (!svgRef.current) return;
        const serializer = new XMLSerializer();
        const result = serializer.serializeToString(svgRef.current);
        onChange(result);
    };

    return (
        <Box 
            style={{ width: '100%', height: '100%', position: 'relative' }}
        >
            <div 
                ref={containerRef} 
                style={{ 
                    width: '100%', 
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                }} 
            />

            {target && (
                <Moveable
                    ref={moveableRef}
                    target={target}
                    draggable={true}
                    resizable={true}
                    rotatable={true}
                    keepRatio={true}
                    throttleDrag={0}
                    throttleResize={0}
                    throttleRotate={0}
                    onDrag={({ target, transform }) => {
                        target.style.transform = transform;
                    }}
                    onDragEnd={syncChanges}
                    onResize={({ target, width, height, drag }) => {
                        // For SVG <g> tags, we usually use scale transforms rather than width/height
                        // However, react-moveable can handle matrix transforms.
                        target.style.transform = drag.transform;
                    }}
                    onResizeEnd={syncChanges}
                    onRotate={({ target, transform }) => {
                        target.style.transform = transform;
                    }}
                    onRotateEnd={syncChanges}
                    origin={false}
                    edge={false}
                    padding={{ left: 0, top: 0, right: 0, bottom: 0 }}
                />
            )}
        </Box>
    );
};
