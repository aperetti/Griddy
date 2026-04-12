import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Box } from '@mantine/core';

interface InteractiveSvgPreviewProps {
    value: string;
    baseSvg?: string;
    baseColor?: string;
    onChange: (val: string) => void;
}

/**
 * Strips px units, redundant namespaces, and style transforms from SVG strings.
 */
function cleanSvgContent(raw: string): string {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${raw}</svg>`, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return '';

    const cleanNode = (el: Element) => {
        const style = (el as HTMLElement).style;
        if (style && style.transform) {
            const currentAttr = el.getAttribute('transform') || '';
            const styleAttr = style.transform.replace(/px/g, '');
            el.setAttribute('transform', (currentAttr + ' ' + styleAttr).trim());
            el.style.transform = '';
        }
        el.removeAttribute('xmlns');
        Array.from(el.children).forEach(cleanNode);
    };

    Array.from(svg.children).forEach(cleanNode);
    return svg.innerHTML;
}

function getConsolidatedTransform(el: SVGGraphicsElement, dx: number = 0, dy: number = 0): string {
    const attrT = el.getAttribute('transform') || '';
    const styleT = el.style.transform || '';
    const baseTransform = (attrT + ' ' + styleT).replace(/px/g, '');
    
    let x = 0, y = 0, s = 1, r = 0;
    const tMatch = baseTransform.match(/translate\(([-\d.]+)[,\s]*([-\d.]+)?\)/);
    if (tMatch) {
        x = parseFloat(tMatch[1]);
        y = tMatch[2] ? parseFloat(tMatch[2]) : 0;
    }
    const sMatch = baseTransform.match(/scale\(([-\d.]+)\)/);
    if (sMatch) s = parseFloat(sMatch[1]);
    const rMatch = baseTransform.match(/rotate\(([-\d.]+)\)/);
    if (rMatch) r = parseFloat(rMatch[1]);

    x += dx;
    y += dy;

    const parts = [];
    if (x !== 0 || y !== 0) parts.push(`translate(${x.toFixed(2)}, ${y.toFixed(2)})`);
    if (s !== 1) parts.push(`scale(${s.toFixed(3)})`);
    if (r !== 0) parts.push(`rotate(${r.toFixed(2)})`);
    return parts.join(' ');
}

export const InteractiveSvgPreview: React.FC<InteractiveSvgPreviewProps> = ({ 
    value, baseSvg, baseColor, onChange 
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const dragStateRef = useRef<{
        startX: number;
        startY: number;
        selectedId: string;
    } | null>(null);

    const VIEWBOX_SIZE = 100;
    const DISPLAY_SIZE = 300;

    const workspaceContent = useMemo(() => {
        const parser = new DOMParser();
        
        // 1. BASE LAYER
        let baseContent = '';
        if (baseSvg) {
            const baseStr = baseSvg.includes('<svg') ? baseSvg : `<svg xmlns="http://www.w3.org/2000/svg">${baseSvg}</svg>`;
            const doc = parser.parseFromString(baseStr, 'image/svg+xml');
            const svg = doc.querySelector('svg');
            if (svg) {
                const vb = svg.getAttribute('viewBox')?.split(/[,\s]+/).map(parseFloat);
                let scaleStr = '';
                if (vb && vb.length === 4) {
                    const s = Math.min(VIEWBOX_SIZE / vb[2], VIEWBOX_SIZE / vb[3]);
                    scaleStr = `transform="scale(${s.toFixed(3)})"`;
                }
                baseContent = `<g opacity="0.3" fill="${baseColor || 'currentColor'}" stroke="${baseColor || 'none'}" pointer-events="none" ${scaleStr}>${svg.innerHTML}</g>`;
            }
        }

        // 2. OVERLAY LAYER
        const cleanedValue = cleanSvgContent(value);
        const overlayDoc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${cleanedValue}</svg>`, 'image/svg+xml');
        const overlaySvg = overlayDoc.querySelector('svg');
        let overlayItems = '';
        
        if (overlaySvg) {
            Array.from(overlaySvg.childNodes).forEach((node, i) => {
                if (node.nodeType === 1) { // Element
                    const el = node.cloneNode(true) as Element;
                    const id = `ov-${i}`;
                    el.setAttribute('id', id);
                    el.setAttribute('data-interactive', 'true');
                    (el as HTMLElement).style.cursor = 'move';
                    (el as HTMLElement).style.touchAction = 'none';
                    overlayItems += new XMLSerializer().serializeToString(el);
                }
            });
        }

        return `${baseContent}${overlayItems}`;
    }, [value, baseSvg, baseColor]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const getEventPos = (e: MouseEvent | TouchEvent, svg: SVGSVGElement) => {
            const pt = svg.createSVGPoint();
            const clientX = 'touches' in e ? (e.touches[0]?.clientX ?? e.changedTouches[0].clientX) : e.clientX;
            const clientY = 'touches' in e ? (e.touches[0]?.clientY ?? e.changedTouches[0].clientY) : e.clientY;
            pt.x = clientX;
            pt.y = clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) return { x: 0, y: 0 };
            return pt.matrixTransform(ctm.inverse());
        };

        const onStart = (e: MouseEvent | TouchEvent) => {
            const svg = container.querySelector('svg');
            if (!svg) return;

            const target = e.target as SVGGraphicsElement;
            const interactive = target.closest('[data-interactive="true"]') as SVGGraphicsElement;

            if (!interactive) {
                setSelectedId(null);
                return;
            }

            // For mobile, prevent scrolling and other browser defaults
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();

            setSelectedId(interactive.id);
            const cursor = getEventPos(e, svg);
            dragStateRef.current = {
                startX: cursor.x,
                startY: cursor.y,
                selectedId: interactive.id
            };
        };

        const onMove = (e: MouseEvent | TouchEvent) => {
            if (!dragStateRef.current) return;
            const svg = container.querySelector('svg');
            const el = svg?.getElementById(dragStateRef.current.selectedId) as SVGGraphicsElement;
            if (!svg || !el) return;

            if (e.cancelable) e.preventDefault();
            const cursor = getEventPos(e, svg);

            const dx = cursor.x - dragStateRef.current.startX;
            const dy = cursor.y - dragStateRef.current.startY;

            el.setAttribute('transform', getConsolidatedTransform(el, dx, dy));
            
            dragStateRef.current.startX = cursor.x;
            dragStateRef.current.startY = cursor.y;
        };

        const onEnd = () => {
            if (!dragStateRef.current) return;
            const svg = container.querySelector('svg');
            if (!svg) {
                dragStateRef.current = null;
                return;
            }

            // Final serialization
            let finalContent = '';
            const serializer = new XMLSerializer();
            svg.querySelectorAll('[data-interactive="true"]').forEach(el => {
                const clone = el.cloneNode(true) as HTMLElement;
                clone.removeAttribute('data-interactive');
                clone.removeAttribute('style');
                clone.removeAttribute('id');
                let str = serializer.serializeToString(clone);
                str = str.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
                finalContent += str;
            });

            dragStateRef.current = null;
            onChange(finalContent);
        };

        container.addEventListener('mousedown', onStart);
        container.addEventListener('touchstart', onStart, { passive: false });
        window.addEventListener('mousemove', onMove);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchend', onEnd);
        window.addEventListener('touchcancel', onEnd);

        return () => {
            container.removeEventListener('mousedown', onStart);
            container.removeEventListener('touchstart', onStart);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchend', onEnd);
            window.removeEventListener('touchcancel', onEnd);
        };
    }, [onChange]); // Stable dependency

    return (
        <Box 
            style={{ 
                width: '100%', height: '100%', 
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                touchAction: 'none'
            }}
        >
            <div 
                ref={containerRef}
                style={{ 
                    cursor: 'crosshair', lineHeight: 0, 
                    boxShadow: '0 4px 30px rgba(0,0,0,0.5)', borderRadius: 4,
                    touchAction: 'none'
                }}
            >
                <svg 
                    viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
                    width={DISPLAY_SIZE}
                    height={DISPLAY_SIZE}
                    style={{ backgroundColor: '#141517', display: 'block', touchAction: 'none' }}
                    dangerouslySetInnerHTML={{ __html: workspaceContent }}
                />
            </div>
        </Box>
    );
};
