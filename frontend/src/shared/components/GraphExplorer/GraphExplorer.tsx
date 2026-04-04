import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
    Stack, Box, Group, Text, Badge, ScrollArea,
    ActionIcon, Loader, Tooltip, Button, Alert
} from '@mantine/core';
import { AlertTriangle } from 'lucide-react';
import { GraphCanvas, darkTheme, useSelection, type GraphCanvasRef } from 'reagraph';
import { Text as ThreeText } from '@react-three/drei';
import { Expand, RotateCcw, X } from 'lucide-react';
import { useGraphExplorer, type GNode, type GraphPathStep } from '../../hooks/useGraphExplorer';
import { AttributeRow } from './AttributeRow';

interface GraphExplorerProps {
    rootId: string;
    onSelectAttribute: (path: string, value: any, operator?: string, graphPath?: GraphPathStep[]) => void;
    schema: Record<string, any>;
    isMobile: boolean;
}

// Internal n10s/RDF properties that are not useful for rule-building
const SKIP_KEYS = new Set(['model_id', 'uri', 'rdf__type', '__type']);

// Strip CIM class prefix for display: "TransformerEndInfo.ratedS" → "ratedS"
function bareKey(key: string): string {
    if (!key) return key;
    const dot = key.lastIndexOf('.');
    return dot > -1 ? key.slice(dot + 1) : key;
}

