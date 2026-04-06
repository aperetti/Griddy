/**
 * BusBarRenderer — custom Three.js node renderer for the one-line diagram.
 *
 * ConnectivityNodes are drawn as wide, flat rectangular bus bars instead of
 * the default sphere.  The centre node is rendered slightly taller and
 * brighter to distinguish it from its neighbours.
 *
 * Attach-equipment counts appear as a small floating text badge above the bar.
 */
import { Text } from '@react-three/drei';
import type { NodeRendererProps } from 'reagraph';
import type { BusBarNode } from '../model/OneLineModel';

/** Aspect ratio: width = size × ASPECT, depth = size × DEPTH_RATIO */
const ASPECT = 5;
const DEPTH_RATIO = 0.3;

export function BusBarRenderer({
    node,
    size,
    color,
    selected,
    active,
    opacity,
}: NodeRendererProps) {
    const busData = node.data as BusBarNode | undefined;
    const isCentre = busData?.is_centre ?? false;

    const w = size * ASPECT;
    const h = size * (isCentre ? 0.55 : 0.4);
    const d = size * DEPTH_RATIO;

    const fill = selected
        ? '#ffd43b'
        : active
        ? '#74c0fc'
        : (color as string) ?? '#4dabf7';

    const labelSize = Math.max(size * 0.5, 2.5);
    const subLabelSize = labelSize * 0.75;
    const labelY = h / 2 + labelSize * 1.2;
    const subLabelY = labelY + subLabelSize * 1.4;

    const attachedCount = busData?.attached_equipment?.length ?? 0;
    const badgeText = attachedCount > 0 ? `${attachedCount} eq` : null;

    return (
        <group>
            {/* Bus bar body */}
            <mesh>
                <boxGeometry args={[w, h, d]} />
                <meshBasicMaterial
                    color={fill}
                    opacity={opacity ?? 1}
                    transparent
                />
            </mesh>

            {/* Node name label */}
            <Text
                position={[0, labelY, 0]}
                fontSize={labelSize}
                color={selected ? '#ffd43b' : '#c1c2c5'}
                anchorX="center"
                anchorY="bottom"
                maxWidth={w * 2}
                outlineWidth={0.3}
                outlineColor="#000"
            >
                {String(node.label ?? '')}
            </Text>

            {/* Voltage / type sub-label */}
            {node.subLabel ? (
                <Text
                    position={[0, subLabelY, 0]}
                    fontSize={subLabelSize}
                    color="#868e96"
                    anchorX="center"
                    anchorY="bottom"
                    maxWidth={w * 2}
                    outlineWidth={0.25}
                    outlineColor="#000"
                >
                    {String(node.subLabel)}
                </Text>
            ) : null}

            {/* Attached equipment badge */}
            {badgeText ? (
                <Text
                    position={[w / 2 + labelSize, 0, 0]}
                    fontSize={subLabelSize * 0.85}
                    color="#94d82d"
                    anchorX="left"
                    anchorY="middle"
                    outlineWidth={0.2}
                    outlineColor="#000"
                >
                    {badgeText}
                </Text>
            ) : null}
        </group>
    );
}
