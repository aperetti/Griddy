import { Stack, Box, Group, ActionIcon, Alert, Button, Text, Badge, ScrollArea } from '@mantine/core';
import { RotateCcw, Expand, AlertTriangle } from 'lucide-react';
import { GraphCanvasView } from '../components/GraphCanvasView';
import { AttributeRenderer } from '../components/AttributeRenderer';
import { bareKey } from '../utils/graphUtils';

interface MobileExplorerProps {
  nodes: any[];
  edges: any[];
  graphRef: any;
  selections: string[];
  actives: string[];
  onNodeClick: any;
  onCanvasClick: any;
  expandNode: any;
  reset: () => void;
  setPopOut: (val: boolean) => void;
  handleNodePointerOver: any;
  handleNodePointerOut: any;
  pendingExpansion: any;
  loadingIds: Set<string>;
  selectedDetails: any;
  selectedId: string | null;
  onSelectWithPath: any;
  schema: any;
}

export function MobileExplorer({
  nodes, edges, graphRef, selections, actives,
  onNodeClick, onCanvasClick, expandNode, reset,
  setPopOut, handleNodePointerOver, handleNodePointerOut,
  pendingExpansion, loadingIds,
  selectedDetails, selectedId, onSelectWithPath, schema
}: MobileExplorerProps) {
  return (
    <Stack gap="xs">
      <Box style={{ position: 'relative', height: 280, borderRadius: 8, overflow: 'hidden', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.06)' }}>
        <GraphCanvasView
          graphRef={graphRef}
          nodes={nodes}
          edges={edges}
          selections={selections}
          actives={actives}
          onNodeClick={onNodeClick}
          onCanvasClick={onCanvasClick}
          expandNode={expandNode}
          handleNodePointerOver={handleNodePointerOver}
          handleNodePointerOut={handleNodePointerOut}
          loading={loadingIds.size > 0}
        />
        
        <Group gap={4} style={{ position: 'absolute', top: 8, left: 8 }}>
          <ActionIcon size="xs" variant="subtle" color="gray" onClick={reset}>
            <RotateCcw size={10} />
          </ActionIcon>
          <ActionIcon size="xs" variant="subtle" color="blue" onClick={() => setPopOut(true)}>
            <Expand size={10} />
          </ActionIcon>
        </Group>
      </Box>

      {pendingExpansion && (
        <Alert icon={<AlertTriangle size={14} />} color="yellow" variant="light" p="xs">
          <Text size="xs" mb={6}>Expand {pendingExpansion.neighborCount} nodes?</Text>
          <Group gap={6}>
            <Button size="xs" color="yellow" onClick={pendingExpansion.confirm}>Yes</Button>
            <Button size="xs" variant="subtle" color="gray" onClick={pendingExpansion.cancel}>No</Button>
          </Group>
        </Alert>
      )}

      <Group gap={6} justify="space-between">
        <Group gap={6}>
          <Badge color="yellow" size="xs" variant="dot">Root</Badge>
          <Badge color="green" size="xs" variant="dot">Topology</Badge>
          <Badge color="blue" size="xs" variant="dot">Wires</Badge>
          <Badge color="violet" size="xs" variant="dot">Asset</Badge>
        </Group>
        <Text size="10px" c="dimmed">Long-press to expand</Text>
      </Group>

      <Box p="xs" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
        {selectedDetails ? (
          <ScrollArea.Autosize mah={300} type="scroll">
            <Stack gap="xs">
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={0} style={{ overflow: 'hidden' }}>
                  <Text size="xs" fw={700} truncate>{selectedDetails.name || bareKey(selectedId || '')}</Text>
                  <Text size="10px" c="dimmed">{selectedDetails.cim_type || selectedDetails.class || ''}</Text>
                </Stack>
              </Group>
              <AttributeRenderer
                data={selectedDetails}
                path=""
                onSelectAttribute={onSelectWithPath}
                schema={schema}
                isMobile={true}
              />
            </Stack>
          </ScrollArea.Autosize>
        ) : (
          <Text size="xs" c="dimmed" ta="center" py="xl">Select a node to builder rules from its data</Text>
        )}
      </Box>
    </Stack>
  );
}
