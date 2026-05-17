import React from 'react';
import { Group, Select, Tooltip, ActionIcon, Menu, Button, Text, rem } from '@mantine/core';
import { Plus, Trash2, MoreVertical, FileUp, Pencil, FileDown, CheckCircle2 } from 'lucide-react';
import { type DisplayConfig } from '../../../../shared/api';

interface ConfigToolbarProps {
    configs: DisplayConfig[];
    selectedConfigId: number | null;
    onSelectConfig: (id: number | null) => void;
    onSetDefault: (id: number) => void;
    onDeleteConfig: (config: DisplayConfig) => void;
    onCreateConfig: () => void;
    onRenameConfig: (config: DisplayConfig) => void;
    onExportConfig: (id: number) => void;
    onImportConfig: (data: any) => void;
    onAddRule: () => void;
    generalError: string | null;
}

export const ConfigToolbar: React.FC<ConfigToolbarProps> = ({
    configs,
    selectedConfigId,
    onSelectConfig,
    onSetDefault,
    onDeleteConfig,
    onCreateConfig,
    onRenameConfig,
    onExportConfig,
    onImportConfig,
    onAddRule,
    generalError
}) => {
    const selectedConfig = configs.find(c => c.id === selectedConfigId);

    return (
        <Group justify="space-between">
            <Group gap="xs">
                <Select 
                    label="Display Profile"
                    placeholder="Select profile"
                    value={selectedConfigId?.toString()}
                    onChange={(v) => onSelectConfig(v ? parseInt(v) : null)}
                    data={configs.map(c => ({ value: c.id.toString(), label: `${c.name}${c.is_default ? ' (Default)' : ''}` }))}
                    style={{ width: rem(250) }}
                    comboboxProps={{ zIndex: 2000, withinPortal: true }}
                />
                
                {selectedConfigId && (
                    <>
                        <Tooltip label={selectedConfig?.is_default ? "Profile is Already Default" : "Set as Default Profile"}>
                            <ActionIcon 
                                variant="light" 
                                color="green" 
                                size="lg" 
                                mt="25px"
                                disabled={!!selectedConfig?.is_default}
                                onClick={() => onSetDefault(selectedConfigId)}
                            >
                                <CheckCircle2 size={18} />
                            </ActionIcon>
                        </Tooltip>

                        <Tooltip label="Delete Current Profile">
                            <ActionIcon 
                                variant="light" 
                                color="red" 
                                size="lg" 
                                mt="25px"
                                disabled={!!selectedConfig?.is_default}
                                onClick={() => selectedConfig && onDeleteConfig(selectedConfig)}
                            >
                                <Trash2 size={18} />
                            </ActionIcon>
                        </Tooltip>
                    </>
                )}

                <Menu shadow="md" width={180} zIndex={2000} withinPortal>
                    <Menu.Target>
                        <ActionIcon variant="light" size="lg" mt="25px"><MoreVertical size={18} /></ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item leftSection={<Plus size={14} />} onClick={onCreateConfig}>New Profile</Menu.Item>
                        <Menu.Item 
                            leftSection={<FileUp size={14} />} 
                            onClick={() => document.getElementById('import-profile-input')?.click()}
                        >
                            Import Profile
                        </Menu.Item>

                        {selectedConfigId && (
                            <>
                                <Menu.Item 
                                    leftSection={<Pencil size={14} />}
                                    onClick={() => selectedConfig && onRenameConfig(selectedConfig)}
                                >
                                    Rename Profile
                                </Menu.Item>
                                <Menu.Item 
                                    leftSection={<FileDown size={14} />} 
                                    onClick={() => onExportConfig(selectedConfigId)}
                                >
                                    Export Profile
                                </Menu.Item>
                            </>
                        )}
                    </Menu.Dropdown>
                </Menu>

                <input 
                    type="file" 
                    id="import-profile-input" 
                    style={{ display: 'none' }} 
                    accept=".json"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                                try {
                                    const data = JSON.parse(event.target?.result as string);
                                    onImportConfig(data);
                                } catch (err) {
                                    console.error("Import failed", err);
                                }
                            };
                            reader.readAsText(file);
                            e.target.value = '';
                        }
                    }}
                />
            </Group>
            <Group mt="25px">
                {generalError && <Text c="red" size="xs" mr="md" fw={500}>{generalError}</Text>}
                <Button variant="light" color="blue" leftSection={<Plus size={16} />} onClick={onAddRule}>
                    Add Rule
                </Button>
            </Group>
        </Group>
    );
};
