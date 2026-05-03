import { Flex, Box, Stack, Group, Tooltip, ActionIcon, Alert, Button, Badge, Text, ScrollArea } from '@mantine/core';
import { RotateCcw, Expand, AlertTriangle } from 'lucide-react';
import { GraphCanvasView } from '../components/GraphCanvasView';
import { AttributeRenderer } from '../components/AttributeRenderer';
import { bareKey } from '../utils/graphUtils';

interface DesktopExplorerProps {
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
  pendingExpansion: any;
  loadingIds: Set<string>;
  selectedDetails: any;
  selectedId: string | null;
  onSelectWithPath: any;
  schema: any;
  handleNodePointerOver?: (node: any, event?: any) => void;
  handleNodePointerOut?: (node: any, event?: any) => void;
}

export function DesktopExplorer({
  nodes, edges, graphRef, selections, actives,
  onNodeClick, onCanvasClick, expandNode, reset,
  setPopOut, pendingExpansion, loadingIds,
  selectedDetails, selectedId, onSelectWithPath, schema,
  handleNodePointerOver, handleNodePointerOut,
}: DesktopExplorerProps) {
  return (
    <Flex gap="md" align="stretch" style={{ flex: 1, minHeight: 0, height: '100%' }}>
      {/* Main Graph Area */}
      <Box style={{ 
        flex: 1, 
        position: 'relative', 
        borderRadius: 8, 
        overflow: 'hidden', 
        background: '#0d0d0d', 
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Box style={{ flex: 1, position: 'relative' }}>
          <GraphCanvasView
            graphRef={graphRef}
            nodes={nodes}
            edges={edges}
            selections={selections}
            actives={actives}
            onNodeClick={onNodeClick}
            onCanvasClick={onCanvasClick}
            expandNode={expandNode}
            loading={loadingIds.size > 0}
            handleNodePointerOver={handleNodePointerOver}
            handleNodePointerOut={handleNodePointerOut}
          />

          {/* Toolbar */}
          <Group gap={4} style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}>
            <Tooltip label="Reset graph" withArrow>
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={reset}>
                <RotateCcw size={10} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Pop out to larger view" withArrow>
              <ActionIcon size="xs" variant="subtle" color="blue" onClick={() => setPopOut(true)}>
                <Expand size={10} />
              </ActionIcon>
            </Tooltip>
          </Group>

          {/* Large-expansion warning */}
          {pendingExpansion && (
            <Box style={{ position: 'absolute', bottom: 12, left: 12, right: 12, zIndex: 20 }}>
              <Alert
                icon={<AlertTriangle size={14} />}
                color="yellow"
                variant="light"
                p="xs"
              >
                <Text size="xs" mb={6}><strong>{pendingExpansion.neighborCount}</strong> neighbors found.</Text>
                <Group gap={6}>
                  <Button size="xs" color="yellow" onClick={pendingExpansion.confirm}>Expand</Button>
                  <Button size="xs" variant="subtle" color="gray" onClick={pendingExpansion.cancel}>Cancel</Button>
                </Group>
              </Alert>
            </Box>
          )}
        </Box>

        {/* Bottom Legend */}
        <Box p="xs" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
          <Group gap={6} justify="space-between">
            <Group gap={6}>
              <Badge color="yellow" size="xs" variant="dot">Root</Badge>
              <Badge color="green" size="xs" variant="dot">Topology</Badge>
              <Badge color="blue" size="xs" variant="dot">Wires (Core)</Badge>
              <Badge color="violet" size="xs" variant="dot">Asset Mgmt</Badge>
              <Badge color="orange" size="xs" variant="dot">Location</Badge>
              <Badge color="yellow" size="xs" variant="dot" style={{ opacity: 0.7 }}>Extension</Badge>
            </Group>
            <Text size="10px" c="dimmed">Click CN to expand • Dbl-click any node • Hover for details</Text>
          </Group>
        </Box>
      </Box>

      {/* Right Sidebar - Attribute Detail */}
      <Box style={{ 
        width: 350, 
        border: '1px solid rgba(255,255,255,0.07)', 
        borderRadius: 8, 
        background: 'rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {selectedDetails ? (
          <>
            <Box p="xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={0} style={{ overflow: 'hidden' }}>
                  <Text size="xs" fw={700} truncate>{selectedDetails.name || bareKey(selectedId || '')}</Text>
                  <Text size="10px" c="dimmed">{selectedDetails.cim_type || selectedDetails.class || ''}</Text>
                </Stack>
                <Tooltip label="Expand in graph" withArrow>
                  <ActionIcon size="xs" variant="subtle" color="blue" onClick={() => selectedId && expandNode(selectedId)}>
                    <Expand size={11} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Box>
            <ScrollArea style={{ flex: 1 }} p="xs" offsetScrollbars>
              <Box pr="xs">
                <AttributeRenderer
                  data={selectedDetails}
                  path=""
                  onSelectAttribute={onSelectWithPath}
                  schema={schema}
                  isMobile={false}
                />
              </Box>
            </ScrollArea>
          </>
        ) : (
          <Stack align="center" justify="center" h="100%" p="md" gap="xs" style={{ opacity: 0.5 }}>
            <Text size="xs" c="dimmed" ta="center">Select a node to inspect attributes</Text>
          </Stack>
        )}
      </Box>
    </Flex>
  );
}
