import React, { useMemo } from 'react';
import { Box } from '@mantine/core';

interface RuleIconPreviewProps {
    icon?: string;
    color?: string;
    size?: number;
    width?: number;
    height?: number;
    baseSvg?: string;
    baseColor?: string;
    mode?: 'replace' | 'add';
}

export const RuleIconPreview: React.FC<RuleIconPreviewProps> = ({ 
    icon, 
    color = '#ccc', 
    size = 20,
    width,
    height,
    baseSvg,
    baseColor,
    mode = 'replace'
}) => {
    const VIEWBOX_SIZE = 100;
    
    const workspaceContent = useMemo(() => {
        const parser = new DOMParser();

        // 1. BASE LAYER
        let baseContent = '';
        if (baseSvg && (mode === 'add' || !icon)) {
            const baseStr = baseSvg.includes('<svg') ? baseSvg : `<svg xmlns="http://www.w3.org/2000/svg">${baseSvg}</svg>`;
            const doc = parser.parseFromString(baseStr, 'image/svg+xml');
            const svg = doc.querySelector('svg');
            if (svg) {
                const vbStr = svg.getAttribute('viewBox');
                let transformStr = '';
                if (vbStr) {
                    const vb = vbStr.split(/[,\s]+/).map(parseFloat);
                    if (vb.length === 4) {
                        const [vx, vy, vw, vh] = vb;
                        const scale = Math.min(VIEWBOX_SIZE / vw, VIEWBOX_SIZE / vh);
                        const offX = (VIEWBOX_SIZE - (vw * scale)) / 2;
                        const offY = (VIEWBOX_SIZE - (vh * scale)) / 2;
                        transformStr = `transform="translate(${offX.toFixed(3)}, ${offY.toFixed(3)}) scale(${scale.toFixed(3)}) translate(${-vx.toFixed(3)}, ${-vy.toFixed(3)})"`;
                    }
                }
                baseContent = `<g opacity="${mode === 'add' ? 0.3 : 1.0}" fill="${baseColor || 'currentColor'}" stroke="${baseColor || 'none'}" pointer-events="none" ${transformStr}>${svg.innerHTML}</g>`;
            }
        }

        // 2. OVERLAY LAYER
        let overlayContent = '';
        if (icon && icon.includes('<svg')) {
            const doc = parser.parseFromString(icon, 'image/svg+xml');
            const svg = doc.querySelector('svg');
            if (svg) {
                const vbStr = svg.getAttribute('viewBox');
                let transformStr = '';
                if (vbStr) {
                    const vb = vbStr.split(/[,\s]+/).map(parseFloat);
                    if (vb.length === 4) {
                        const [vx, vy, vw, vh] = vb;
                        const scale = Math.min(VIEWBOX_SIZE / vw, VIEWBOX_SIZE / vh);
                        const offX = (VIEWBOX_SIZE - (vw * scale)) / 2;
                        const offY = (VIEWBOX_SIZE - (vh * scale)) / 2;
                        transformStr = `transform="translate(${offX.toFixed(3)}, ${offY.toFixed(3)}) scale(${scale.toFixed(3)}) translate(${-vx.toFixed(3)}, ${-vy.toFixed(3)})"`;
                    }
                }
                overlayContent = `<g color="${color}" fill="currentColor" ${transformStr}>${svg.innerHTML}</g>`;
            }
        } else if (icon) {
            // Partial SVG content or just inner HTML
            overlayContent = `<g color="${color}" fill="currentColor">${icon}</g>`;
        }

        if (!baseContent && !overlayContent) return null;

        return `${baseContent}${overlayContent}`;
    }, [icon, color, baseSvg, baseColor, mode]);

    if (!workspaceContent) {
        return (
            <Box style={{
                width: width || size * 0.7, 
                height: height || size * 0.7, 
                borderRadius: '50%',
                backgroundColor: color
            }} />
        );
    }

    return (
        <Box
            style={{
                width: width || size,
                height: height || size,
                lineHeight: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            <svg 
                viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
                width="100%"
                height="100%"
                style={{ display: 'block' }}
                dangerouslySetInnerHTML={{ __html: workspaceContent }}
            />
        </Box>
    );
};
