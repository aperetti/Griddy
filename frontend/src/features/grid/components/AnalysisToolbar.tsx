import { Paper, Group, ActionIcon, Tooltip, Badge, Text, Divider, Transition, SegmentedControl } from '@mantine/core';
import { X, Database, Settings } from 'lucide-react';
import type { Node } from '../../../shared/types';
import type { PluginDefinition } from '../../../plugins/types';

interface AnalysisToolbarProps {
    selectedNodes: Node[];
    selectedEdgeCount: number;
    onClearSelection: () => void;
    onViewDiagnostic: (node: Node) => void;
    visible: boolean;
    dateRange: { start: string, end: string };
    configLabel: string;
    onOpenSettings: () => void;
    plugins?: PluginDefinition[];
    onRunPlugin?: (plugin: PluginDefinition) => void;
    edgeColorBase?: 'circuit' | 'model';
    onEdgeColorBaseChange?: (v: 'circuit' | 'model') => void;
}

export function AnalysisToolbar({
    selectedNodes,
    selectedEdgeCount,
    onClearSelection,
    onViewDiagnostic,
    visible,
    dateRange,
    configLabel,
    onOpenSettings,
    plugins = [],
    onRunPlugin,
    edgeColorBase = 'circuit',
    onEdgeColorBaseChange,
}: AnalysisToolbarProps) {
    const count = selectedNodes.length + selectedEdgeCount;

    return (
        <Transition mounted={visible} transition="slide-left" duration={400} timingFunction="ease">
            {(styles) => (
                <Paper
                    shadow="md"
                    p="6px"
                    radius="md"
                    style={{
                        ...styles,
                        backgroundColor: 'rgba(26, 27, 30, 0.85)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        pointerEvents: 'auto',
                        maxWidth: '100%',
                        overflow: 'hidden',
                    }}
                >
                    <Group gap="xs" wrap="nowrap" style={{ maxWidth: '100%', overflow: 'hidden' }}>
                        <Group gap="4px" onClick={(e) => {
                            e.stopPropagation();
                            onClearSelection();
                        }} style={{ cursor: 'pointer', flexShrink: 0 }}>
                            <Badge color="blue" variant="filled" size="sm" radius="sm">
                                {count}
                            </Badge>
                            <Text size="xs" fw={700} c="dimmed" visibleFrom="md">
                                Selected
                            </Text>
                        </Group>

                        <Divider orientation="vertical" />
                        <Tooltip
                            label={`${configLabel} • ${new Date(dateRange.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${new Date(dateRange.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                            position="bottom"
                            color="dark"
                            withArrow
                        >
                            <ActionIcon
                                variant="light"
                                color="blue"
                                size="md"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenSettings();
                                }}
                                radius="sm"
                                style={{ flexShrink: 0 }}
                            >
                                <Settings size={18} />
                            </ActionIcon>
                        </Tooltip>
                        <Divider orientation="vertical" />
                        {plugins.filter(p => p.category === 'node').map(plugin => {
                            const Icon = plugin.icon;
                            return (
                                <Tooltip key={plugin.type} color="dark" label={plugin.label} position="bottom" withArrow>
                                    <ActionIcon
                                        variant="light"
                                        color={plugin.color}
                                        size="md"
                                        onClick={() => onRunPlugin?.(plugin)}
                                        radius="sm"
                                        data-testid={`btn-plugin-${plugin.type}`}
                                    >
                                        <Icon size={18} />
                                    </ActionIcon>
                                </Tooltip>
                            );
                        })}

                        <Divider orientation="vertical" />

                        <Tooltip color="dark" label={selectedNodes.length === 0 ? "Select a node for diagnostic" : "CIM Diagnostic View"} position="bottom" withArrow>
                            <ActionIcon
                                variant="light"
                                color={selectedNodes.length === 0 ? "gray" : "teal"}
                                size="md"
                                onClick={() => selectedNodes[0] && onViewDiagnostic(selectedNodes[0])}
                                disabled={selectedNodes.length === 0}
                                radius="sm"
                                data-testid="btn-diagnostic"
                            >
                                <Database size={18} />
                            </ActionIcon>
                        </Tooltip>

                        <Divider orientation="vertical" />

                        <Tooltip label="Edge color: by topological zone or by feeder model" position="bottom" color="dark" withArrow>
                            <SegmentedControl
                                size="xs"
                                value={edgeColorBase}
                                onChange={(v) => onEdgeColorBaseChange?.(v as 'circuit' | 'model')}
                                data={[
                                    { value: 'circuit', label: 'By Zone' },
                                    { value: 'model',   label: 'By Feeder' },
                                ]}
                                styles={{ root: { background: 'rgba(255,255,255,0.05)' } }}
                            />
                        </Tooltip>

                        <Divider orientation="vertical" />

                        <Tooltip color="dark" label="Clear Selection" position="bottom" withArrow>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="md"
                                onClick={onClearSelection}
                                radius="sm"
                            >
                                <X size={18} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                </Paper>
            )}
        </Transition>
    );
}
