import { useRef } from 'react';
import { Box, Stack, Loader, Text } from '@mantine/core';
import { GraphCanvas, darkTheme, type GraphCanvasRef } from 'reagraph';
import { Text as ThreeText } from '@react-three/drei';
import type { GNode } from '../../../hooks/useGraphExplorer';

export const appTheme = {
  ...darkTheme,
  canvas: { ...darkTheme.canvas, background: '#0d0d0d' },
};

export function makeNodeRenderer(expandNode: (id: string) => void) {
  return ({ node, size, selected, active, opacity }: {
    node: GNode;
    size: number;
    selected: boolean;
    active: boolean;
    opacity: number;
  }) => {
    const fill = selected ? '#ffd43b' : active ? '#74c0fc' : (node.fill ?? '#4dabf7');
    const labelColor = selected ? '#ffd43b' : '#888888';
    const nameColor  = selected ? '#ffd43b' : '#c1c2c5';
    const r = size ?? 7;
    const textSize = Math.max(r * 0.55, 2.5);
    const gap = r * 1.6;
    const isBox = node.data?.shape === 'box';

    return (
      <group onDoubleClick={() => expandNode(node.id)}>
        <mesh>
          {isBox
            ? <boxGeometry args={[r * 1.8, r * 1.8, r * 1.8]} />
            : <sphereGeometry args={[r, 20, 20]} />
          }
          <meshBasicMaterial color={fill} opacity={opacity ?? 1} transparent />
        </mesh>
        <ThreeText
          position={[0, gap, 0]}
          fontSize={textSize}
          color={labelColor}
          anchorX="center"
          anchorY="bottom"
          maxWidth={r * 10}
          outlineWidth={0.3}
          outlineColor="#000"
        >
          {String(node.label ?? '')}
        </ThreeText>
        <ThreeText
          position={[0, -gap, 0]}
          fontSize={textSize * 0.85}
          color={nameColor}
          anchorX="center"
          anchorY="top"
          maxWidth={r * 10}
          outlineWidth={0.3}
          outlineColor="#000"
        >
          {String(node.subLabel ?? '')}
        </ThreeText>
      </group>
    );
  };
}

interface GraphCanvasViewProps {
  graphRef: React.RefObject<GraphCanvasRef | null>;
  nodes: any[];
  edges: any[];
  selections: string[];
  actives: string[];
  onNodeClick?: (node: any, event?: any) => void;
  onCanvasClick?: (event: any) => void;
  expandNode: (id: string) => void;
  handleNodePointerOver?: (node: any, event?: any) => void;
  handleNodePointerOut?: (node: any, event?: any) => void;
  loading?: boolean;
}

export function GraphCanvasView({
  graphRef,
  nodes,
  edges,
  selections,
  actives,
  onNodeClick,
  onCanvasClick,
  expandNode,
  handleNodePointerOver,
  handleNodePointerOut,
  loading,
}: GraphCanvasViewProps) {
  const nodeRendererRef = useRef(makeNodeRenderer(expandNode));

  if (nodes.length === 0) {
    return (
      <Stack align="center" justify="center" h="100%" gap="xs" style={{ opacity: 0.5 }}>
        <Loader size="sm" color="blue" />
        <Text size="xs" c="dimmed">Building graph...</Text>
      </Stack>
    );
  }

  return (
    <Box style={{ width: '100%', height: '100%', position: 'relative' }}>
      <GraphCanvas
        ref={graphRef}
        nodes={nodes}
        edges={edges}
        selections={selections}
        actives={actives}
        layoutType="forceDirected2d"
        layoutOverrides={{ linkDistance: 50 }}
        theme={appTheme}
        labelType="none"
        draggable
        renderNode={nodeRendererRef.current as any}
        onNodeClick={onNodeClick}
        onCanvasClick={onCanvasClick}
        onNodePointerOver={handleNodePointerOver}
        onNodePointerOut={handleNodePointerOut}
      />
      {loading && (
        <Box style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}>
          <Loader size={12} color="blue" />
        </Box>
      )}
    </Box>
  );
}
