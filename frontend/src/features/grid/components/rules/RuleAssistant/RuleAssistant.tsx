import { useState } from 'react';
import { Select, Stack, Text, Group, ActionIcon, ScrollArea, Loader, Box, Tooltip, Paper, Button } from '@mantine/core';
import { Search, Info, Database, ArrowLeft, Plus } from 'lucide-react';
import { useMediaQuery } from '@mantine/hooks';
import { useRuleAssistant } from '../../../hooks/useRuleAssistant';
import { AttributeRow } from './AttributeRow';
import { Relation } from './Relation';

interface RuleAssistantProps {
    onSelectAttribute: (path: string, value: any, operator?: string) => void;
    targetClass?: string;
    zIndex?: number;
}

// Match standard 36-char UUIDs with dashes
const isMrid = (val: any) => typeof val === 'string' &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);

export const RuleAssistant: React.FC<RuleAssistantProps> = ({ onSelectAttribute, targetClass, zIndex = 1000 }) => {
    const isMobile = useMediaQuery('(max-width: 768px)') || false;
    const [hideNulls, setHideNulls] = useState(false);
    
    const {
        searchValue, setSearchValue, options, loading,
        nodeDetails, fetchingDetails, history, schema,
        handleNodeSelect, diveIntoMrid, goBack, clearSelection
    } = useRuleAssistant(targetClass);

    const renderAttributes = (obj: any, path: string = ''): React.ReactNode => {
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
            const aMeta = metaKeys.indexOf(a);
            const bMeta = metaKeys.indexOf(b);
            if (aMeta !== -1 && bMeta !== -1) return aMeta - bMeta;
            if (aMeta !== -1) return -1;
            if (bMeta !== -1) return 1;
            return a.localeCompare(b);
        });

        return keys.map((key) => {
            if (key === 'model_id') return null;
            const value = obj[key] !== undefined ? obj[key] : null;
            if (hideNulls && (value === null || value === undefined || value === '')) return null;

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
                                                {isMrid(item) ? <Relation mrid={item} onDive={diveIntoMrid} /> : 
                                                 typeof item === 'object' && item !== null ? <Box py={4} px={8} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>{renderAttributes(item, `${currentPath}.${idx}`)}</Box> :
                                                 <Text size="xs" c="dimmed">{String(item)}</Text>}
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
                            <Text size="xs" fw={isExpandable ? 700 : 400} c={isExpandable ? "blue" : (value === null ? "dimmed" : "white")} style={{ flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{key}:</Text>
                            <Group gap={4} style={{ flex: 1 }} wrap="nowrap">
                                {isExpandable ? <Box style={{ width: '100%' }}>{renderAttributes(value, currentPath)}</Box> :
                                 <>
                                    <Box style={{ flex: 1, overflow: 'hidden' }}>
                                        {isMrid(value) ? <Relation mrid={value as string} onDive={diveIntoMrid} /> :
                                         <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all', fontStyle: value === null ? 'italic' : 'normal' }}>{value === null ? 'not in sample data' : String(value)}</Text>}
                                    </Box>
                                    <ActionIcon variant="light" size="xs" color="blue" onClick={(e) => { e.stopPropagation(); onSelectAttribute(currentPath, value); }} title="Quick add (==)"><Plus size={12} /></ActionIcon>
                                 </>}
                            </Group>
                        </Group>
                    </Box>
                </AttributeRow>
            );
        });
    };

    return (
        <Paper p="md" withBorder onClick={(e) => e.stopPropagation()} style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Group justify="space-between" mb="xs">
                <Group gap="xs">
                    {history.length > 1 ? <ActionIcon variant="subtle" size="sm" onClick={(e) => { e.stopPropagation(); goBack(); }} title="Go back"><ArrowLeft size={16} /></ActionIcon> : <Database size={16} color="#4dabf7" />}
                    <Stack gap={0}>
                        <Text fw={700} size="sm">Rule Assistant</Text>
                        {nodeDetails && <Text size="10px" c="blue" truncate style={{ maxWidth: 200 }}>{history.length > 1 ? "Navigating: " : "Selection: "}{nodeDetails.name || 'Object'}</Text>}
                    </Stack>
                </Group>
                <Group gap="xs">
                    <Button variant={hideNulls ? "filled" : "outline"} size="compact-xs" color="gray" onClick={(e) => { e.stopPropagation(); setHideNulls(!hideNulls); }} styles={{ label: { fontSize: '10px' } }}>{hideNulls ? "Showing All" : "Hide Nulls"}</Button>
                    <Tooltip label="Right-click an attribute for more options. Click name to dive." position="top-end" withArrow withinPortal zIndex={zIndex + 1000}><Info size={14} style={{ opacity: 0.5, cursor: 'help' }} /></Tooltip>
                </Group>
            </Group>

            {history.length === 0 ? (
                <Select placeholder="Search example equipment..." leftSection={loading ? <Loader size={14} /> : <Search size={14} />} data={options} searchable searchValue={searchValue} onSearchChange={setSearchValue} onChange={handleNodeSelect} comboboxProps={{ withinPortal: true, zIndex: 1000000 }} styles={{ input: { background: 'rgba(0,0,0,0.2)', color: 'white' } }} />
            ) : (
                <Box mt="sm">
                    <Button variant="subtle" size="compact-xs" color="gray" mb={8} onClick={(e) => { e.stopPropagation(); clearSelection(); }} leftSection={<Search size={10} />}>Start New Search</Button>
                    <Box style={{ maxHeight: '400px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <Text size="10px" fw={700} mb={8} c="dimmed" tt="uppercase">{fetchingDetails ? "Fetching structure..." : "Real-time Structure (Right-click for options)"}</Text>
                        <ScrollArea h={isMobile ? 300 : 400} offsetScrollbars>
                            <Box pr="sm">{nodeDetails && renderAttributes(nodeDetails)}</Box>
                        </ScrollArea>
                    </Box>
                </Box>
            )}
        </Paper>
    );
};
