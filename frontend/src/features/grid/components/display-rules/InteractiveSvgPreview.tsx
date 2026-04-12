import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Box } from '@mantine/core';

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
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [interaction, setInteraction] = useState<{
        type: 'translate' | 'scale' | 'rotate';
        startX: number;
        startY: number;
        startTransform: Transform;
        centerX: number;
        centerY: number;
    } | null>(null);

    // Parse the SVG into a DOM structure for rendering
    // We use a key based on the 'value' to re-render when the text editor changes
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
        
        // Ensure SVG fills container but keeps aspect ratio
        clone.setAttribute('width', '100%');
        clone.setAttribute('height', '100%');
        clone.style.display = 'block';
        clone.style.overflow = 'visible';
        
        containerRef.current.appendChild(clone);
        svgRef.current = clone;

        // Add click listeners to all <g> elements
        const groups = clone.querySelectorAll('g');
        groups.forEach((g) => {
            (g as HTMLElement).style.cursor = 'pointer';
            g.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                setSelectedId(g.id);
                
                const currentT = parseTransform(g.getAttribute('transform') || '');
                const bbox = (g as SVGGraphicsElement).getBBox();
                const ctm = (g as SVGGraphicsElement).getScreenCTM();
                
                if (ctm) {
                    const centerX = ctm.e + (bbox.x + bbox.width / 2) * ctm.a;
                    const centerY = ctm.f + (bbox.y + bbox.height / 2) * ctm.d;
                    
                    setInteraction({
                        type: 'translate',
                        startX: e.clientX,
                        startY: e.clientY,
                        startTransform: currentT,
                        centerX,
                        centerY
                    });
                }
            });
        });

        // Deselect if clicking background
        clone.addEventListener('mousedown', () => setSelectedId(null));

    }, [parsedSvg]);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!interaction || !selectedId || !svgRef.current) return;

        const target = svgRef.current.getElementById(selectedId) as SVGGraphicsElement;
        if (!target) return;

        const dx = e.clientX - interaction.startX;
        const dy = e.clientY - interaction.startY;
        const newTransform = { ...interaction.startTransform };

        if (interaction.type === 'translate') {
            newTransform.x += dx;
            newTransform.y += dy;
        } else if (interaction.type === 'rotate') {
            const startAngle = Math.atan2(interaction.startY - interaction.centerY, interaction.startX - interaction.centerX);
            const currentAngle = Math.atan2(e.clientY - interaction.centerY, e.clientX - interaction.centerX);
            newTransform.rotate += (currentAngle - startAngle) * (180 / Math.PI);
        } else if (interaction.type === 'scale') {
            const startDist = Math.hypot(interaction.startX - interaction.centerX, interaction.startY - interaction.centerY);
            const currentDist = Math.hypot(e.clientX - interaction.centerX, e.clientY - interaction.centerY);
            newTransform.scale *= (currentDist / startDist);
        }

        target.setAttribute('transform', stringifyTransform(newTransform));
    };

    const handleMouseUp = () => {
        if (!interaction || !svgRef.current) return;
        setInteraction(null);

        // Serialize the current state back to the parent
        const serializer = new XMLSerializer();
        let result = serializer.serializeToString(svgRef.current);
        
        // Cleanup: remove the temporary IDs we added if they weren't in the original
        // Actually, it's safer to just keep them or filter them out.
        // For now, let's just pass the result.
        onChange(result);
    };

    // Render handles overlay if a group is selected
    const renderHandles = () => {
        if (!selectedId || !svgRef.current) return null;
        const target = svgRef.current.getElementById(selectedId) as SVGGraphicsElement;
        if (!target) return null;

        const bbox = target.getBBox();
        const ctm = target.getScreenCTM();
        if (!ctm) return null;

        // We need coordinates relative to the preview Paper container
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return null;

        const x = ctm.e - containerRect.left + (bbox.x * ctm.a);
        const y = ctm.f - containerRect.top + (bbox.y * ctm.d);
        const w = bbox.width * ctm.a;
        const h = bbox.height * ctm.d;

        const handleSize = 8;
        const rotateHandleDistance = 25;

        const onHandleDown = (type: 'scale' | 'rotate', e: React.MouseEvent) => {
            e.stopPropagation();
            const currentT = parseTransform(target.getAttribute('transform') || '');
            
            setInteraction({
                type,
                startX: e.clientX,
                startY: e.clientY,
                startTransform: currentT,
                centerX: ctm.e + (bbox.x + bbox.width / 2) * ctm.a,
                centerY: ctm.f + (bbox.y + bbox.height / 2) * ctm.d
            });
        };

        return (
            <div style={{
                position: 'absolute',
                top: 0, left: 0, width: '100%', height: '100%',
                pointerEvents: 'none',
                zIndex: 10
            }}>
                {/* Bounding Box */}
                <div style={{
                    position: 'absolute',
                    left: x, top: y, width: w, height: h,
                    border: '1px solid #339af0',
                    pointerEvents: 'none'
                }} />

                {/* Scale Handle (Bottom Right) */}
                <div 
                    onMouseDown={(e) => onHandleDown('scale', e)}
                    style={{
                        position: 'absolute',
                        left: x + w - handleSize/2, top: y + h - handleSize/2,
                        width: handleSize, height: handleSize,
                        backgroundColor: '#fff', border: '1px solid #339af0',
                        cursor: 'nwse-resize', pointerEvents: 'auto'
                    }} 
                />

                {/* Rotate Handle (Top Center) */}
                <div 
                    onMouseDown={(e) => onHandleDown('rotate', e)}
                    style={{
                        position: 'absolute',
                        left: x + w/2 - handleSize/2, top: y - rotateHandleDistance,
                        width: handleSize, height: handleSize,
                        backgroundColor: '#fff', border: '1px solid #339af0', borderRadius: '50%',
                        cursor: 'crosshair', pointerEvents: 'auto'
                    }} 
                />
                <div style={{
                    position: 'absolute',
                    left: x + w/2, top: y - rotateHandleDistance + handleSize,
                    width: 1, height: rotateHandleDistance - handleSize,
                    backgroundColor: '#339af0'
                }} />
            </div>
        );
    };

    return (
        <Box 
            style={{ width: '100%', height: '100%', position: 'relative' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
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
            {renderHandles()}
        </Box>
    );
};