function renderAttributes(
    obj: any,
    path: string,
    onSelectAttribute: (path: string, value: any, operator?: string) => void,
    schema: Record<string, any>,
    isMobile: boolean,
): React.ReactNode {
    if (!obj || typeof obj !== 'object') return null;

    const className = obj.cim_type || obj.class || (path === '' ? obj.type : undefined);
    const classSchema = className ? schema[className] : null;

    let keys = Object.keys(obj).filter(k => !SKIP_KEYS.has(k));
    if (classSchema?.attributes) {
        const schemaKeys = classSchema.attributes.map((a: any) => a.name).filter(Boolean);
        keys = Array.from(new Set([...keys, ...schemaKeys]));
    }

    // Sort: meta keys first (match on bare name), then alphabetical
    const metaBare = ['id', 'mrid', 'name', 'cim_type', 'class', 'type'];
    keys.sort((a, b) => {
        const ai = metaBare.indexOf(bareKey(a)), bi = metaBare.indexOf(bareKey(b));
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return bareKey(a).localeCompare(bareKey(b));
    });

    return keys.map(key => {
        const value = obj[key] !== undefined ? obj[key] : null;
        // currentPath is the full Neo4j key (e.g. "TransformerEndInfo.ratedS") at root level,
        // or a nested path for sub-objects. This is what gets stored in the rule condition.
        const currentPath = path ? `${path}.${key}` : key;
        const display = bareKey(key); // shown in UI
        const isArray = Array.isArray(value);
        const isExpandable = !!(value && typeof value === 'object' && !isArray);

        if (isArray) {
            return (
                <AttributeRow key={currentPath} path={currentPath} label={display} value={value} isMobile={isMobile} onSelectAttribute={onSelectAttribute}>
                    <Box pl={path ? 'md' : 0} style={{ borderLeft: path ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <Text size="xs" fw={700} c="orange" mb={4}>{display}: [List of {value.length}]</Text>
                        <Box ml="md">
                            {value.map((item: any, idx: number) => (
                                <AttributeRow key={`${currentPath}.${idx}`} path={`${currentPath}.${idx}`} label={`${display}[${idx}]`} value={item} isMobile={isMobile} onSelectAttribute={onSelectAttribute}>
                                    <Group gap="xs" wrap="nowrap" align="flex-start" mb={4}>
                                        <Text size="10px" c="dimmed" style={{ flex: '0 0 40px' }}>[{idx}]:</Text>
                                        <Box style={{ flex: 1 }}>
                                            {typeof item === 'object' && item !== null
                                                ? <Box py={4} px={8} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>{renderAttributes(item, `${currentPath}.${idx}`, onSelectAttribute, schema, isMobile)}</Box>
                                                : <Text size="xs" c="dimmed">{String(item)}</Text>}
                                        </Box>
                                    </Group>
                                </AttributeRow>
                            ))}
                        </Box>
                    </Box>
                </AttributeRow>
            );
        }

        return (
            <AttributeRow key={currentPath} path={currentPath} label={display} value={value} isMobile={isMobile} onSelectAttribute={onSelectAttribute}>
                <Box pl={path ? 'md' : 0} style={{ borderLeft: path ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <Group gap="xs" wrap="nowrap" align="flex-start">
                        <Text
                            size="xs"
                            fw={isExpandable ? 700 : 400}
                            c={isExpandable ? 'blue' : value === null ? 'dimmed' : 'white'}
                            style={{ flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {display}:
                        </Text>
                        <Group gap={4} style={{ flex: 1 }} wrap="nowrap">
                            {isExpandable
                                ? <Box style={{ width: '100%' }}>{renderAttributes(value, currentPath, onSelectAttribute, schema, isMobile)}</Box>
                                : <>
                                    <Text size="xs" c="dimmed" style={{ flex: 1, wordBreak: 'break-all', fontStyle: value === null ? 'italic' : 'normal' }}>
                                        {value === null ? 'not in sample data' : String(value)}
                                    </Text>
                                    <ActionIcon
                                        variant="light" size="xs" color="blue"
                                        onClick={(e) => { e.stopPropagation(); onSelectAttribute(currentPath, value); }}
                                        title="Quick add (==)"
                                    >
                                        <span style={{ fontSize: 10, fontWeight: 700 }}>+</span>
                                    </ActionIcon>
                                </>}
                        </Group>
                    </Group>
                </Box>
            </AttributeRow>
        );
    });
}

// Custom node renderer: CIM class above the circle, name below
function makeNodeRenderer(expandNode: (id: string) => void) {
    return ({ node, size, selected, active, opacity }: {
        node: GNode; size: number; selected: boolean; active: boolean; opacity: number;
    }) => {
        const fill = selected ? '#ffd43b' : active ? '#74c0fc' : (node.fill ?? '#4dabf7');
        const labelColor = selected ? '#ffd43b' : '#888888';
        const nameColor = '#c1c2c5';
        const r = size ?? 7;
        const textSize = Math.max(r * 0.55, 2.5);
        const gap = r * 1.6;

        return (
            <group onDoubleClick={() => expandNode(node.id)}>
                {/* Node circle */}
                <mesh>
                    <sphereGeometry args={[r, 20, 20]} />
                    <meshBasicMaterial color={fill} opacity={opacity ?? 1} transparent />
                </mesh>

                {/* CIM class — above the circle */}
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

                {/* Human-readable name — below the circle */}
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

const appTheme = {
    ...darkTheme,
    canvas: { ...darkTheme.canvas, background: '#0d0d0d' },
};

// Shared canvas component to avoid duplication between inline and modal views
function GraphCanvasView({
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
}: any) {
    const renderNode = makeNodeRenderer(expandNode);
    return (
        <GraphCanvas
            ref={graphRef}
            nodes={nodes}
            edges={edges}
            selections={selections}
            actives={actives}
            layoutType="forceDirected2d"
            theme={appTheme}
            labelType="none"
            draggable
            renderNode={renderNode as any}
            onNodeClick={onNodeClick}
            onCanvasClick={onCanvasClick}
            onNodePointerOver={handleNodePointerOver}
            onNodePointerOut={handleNodePointerOut}
        />
    );
}

export function GraphExplorer({ rootId, onSelectAttribute, schema, isMobile }: GraphExplorerProps) {
    const graphRef = useRef<GraphCanvasRef | null>(null);
    const modalGraphRef = useRef<GraphCanvasRef | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [popOut, setPopOut] = useState(false);

    const {
        nodes, edges, detailCache, selectedId, loadingIds, pendingExpansion,
        loadRoot, expandNode, selectNode, reset, getPathTo,
    } = useGraphExplorer();

    // Wrap onSelectAttribute to inject the graph path when the selected node
    // is not the root — gives the query builder the exact traversal hops.
    const onSelectWithPath = (path: string, value: any, operator?: string) => {
        const graphPath = selectedId ? (getPathTo(selectedId) ?? undefined) : undefined;
        onSelectAttribute(path, value, operator, graphPath);
    };

    useEffect(() => {
        if (rootId) loadRoot(rootId);
    }, [rootId]); // eslint-disable-line react-hooks/exhaustive-deps

    const { selections, actives, onNodeClick, onCanvasClick } = useSelection({
        ref: graphRef,
        nodes,
        edges,
        focusOnSelect: 'singleOnly',
        type: 'single',
        onSelection: (ids) => { if (ids[0]) selectNode(ids[0]); },
    });

    // Separate selection hook for modal view
    const { selections: modalSelections, actives: modalActives, onNodeClick: modalOnNodeClick, onCanvasClick: modalOnCanvasClick } = useSelection({
        ref: modalGraphRef,
        nodes,
        edges,
        focusOnSelect: 'singleOnly',
        type: 'single',
        onSelection: (ids) => { if (ids[0]) selectNode(ids[0]); },
    });

    const handleNodePointerOver = (node: any) => {
        if (!isMobile) return;
        longPressTimerRef.current = setTimeout(() => expandNode(node.id), 500);
    };

    const handleNodePointerOut = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const selectedDetails = selectedId ? detailCache[selectedId] : null;

    return (
        <>
            <Stack gap="xs">
                {/* Inline graph canvas */}
                <Box style={{ position: 'relative', height: 280, borderRadius: 8, overflow: 'hidden', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {nodes.length > 0 ? (
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
                        />
                    ) : (
                        <Stack align="center" justify="center" h="100%" gap="xs" style={{ opacity: 0.5 }}>
                            <Loader size="sm" color="blue" />
                            <Text size="xs" c="dimmed">Building graph...</Text>
                        </Stack>
                    )}

                    {nodes.length > 0 && loadingIds.size > 0 && (
                        <Box style={{ position: 'absolute', top: 8, right: 8 }}>
                            <Loader size={12} color="blue" />
                        </Box>
                    )}

                    {/* Toolbar */}
                    <Group gap={4} style={{ position: 'absolute', top: 8, left: 8 }}>
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
                </Box>

                {/* Large-expansion warning */}
                {pendingExpansion && (
                    <Alert
                        icon={<AlertTriangle size={14} />}
                        color="yellow"
                        variant="light"
                        p="xs"
                    >
                        <Text size="xs" mb={6}>
                            This node has <strong>{pendingExpansion.neighborCount}</strong> neighbors. Loading all of them may clutter the graph.
                        </Text>
                        <Group gap={6}>
                            <Button size="xs" color="yellow" variant="filled" onClick={pendingExpansion.confirm}>
                                Expand anyway
                            </Button>
                            <Button size="xs" variant="subtle" color="gray" onClick={pendingExpansion.cancel}>
                                Cancel
                            </Button>
                        </Group>
                    </Alert>
                )}

                {/* Legend */}
                <Group gap={6} justify="space-between">
                    <Group gap={6}>
                        <Badge color="yellow" size="xs" variant="dot">Root</Badge>
                        <Badge color="blue" size="xs" variant="dot">Equipment</Badge>
                        <Badge color="green" size="xs" variant="dot">ConnectivityNode</Badge>
                    </Group>
                    <Text size="10px" c="dimmed">{isMobile ? 'Long-press' : 'Dbl-click'} to expand</Text>
                </Group>

                {/* Attribute detail panel */}
                {selectedDetails ? (
                    <Box style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, background: 'rgba(0,0,0,0.15)' }} p="xs">
                        <Group justify="space-between" mb={6} wrap="nowrap">
                            <Stack gap={0} style={{ overflow: 'hidden' }}>
                                <Text size="xs" fw={700} truncate>{selectedDetails.name || selectedId}</Text>
                                <Text size="10px" c="dimmed">{selectedDetails.cim_type || selectedDetails.class || ''}</Text>
                            </Stack>
                            <Tooltip label="Expand in graph" withArrow>
                                <ActionIcon size="xs" variant="subtle" color="blue" onClick={() => selectedId && expandNode(selectedId)}>
                                    <Expand size={11} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                        <ScrollArea h={240} offsetScrollbars>
                            <Box pr="xs">
                                {renderAttributes(selectedDetails, '', onSelectWithPath, schema, isMobile)}
                            </Box>
                        </ScrollArea>
                    </Box>
                ) : (
                    <Box style={{ border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }} p="md">
                        <Text size="xs" c="dimmed" ta="center">Click a node to view its properties</Text>
                    </Box>
                )}
            </Stack>

            {/* Pop-out floating window */}
            {popOut && createPortal(
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 99999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.6)',
                }}>
                    <div style={{
                        width: '90vw', height: '90vh',
                        background: '#141414', borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}>
                        {/* Window title bar */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                            background: '#1a1a1a', flexShrink: 0,
                        }}>
                            <Text size="sm" fw={600} c="white">CIM Graph Explorer</Text>
                            <button
                                onClick={() => setPopOut(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', display: 'flex', alignItems: 'center', padding: 4 }}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        {/* Graph canvas */}
                        <div style={{ flex: 1, minHeight: 0, position: 'relative', background: '#0d0d0d' }}>
                            {nodes.length > 0 && (
                                <GraphCanvasView
                                    graphRef={modalGraphRef}
                                    nodes={nodes}
                                    edges={edges}
                                    selections={modalSelections}
                                    actives={modalActives}
                                    onNodeClick={modalOnNodeClick}
                                    onCanvasClick={modalOnCanvasClick}
                                    expandNode={expandNode}
                                    handleNodePointerOver={handleNodePointerOver}
                                    handleNodePointerOut={handleNodePointerOut}
                                />
                            )}
                            {loadingIds.size > 0 && (
                                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                                    <Loader size={16} color="blue" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
