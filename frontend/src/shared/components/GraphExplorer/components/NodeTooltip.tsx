import { Paper, Text, Stack, Divider, Group, Skeleton } from '@mantine/core';
import { SKIP_KEYS, bareKey } from '../utils/graphUtils';

interface NodeTooltipProps {
    nodeLabel: string;
    nodeSubLabel?: string;
    details: any | null;
    x: number;
    y: number;
}

const MAX_ATTRS = 8;

function flatScalarEntries(data: any): [string, string][] {
    if (!data || typeof data !== 'object') return [];
    return Object.entries(data)
        .filter(([k, v]) =>
            !SKIP_KEYS.has(k) &&
            v !== null &&
            v !== undefined &&
            typeof v !== 'object' &&
            !Array.isArray(v)
        )
        .slice(0, MAX_ATTRS)
        .map(([k, v]) => [bareKey(k), String(v)]);
}

export function NodeTooltip({ nodeLabel, nodeSubLabel, details, x, y }: NodeTooltipProps) {
    const attrs = flatScalarEntries(details);
    const name = details?.name || nodeSubLabel || '';

    return (
        <Paper
            shadow="md"
            radius="sm"
            p="xs"
            style={{
                position: 'fixed',
                left: x + 14,
                top: y - 8,
                zIndex: 1000000,
                maxWidth: 260,
                minWidth: 160,
                background: 'rgba(20,20,20,0.93)',
                border: '1px solid rgba(255,255,255,0.1)',
                pointerEvents: 'none',
            }}
        >
            <Stack gap={4}>
                <div>
                    <Text size="xs" fw={700} c="white" style={{ lineHeight: 1.2 }}>
                        {name || nodeLabel}
                    </Text>
                    <Text size="10px" c="dimmed">{nodeLabel}</Text>
                </div>

                {details === null ? (
                    <>
                        <Divider color="rgba(255,255,255,0.06)" />
                        <Stack gap={3}>
                            {[1, 2, 3].map(i => (
                                <Skeleton key={i} height={8} radius="xs" />
                            ))}
                        </Stack>
                    </>
                ) : attrs.length > 0 ? (
                    <>
                        <Divider color="rgba(255,255,255,0.06)" />
                        <Stack gap={2}>
                            {attrs.map(([k, v]) => (
                                <Group key={k} gap={4} wrap="nowrap" align="flex-start">
                                    <Text
                                        size="10px"
                                        c="dimmed"
                                        style={{ flex: '0 0 90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    >
                                        {k}:
                                    </Text>
                                    <Text
                                        size="10px"
                                        c="gray.3"
                                        style={{ flex: 1, wordBreak: 'break-all', overflow: 'hidden', maxHeight: 32 }}
                                    >
                                        {v}
                                    </Text>
                                </Group>
                            ))}
                        </Stack>
                    </>
                ) : null}
            </Stack>
        </Paper>
    );
}
