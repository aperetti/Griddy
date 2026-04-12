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
    const workspaceRef = useRef<SVGSVGElement | null>(null);
    const moveableRef = useRef<Moveable>(null);
    const [target, setTarget] = useState<SVGGraphicsElement | null>(null);
    const isInteracting = useRef(false);

    // Parse the base SVG to establish the coordinate system
    const baseInfo = useMemo(() => {
        if (!baseSvg) return { viewBox: '0 0 100 100', content: '' };
        const parser = new DOMParser();
        const doc = parser.parseFromString(baseSvg, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        return {
            viewBox: svg?.getAttribute('viewBox') || '0 0 100 100',
            content: svg ? Array.from(svg.childNodes).map(n => n.cloneNode(true)) : []
        };
    }, [baseSvg]);

    // Initial construction of the workspace
    // We only do this when the component mounts or when base/value changes *externally*
    useEffect(() => {
        if (!containerRef.current || isInteracting.current) return;

        const workspace = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        workspace.setAttribute('width', '100%');
        workspace.setAttribute('height', '100%');
        workspace.setAttribute('viewBox', baseInfo.viewBox);
        workspace.style.display = 'block';
        workspace.style.overflow = 'visible';
        
        // 1. Add Base Layer
        const baseG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        baseG.style.opacity = '0.3';
        baseG.style.color = baseColor || '#909296';
        baseG.style.pointerEvents = 'none';
        baseInfo.content.forEach(node => baseG.appendChild(node.cloneNode(true)));
        workspace.appendChild(baseG);

        // 2. Add Overlay Layer
        const parser = new DOMParser();
        const overlayDoc = parser.parseFromString(`<svg>${value || ''}</svg>`, 'image/svg+xml');
        const overlayContent = overlayDoc.querySelector('svg');
        
        if (overlayContent) {
            Array.from(overlayContent.childNodes).forEach((node, i) => {
                if (node.nodeType === 1) {
                    const el = node.cloneNode(true) as HTMLElement;
                    el.style.cursor = 'pointer';
                    (el as any).dataset.isOverlay = 'true';
                    if (!el.id) el.id = `overlay-${i}`;
                    
                    el.addEventListener('mousedown', (e) => {
                        e.stopPropagation();
                        setTarget(el as unknown as SVGGraphicsElement);
                    });
                    workspace.appendChild(el);
                }
            });
        }

        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(workspace);
        workspaceRef.current = workspace;

        workspace.addEventListener('mousedown', () => setTarget(null));
    }, [value, baseInfo, baseColor]);

    const handleSync = () => {
        if (!workspaceRef.current) return;
        
        // Collect overlay elements and serialize
        let content = '';
        const serializer = new XMLSerializer();
        
        Array.from(workspaceRef.current.childNodes).forEach(node => {
            const el = node as HTMLElement;
            if (el.dataset?.isOverlay === 'true') {
                const clone = el.cloneNode(true) as HTMLElement;
                // Remove internal temporary markers
                delete (clone as any).dataset.isOverlay;
                if (clone.id.startsWith('overlay-')) clone.removeAttribute('id');
                content += serializer.serializeToString(clone);
            }
        });

        isInteracting.current = false;
        onChange(content);
    };

    return (
        <Box style={{ width: '100%', height: '100%', position: 'relative' }}>
            <div 
                ref={containerRef} 
                style={{ 
                    width: '100%', height: '100%', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
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
                    useTouch={true}
                    onDragStart={() => { isInteracting.current = true; }}
                    onDrag={({ target, transform }) => {
                        target.setAttribute('transform', transform);
                    }}
                    onDragEnd={handleSync}
                    onResizeStart={() => { isInteracting.current = true; }}
                    onResize={({ target, drag }) => {
                        target.setAttribute('transform', drag.transform);
                    }}
                    onResizeEnd={handleSync}
                    onRotateStart={() => { isInteracting.current = true; }}
                    onRotate={({ target, transform }) => {
                        target.setAttribute('transform', transform);
                    }}
                    onRotateEnd={handleSync}
                    origin={false}
                    edge={false}
                />
            )}
        </Box>
    );
};
