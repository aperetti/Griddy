import { Paper, Group, ActionIcon, Tooltip, Badge, Text, Divider, Transition, Stack } from '@mantine/core';
import { BarChart3, Activity, X, Database } from 'lucide-react';
import type { Node } from '../../../shared/types';

interface AnalysisToolbarProps {
    selectedNodes: Node[];
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
    onClearSelection,
    onViewConsumption,
    onViewVoltage,
    onViewDiagnostic,
    visible,
    dateRange,
    configLabel,
    onOpenSettings
}: AnalysisToolbarProps) {
    const count = selectedNodes.length;

    return (
        <Transition mounted={visible} transition="slide-left" duration={400} timingFunction="ease">
            {(styles) => (
                <Paper
                    shadow="md"
                    p="xs"
                    radius="md"
                    style={{
                        ...styles,
                        backgroundColor: 'rgba(26, 27, 30, 0.85)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        pointerEvents: 'auto'
                    }}
                >
                    <Group gap="xs">
                        <Group gap="xs" onClick={(e) => {
                            e.stopPropagation();
                            onClearSelection();
                        }} style={{ cursor: 'pointer' }}>
                            <Badge color="blue" variant="filled" size="lg" radius="sm">
                                {count}
                            </Badge>
                            <Text size="xs" fw={500} c="dimmed" visibleFrom="xs">
                                Assets Selected
                            </Text>
                        </Group>

                        <Stack gap={0} onClick={(e) => {
                            e.stopPropagation();
                            onOpenSettings();
                        }} style={{ cursor: 'pointer' }}>
                            <Text size="10px" c="blue.4" fw={600} style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {configLabel} • {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
                            </Text>
                        </Stack>

                        <Divider orientation="vertical" />

                        <Tooltip label="Joint Consumption Analysis" position="bottom" withArrow>
                            <ActionIcon
                                variant="light"
                                color="blue"
                                size="lg"
                                onClick={onViewConsumption}
                                radius="md"
                                data-testid="btn-consumption"
                            >
                                <BarChart3 size={18} />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip label="Joint Voltage Distribution" position="bottom" withArrow>
                            <ActionIcon
                                variant="light"
                                color="cyan"
                                size="lg"
                                onClick={onViewVoltage}
                                radius="md"
                                data-testid="btn-voltage"
                            >
                                <Activity size={18} />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip label="CIM Diagnostic View" position="bottom" withArrow>
                            <ActionIcon
                                variant="light"
                                color="teal"
                                size="lg"
                                onClick={onViewDiagnostic}
                                radius="md"
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
                                size="lg"
                                onClick={onClearSelection}
                                radius="md"
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
