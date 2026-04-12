import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Box } from '@mantine/core';
import Moveable from 'react-moveable';

interface InteractiveSvgPreviewProps {
    value: string;
    baseSvg?: string;
    baseColor?: string;
    onChange: (val: string) => void;
}

export const InteractiveSvgPreview: React.FC<InteractiveSvgPreviewProps> = ({ 
    value, baseSvg, baseColor, onChange 
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);
    const moveableRef = useRef<Moveable>(null);
    const [target, setTarget] = useState<SVGGraphicsElement | null>(null);

    // Parse the current overlay value
    const parsedOverlay = useMemo(() => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(value || '<svg></svg>', 'image/svg+xml');
            const svgElement = doc.querySelector('svg');
            if (!svgElement) return null;

            // Ensure every top-level child has an ID for selection tracking
            const interactiveTargets = svgElement.querySelectorAll('g, path, circle, rect, polygon, text');
            interactiveTargets.forEach((el, i) => {
                if (!el.id) el.id = `overlay-el-${i}`;
                (el as HTMLElement).dataset.isOverlay = 'true';
            });

            return svgElement;
        } catch (e) {
            console.error('Failed to parse overlay SVG', e);
            return null;
        }
    }, [value]);

    // Parse the base SVG
    const parsedBase = useMemo(() => {
        if (!baseSvg) return null;
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(baseSvg, 'image/svg+xml');
            return doc.querySelector('svg');
        } catch (e) {
            console.error('Failed to parse base SVG', e);
            return null;
        }
    }, [baseSvg]);

    // Construct the combined interactive workspace
    useEffect(() => {
        if (!containerRef.current) return;

        // 1. Create a clean workspace SVG
        const workspace = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        workspace.setAttribute('width', '100%');
        workspace.setAttribute('height', '100%');
        workspace.style.display = 'block';
        workspace.style.overflow = 'visible';
        
        // Match the viewBox of the base or use default
        const viewBox = parsedBase?.getAttribute('viewBox') || parsedOverlay?.getAttribute('viewBox') || '0 0 100 100';
        workspace.setAttribute('viewBox', viewBox);

        // 2. Append Base elements (non-interactive)
        if (parsedBase) {
            const baseG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            baseG.style.opacity = '0.3';
            baseG.style.color = baseColor || '#909296';
            baseG.style.pointerEvents = 'none';
            
            Array.from(parsedBase.childNodes).forEach(node => {
                baseG.appendChild(node.cloneNode(true));
            });
            workspace.appendChild(baseG);
        }

        // 3. Append Overlay elements (interactive)
        if (parsedOverlay) {
            Array.from(parsedOverlay.childNodes).forEach(node => {
                if (node.nodeType === 1) { // Element
                    const clone = node.cloneNode(true) as HTMLElement;
                    clone.style.cursor = 'pointer';
                    clone.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        setTarget(clone as unknown as SVGGraphicsElement);
                    });
                    workspace.appendChild(clone);
                }
            });
        }

        // 4. Update container
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(workspace);
        svgRef.current = workspace;

        // Deselect on background click
        workspace.addEventListener('mousedown', () => setTarget(null));

    }, [parsedOverlay, parsedBase, baseColor]);

    const syncChanges = () => {
        if (!svgRef.current || !parsedOverlay) return;
        
        // Create a new SVG container for the result
        const resultDoc = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        
        // Copy original viewBox and attributes
        Array.from(parsedOverlay.attributes).forEach(attr => {
            resultDoc.setAttribute(attr.name, attr.value);
        });
        
        // Find all overlay elements in the workspace and move them back to the result
        Array.from(svgRef.current.childNodes).forEach(node => {
            const el = node as HTMLElement;
            if (el.dataset?.isOverlay === 'true') {
                const cleanClone = el.cloneNode(true) as HTMLElement;
                // Clean up temporary attributes
                if (cleanClone.id.startsWith('overlay-el-')) {
                    cleanClone.removeAttribute('id');
                }
                delete cleanClone.dataset.isOverlay;
                resultDoc.appendChild(cleanClone);
            }
        });

        const serializer = new XMLSerializer();
        onChange(serializer.serializeToString(resultDoc));
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
                    pinchable={true}
                    keepRatio={true}
                    throttleDrag={0}
                    throttleResize={0}
                    throttleRotate={0}
                    useTouch={true}
                    onDrag={({ target, transform }) => {
                        target.setAttribute('transform', transform);
                    }}
                    onDragEnd={syncChanges}
                    onResize={({ target, drag }) => {
                        target.setAttribute('transform', drag.transform);
                    }}
                    onResizeEnd={syncChanges}
                    onRotate={({ target, transform }) => {
                        target.setAttribute('transform', transform);
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
