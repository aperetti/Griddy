import { createPortal } from 'react-dom';
import { ActionIcon, Text } from '@mantine/core';
import { X } from 'lucide-react';
import { GraphCanvasView } from './GraphCanvasView';

interface GraphPopOutProps {
  opened: boolean;
  onClose: () => void;
  graphRef: any;
  nodes: any[];
  edges: any[];
  selections: string[];
  actives: string[];
  onNodeClick: any;
  onCanvasClick: any;
  expandNode: any;
  title?: string;
}

export function GraphPopOut({
  opened,
  onClose,
  graphRef,
  nodes,
  edges,
  selections,
  actives,
  onNodeClick,
  onCanvasClick,
  expandNode,
  title = "Full-size Graph Explorer",
}: GraphPopOutProps) {
  if (!opened) return null;

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        width: '90vw', height: '90vh',
        background: '#141414', borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: '#1a1a1a', flexShrink: 0,
        }}>
          <Text size="sm" fw={600} c="white">{title}</Text>
          <ActionIcon onClick={onClose} variant="subtle" color="gray">
            <X size={16} />
          </ActionIcon>
        </div>
        <div style={{ flex: 1, position: 'relative', background: '#0d0d0d' }}>
          <GraphCanvasView
            graphRef={graphRef}
            nodes={nodes}
            edges={edges}
            selections={selections}
            actives={actives}
            onNodeClick={onNodeClick}
            onCanvasClick={onCanvasClick}
            expandNode={expandNode}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
