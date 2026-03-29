import { useRef, useEffect } from 'react';
import {
    Stack, Box, Group, Text, Badge, ScrollArea,
    ActionIcon, Loader, Tooltip
} from '@mantine/core';
import { GraphCanvas, darkTheme, useSelection, type GraphCanvasRef } from 'reagraph';
import { Expand, RotateCcw } from 'lucide-react';
import { useGraphExplorer } from '../../../hooks/useGraphExplorer';
import { AttributeRow } from './AttributeRow';

interface GraphExplorerProps {
    rootId: string;
    onSelectAttribute: (path: string, value: any, operator?: string) => void;
    schema: Record<string, any>;
    isMobile: boolean;
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

    let keys = Object.keys(obj);
    if (classSchema?.attributes) {
        const schemaKeys = classSchema.attributes.map((a: any) => a.name);
        keys = Array.from(new Set([...keys, ...schemaKeys]));
    }

    const metaKeys = ['id', 'mrid', 'name', 'cim_type', 'class', 'type'];
    keys.sort((a, b) => {
        const ai = metaKeys.indexOf(a), bi = metaKeys.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
    });

    return keys.map(key => {
        if (key === 'model_id') return null;
        const value = obj[key] !== undefined ? obj[key] : null;
        const currentPath = path ? `${path}.${key}` : key;
        const isArray = Array.isArray(value);
        const isExpandable = !!(value && typeof value === 'object' && !isArray);

        if (isArray) {
            return (
                <AttributeRow key={currentPath} path={currentPath} label={key} value={value} isMobile={isMobile} onSelectAttribute={onSelectAttribute}>
                    <Box pl={path ? 'md' : 0} style={{ borderLeft: path ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <Text size="xs" fw={700} c="orange" mb={4}>{key}: [List of {value.length}]</Text>
                        <Box ml="md">
                            {value.map((item: any, idx: number) => (
                                <AttributeRow key={`${currentPath}.${idx}`} path={`${currentPath}.${idx}`} label={`${key}[${idx}]`} value={item} isMobile={isMobile} onSelectAttribute={onSelectAttribute}>
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
            <AttributeRow key={currentPath} path={currentPath} label={key} value={value} isMobile={isMobile} onSelectAttribute={onSelectAttribute}>
                <Box pl={path ? 'md' : 0} style={{ borderLeft: path ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                    <Group gap="xs" wrap="nowrap" align="flex-start">
                        <Text
                            size="xs"
                            fw={isExpandable ? 700 : 400}
                            c={isExpandable ? 'blue' : value === null ? 'dimmed' : 'white'}
                            style={{ flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                            {key}:
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

const appTheme = {
    ...darkTheme,
    canvas: { ...darkTheme.canvas, background: '#0d0d0d' },
    node: {
        ...darkTheme.node,
        label: {
            ...darkTheme.node?.label,
            color: '#c1c2c5',
            fontSize: 6,
            maxWidth: 80,
        },
    },
};

export function GraphExplorer({ rootId, onSelectAttribute, schema, isMobile }: GraphExplorerProps) {
    const graphRef = useRef<GraphCanvasRef | null>(null);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const {
        nodes, edges, detailCache, selectedId, loadingIds,
        loadRoot, expandNode, selectNode, reset,
    } = useGraphExplorer();

    // Load graph when rootId is provided
    useEffect(() => {
        if (rootId) loadRoot(rootId);
    }, [rootId]); // eslint-disable-line react-hooks/exhaustive-deps

    const { selections, actives, onNodeClick, onCanvasClick } = useSelection({
        ref: graphRef,
        nodes,
        edges,
        focusOnSelect: 'singleOnly',
        type: 'single',
        onSelection: (ids) => {
            if (ids[0]) selectNode(ids[0]);
        },
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
        <Stack gap="xs">
            {/* Graph canvas */}
            <Box style={{ position: 'relative', height: 280, borderRadius: 8, overflow: 'hidden', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.06)' }}>
                {nodes.length > 0 ? (
                    <GraphCanvas
                        ref={graphRef}
                        nodes={nodes}
                        edges={edges}
                        selections={selections}
                        actives={actives}
                        layoutType="forceDirected2d"
                        theme={appTheme}
                        labelType="all"
                        draggable
                        onNodeClick={onNodeClick}
                        onCanvasClick={onCanvasClick}
                        onNodeDoubleClick={(node) => expandNode(node.id)}
                        onNodePointerOver={handleNodePointerOver}
                        onNodePointerOut={handleNodePointerOut}
                    />
                ) : (
                    <Stack align="center" justify="center" h="100%" gap="xs" style={{ opacity: 0.5 }}>
                        <Loader size="sm" color="blue" />
                        <Text size="xs" c="dimmed">Building graph...</Text>
                    </Stack>
                )}

                {/* Loading spinner for expansions */}
                {nodes.length > 0 && loadingIds.size > 0 && (
                    <Box style={{ position: 'absolute', top: 8, right: 8 }}>
                        <Loader size={12} color="blue" />
                    </Box>
                )}

                {/* Reset button */}
                <Tooltip label="Reset graph" withArrow position="right">
                    <ActionIcon
                        size="xs" variant="subtle" color="gray"
                        style={{ position: 'absolute', top: 8, left: 8 }}
                        onClick={reset}
                    >
                        <RotateCcw size={10} />
                    </ActionIcon>
                </Tooltip>
            </Box>

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
                            {renderAttributes(selectedDetails, '', onSelectAttribute, schema, isMobile)}
                        </Box>
                    </ScrollArea>
                </Box>
            ) : (
                <Box style={{ border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }} p="md">
                    <Text size="xs" c="dimmed" ta="center">Click a node to view its properties</Text>
                </Box>
            )}
        </Stack>
    );
}
