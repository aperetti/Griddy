import { Paper, Stack, Group, Text, NumberInput, SegmentedControl, Button, Divider, Alert, Box, ActionIcon, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useWindowEvent } from '@mantine/hooks';
import { Settings, Info, X } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { Rnd } from 'react-rnd';

export interface GlobalConfig {
    defaultDuration: '1D' | '1W' | '1M' | '1Y' | 'custom';
    customDays: number;
    endDateType: 'now' | 'fixed';
    fixedEndDate: string;
}

interface GlobalSettingsModalProps {
    opened: boolean;
    onClose: () => void;
    config: GlobalConfig;
    onSave: (config: GlobalConfig) => void;
}

export function GlobalSettingsModal({ opened, onClose, config, onSave }: GlobalSettingsModalProps) {
    const [localConfig, setLocalConfig] = useState<GlobalConfig>(config);

    const getInitialState = () => {
        const saved = localStorage.getItem('settingsWindowPos');
        if (saved) {
            try {
                return clampToViewport(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse saved settingsWindowPos', e);
            }
        }

        const width = Math.min(450, window.innerWidth - 40);
        return {
            x: (window.innerWidth / 2) - (width / 2),
            y: Math.max(20, (window.innerHeight / 2) - 250),
            width: width,
            height: 'auto'
        };
    };

    const [rndState, setRndState] = useState(getInitialState);

    const clamp = useCallback(() => {
        setRndState(prev => clampToViewport(prev));
    }, []);

    useWindowEvent('resize', clamp);

    useEffect(() => {
        setLocalConfig(config);
        if (opened) {
            clamp();
        }
    }, [config, opened, clamp]);

    if (!opened) return null;

    const handleSave = () => {
        onSave(localConfig);
        onClose();
    };

    const handleRndChange = (d: any) => {
        const newState = clampToViewport({ ...rndState, ...d });
        setRndState(newState);
        localStorage.setItem('settingsWindowPos', JSON.stringify(newState));
    };

    return (
        <Rnd
            size={{ width: rndState.width, height: rndState.height }}
            position={{ x: rndState.x, y: rndState.y }}
            onDragStop={(_e, d) => handleRndChange({ x: d.x, y: d.y })}
            onResizeStop={(_e, _direction, ref, _delta, position) => {
                handleRndChange({
                    width: ref.style.width,
                    height: ref.style.height,
                    ...position
                });
            }}
            minWidth={Math.min(400, window.innerWidth - 20)}
            bounds="window"
            dragHandleClassName="handle"
            style={{ zIndex: 10001 }}
            enableResizing={false}
        >
            <Paper
                withBorder
                shadow="xl"
                radius="md"
                style={{
                    width: '100%',
                    height: '100%',
                    background: 'rgba(26, 27, 30, 0.98)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    border: '1px solid rgba(255,255,255,0.1)'
                }}
            >
                <Box px="md" py="xs" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <Group justify="space-between" align="center" wrap="nowrap">
                        <Group gap="xs" className="handle" style={{ cursor: 'grab', flex: 1 }}>
                            <Settings size={18} />
                            <Title order={5}>Analysis Settings</Title>
                        </Group>
                        <ActionIcon variant="subtle" color="gray" onClick={onClose} title="Close window">
                            <X size={18} />
                        </ActionIcon>
                    </Group>
                </Box>

                <Box p="md" style={{ overflowY: 'auto' }}>
                    <Stack gap="md">
                        <Text size="sm" c="dimmed">
                            Define the default time window used for consumption and voltage analysis.
                        </Text>

                        <Divider label="Time Range Configuration" labelPosition="center" />

                        <Stack gap="xs">
                            <Text size="sm" fw={500}>Default Duration</Text>
                            <SegmentedControl
                                value={localConfig.defaultDuration}
                                onChange={(value) => setLocalConfig({ ...localConfig, defaultDuration: value as any })}
                                data={[
                                    { label: '1 Day', value: '1D' },
                                    { label: '1 Week', value: '1W' },
                                    { label: '1 Month', value: '1M' },
                                    { label: '1 Year', value: '1Y' },
                                    { label: 'Custom', value: 'custom' },
                                ]}
                            />
                        </Stack>

                        {localConfig.defaultDuration === 'custom' && (
                            <NumberInput
                                label="Custom Duration (Days)"
                                description="Number of days to look back"
                                value={localConfig.customDays}
                                onChange={(val) => setLocalConfig({ ...localConfig, customDays: Number(val) || 30 })}
                                min={1}
                                max={3650}
                            />
                        )}

                        <Stack gap="xs">
                            <Text size="sm" fw={500}>End Date Anchor</Text>
                            <SegmentedControl
                                value={localConfig.endDateType}
                                onChange={(value) => setLocalConfig({ ...localConfig, endDateType: value as any })}
                                data={[
                                    { label: 'Current Date (Live)', value: 'now' },
                                    { label: 'Fixed Date', value: 'fixed' },
                                ]}
                            />
                        </Stack>

                        {localConfig.endDateType === 'fixed' && (
                            <DatePickerInput
                                label="Fixed End Date"
                                placeholder="Pick a date"
                                value={localConfig.fixedEndDate ? new Date(localConfig.fixedEndDate) : new Date()}
                                onChange={(date: any) => {
                                    if (date instanceof Date && !isNaN(date.getTime())) {
                                        setLocalConfig({ ...localConfig, fixedEndDate: date.toISOString() });
                                    }
                                }}
                                dropdownType="popover"
                            />
                        )}

                        <Divider label="Analytics Display" labelPosition="center" />









                        <Alert icon={<Info size={16} />} color="blue" variant="light" mt="xs">
                            <Text size="xs">
                                {localConfig.endDateType === 'now'
                                    ? 'Analysis will always look back from the current moment.'
                                    : 'Analysis will be anchored to the specific date provided above.'}
                            </Text>
                        </Alert>

                        <Group justify="flex-end" mt="md">
                            <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
                            <Button onClick={handleSave}>Save Settings</Button>
                        </Group>
                    </Stack>
                </Box>
            </Paper>
        </Rnd>
    );
}

function clampToViewport(pos: { x: number; y: number; width: number | string; height: number | string }) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(typeof pos.width === 'number' ? pos.width : parseInt(pos.width as string), vw - 20);
    const h = typeof pos.height === 'number' ? pos.height : (pos.height === 'auto' ? 500 : parseInt(pos.height as string));

    const x = Math.max(10, Math.min(pos.x, vw - w - 10));
    const y = Math.max(10, Math.min(pos.y, vh - (typeof h === 'number' ? h : 100) - 10));

    return { x, y, width: w, height: pos.height };
}
