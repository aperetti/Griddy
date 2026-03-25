import { Paper, Group, ActionIcon, Tooltip, Badge, Text, Divider, Transition, Stack } from '@mantine/core';
import { BarChart3, Activity, X, Database } from 'lucide-react';
import type { Node } from '../../../shared/types';

interface AnalysisToolbarProps {
    selectedNodes: Node[];
    selectedEdgeCount: number;
    onClearSelection: () => void;
    onViewConsumption: () => void;
    onViewVoltage: () => void;
    onViewDiagnostic: () => void;
    visible: boolean;
    dateRange: { start: string, end: string };
    configLabel: string;
    onOpenSettings: () => void;
}

export function AnalysisToolbar({
    selectedNodes,
    selectedEdgeCount,
    onClearSelection,
    onViewConsumption,
    onViewVoltage,
    onViewDiagnostic,
    visible,
    dateRange,
    configLabel,
    onOpenSettings
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
                        maxWidth: '100%'
                    }}
                >
                    <Group gap="xs" wrap="nowrap" style={{ maxWidth: '100%' }}>
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

                        <Stack gap={0} onClick={(e) => {
                            e.stopPropagation();
                            onOpenSettings();
                        }} style={{ cursor: 'pointer', flexShrink: 1, minWidth: 0 }}>
                            <Text size="10px" c="blue.4" fw={700} style={{ 
                                textTransform: 'uppercase', 
                                letterSpacing: '0.5px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '120px'
                            }}>
                                {configLabel} • {new Date(dateRange.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {new Date(dateRange.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </Text>
                        </Stack>

                        <Divider orientation="vertical" />

                        <Tooltip label={(selectedNodes.length === 0 && selectedEdgeCount === 0) ? "Select an asset for analysis" : "Joint Consumption Analysis"} position="bottom" withArrow>
                            <ActionIcon
                                variant="light"
                                color={(selectedNodes.length === 0 && selectedEdgeCount === 0) ? "gray" : "blue"}
                                size="md"
                                onClick={onViewConsumption}
                                disabled={selectedNodes.length === 0 && selectedEdgeCount === 0}
                                radius="sm"
                                data-testid="btn-consumption"
                            >
                                <BarChart3 size={18} />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip label={(selectedNodes.length === 0 && selectedEdgeCount === 0) ? "Select an asset for analysis" : "Joint Voltage Distribution"} position="bottom" withArrow>
                            <ActionIcon
                                variant="light"
                                color={(selectedNodes.length === 0 && selectedEdgeCount === 0) ? "gray" : "cyan"}
                                size="md"
                                onClick={onViewVoltage}
                                disabled={selectedNodes.length === 0 && selectedEdgeCount === 0}
                                radius="sm"
                                data-testid="btn-voltage"
                            >
                                <Activity size={18} />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip label={(selectedNodes.length === 0 && selectedEdgeCount === 0) ? "Select an asset for analysis" : "CIM Diagnostic View"} position="bottom" withArrow>
                            <ActionIcon
                                variant="light"
                                color={(selectedNodes.length === 0 && selectedEdgeCount === 0) ? "gray" : "teal"}
                                size="md"
                                onClick={onViewDiagnostic}
                                disabled={selectedNodes.length === 0 && selectedEdgeCount === 0}
                                radius="sm"
                                data-testid="btn-diagnostic"
                            >
                                <Database size={18} />
                            </ActionIcon>
                        </Tooltip>

                        <Divider orientation="vertical" />

                        <Tooltip label="Clear Selection" position="bottom" withArrow>
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
