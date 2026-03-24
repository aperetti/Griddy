import React, { useState, useEffect, useRef } from 'react';
import { Select, Stack, Text, Group, ActionIcon, ScrollArea, Loader, Box, Tooltip, Paper, Button, Menu } from '@mantine/core';
import { Search, Plus, Info, Database, ArrowLeft } from 'lucide-react';
import { useMediaQuery } from '@mantine/hooks';
import { searchCim, fetchCimNode, fetchCimEquipment } from '../../../shared/api';

interface RuleAssistantProps {
    onSelectAttribute: (path: string, value: any, operator?: string) => void;
    targetClass?: string;
    zIndex?: number;
}

const isMrid = (val: any) => typeof val === 'string' && /^[0-9a-fA-F-]{36}$/.test(val);

interface RelationProps {
    mrid: string;
    onDive: (mrid: string) => void;
}

const Relation: React.FC<RelationProps> = ({ mrid, onDive }) => {
    const [info, setInfo] = useState<{ name: string, class: string } | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const details = await fetchCimEquipment(mrid);
                setInfo({ 
                    name: details.name || 'Unnamed', 
                    class: details.cim_type || details.class || 'Object' 
                });
            } catch {
                setInfo({ name: 'Unknown', class: '??' });
            } finally {
                setLoading(false);
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [mrid]);

    return (
        <Group gap={4} wrap="nowrap">
            <Text 
                size="xs" 
                c="green" 
                style={{ cursor: 'pointer', textDecoration: 'underline' }} 
                onClick={(e) => { e.stopPropagation(); onDive(mrid); }}
            >
                {loading ? '...' : (info ? `${info.name} (${info.class})` : mrid.slice(0, 8))}
            </Text>
        </Group>
    );
};

interface AttributeRowProps {
    path: string;
    label: string;
    value: any;
    isMobile: boolean;
    onSelectAttribute: (path: string, value: any, operator?: string) => void;
    children?: React.ReactNode;
}

const AttributeRow: React.FC<AttributeRowProps> = ({ path, label, value, isMobile, onSelectAttribute, children }) => {
    const longPressTimer = useRef<any>(null);
    const [menuOpened, setMenuOpened] = useState(false);

    const handleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        longPressTimer.current = setTimeout(() => {
            setMenuOpened(true);
        }, 600);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpened(true);
    };

    return (
        <Menu 
            opened={menuOpened} 
            onChange={setMenuOpened} 
            trigger="click" 
            withinPortal 
            zIndex={1000000}
            position={isMobile ? "bottom" : "right-start"}
            offset={5}
            shadow="xl"
            styles={{
                dropdown: {
                    background: '#252525',
                    border: '1px solid #444',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    padding: '4px',
                    minWidth: '200px',
                    maxWidth: '90vw'
                },
                item: {
                    borderRadius: '4px',
                    fontSize: '13px',
                    padding: '8px 12px'
                },
                label: {
                    color: '#888',
                    textTransform: 'uppercase',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '4px 12px'
                }
            }}
        >
            <Menu.Target>
                <Box 
                    mb={4} 
                    onContextMenu={handleContextMenu}
                    onClick={(e) => e.stopPropagation()}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    style={{ 
                        cursor: 'context-menu', 
                        borderRadius: '4px', 
                        transition: 'background 0.2s',
                        userSelect: 'none',
                        WebkitUserSelect: 'none'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                    {children}
                </Box>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Label>Rule: {label}</Menu.Label>
                <Menu.Item leftSection={<Plus size={14} />} onClick={() => onSelectAttribute(path, value, '==')}>Equals current value</Menu.Item>
                <Menu.Item leftSection={<Plus size={14} />} onClick={() => onSelectAttribute(path, value, '!=')}>Does not equal value</Menu.Item>
                <Menu.Item leftSection={<Plus size={14} />} onClick={() => onSelectAttribute(path, null, 'exists')}>Exists</Menu.Item>
                <Menu.Item leftSection={<Plus size={14} />} onClick={() => onSelectAttribute(path, null, 'not_exists')}>Does not exist</Menu.Item>
                {Array.isArray(value) && (
                    <Menu.Item leftSection={<Plus size={14} />} onClick={() => onSelectAttribute(path, 1, 'length_gt')}>Has more than one</Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export const RuleAssistant: React.FC<RuleAssistantProps> = ({ onSelectAttribute, targetClass, zIndex = 1000 }) => {
    const isMobile = useMediaQuery('(max-width: 768px)') || false;
    const [searchValue, setSearchValue] = useState('');
    const [options, setOptions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [nodeDetails, setNodeDetails] = useState<any>(null);
    const [fetchingDetails, setFetchingDetails] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [hideNulls, setHideNulls] = useState(false);
    const [schema, setSchema] = useState<Record<string, any>>({});

    useEffect(() => {
        import('../../../shared/api').then(api => api.fetchCimSchema()).then(setSchema).catch(console.error);
    }, []);

    useEffect(() => {
        if (!searchValue || searchValue.length < 2) {
            setOptions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const results = await searchCim(searchValue, targetClass);
                setOptions(results.map((r: any) => ({
                    value: r.id || r.mrid,
                    label: `${r.name || r.id || r.mrid} (${r.cim_type || r.type || r.class || 'CIM Object'})`
                })));
            } catch (err) {
                console.error('Search failed', err);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchValue, targetClass]);

    const handleNodeSelect = async (id: string | null) => {
        if (!id) return;
        setFetchingDetails(true);
        try {
            const details = await fetchCimNode(id);
            setNodeDetails(details);
            setHistory([details]);
        } catch (err) {
            console.error('Fetch details failed', err);
        } finally {
            setFetchingDetails(false);
        }
    };

    const diveIntoMrid = async (mrid: string) => {
        setFetchingDetails(true);
        try {
            let details;
            try {
                details = await fetchCimNode(mrid);
            } catch {
                details = await fetchCimEquipment(mrid);
            }
            
            if (details) {
                setNodeDetails(details);
                setHistory(prev => [...prev, details]);
            }
        } catch (err) {
            console.error('Dive failed', err);
        } finally {
            setFetchingDetails(false);
        }
    };

    const goBack = () => {
        if (history.length <= 1) return;
        const newHistory = [...history];
        newHistory.pop();
        const prevDetails = newHistory[newHistory.length - 1];
        setHistory(newHistory);
        setNodeDetails(prevDetails);
    };

    const renderAttributes = (obj: any, path: string = ''): React.ReactNode => {
        if (!obj || typeof obj !== 'object') return null;

        // Determine effective class for schema lookup
        const className = obj.cim_type || obj.class || (path === '' ? obj.type : undefined);
        const classSchema = className ? schema[className] : null;

        // Merge keys from instance data and schema
        let keys = Object.keys(obj);
        if (classSchema?.attributes) {
            const schemaKeys = classSchema.attributes.map((a: any) => a.name);
            keys = Array.from(new Set([...keys, ...schemaKeys]));
        }

        // Sort keys: metadata first, then alpha
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
            if (key === 'model_id' || key === 'hierarchy') return null;
            
            const value = obj[key] !== undefined ? obj[key] : null;
            
            // Respect "Hide Nulls" toggle
            if (hideNulls && (value === null || value === undefined || value === '')) {
                return null;
            }

            const currentPath = path ? `${path}.${key}` : key;
            const isArray = Array.isArray(value);
            const isExpandable = !!(value && typeof value === 'object' && !isArray);
            const isRelation = isMrid(value);

            if (isArray) {
                return (
                    <AttributeRow 
                        key={currentPath} 
                        path={currentPath} 
                        label={key} 
                        value={value}
                        isMobile={isMobile}
                        onSelectAttribute={onSelectAttribute}
                    >
                        <Box pl={path ? 'md' : 0} style={{ borderLeft: path ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                            <Text size="xs" fw={700} c="orange" mb={4}>{key}: [List of {value.length}]</Text>
                            <Box ml="md">
                                {value.map((item: any, idx: number) => {
                                    const itemPath = `${currentPath}.${idx}`;
                                    return (
                                        <AttributeRow 
                                            key={itemPath} 
                                            path={itemPath} 
                                            label={`${key}[${idx}]`} 
                                            value={item}
                                            isMobile={isMobile}
                                            onSelectAttribute={onSelectAttribute}
                                        >
                                            <Group gap="xs" wrap="nowrap" align="flex-start" mb={4}>
                                                <Text size="10px" c="dimmed" style={{ flex: '0 0 40px' }}>[{idx}]:</Text>
                                                <Box style={{ flex: 1 }}>
                                                    {isMrid(item) ? (
                                                        <Group gap="xs">
                                                            <Relation mrid={item} onDive={diveIntoMrid} />
                                                        </Group>
                                                    ) : typeof item === 'object' && item !== null ? (
                                                        <Box py={4} px={8} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '4px' }}>
                                                            {renderAttributes(item, itemPath)}
                                                        </Box>
                                                    ) : (
                                                        <Text size="xs" c="dimmed">{String(item)}</Text>
                                                    )}
                                                </Box>
                                            </Group>
                                        </AttributeRow>
                                    );
                                })}
                            </Box>
                        </Box>
                    </AttributeRow>
                );
            }

            return (
                <AttributeRow 
                    key={currentPath} 
                    path={currentPath} 
                    label={key} 
                    value={value}
                    isMobile={isMobile}
                    onSelectAttribute={onSelectAttribute}
                >
                    <Box pl={path ? 'md' : 0} style={{ borderLeft: path ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <Group gap="xs" wrap="nowrap" align="flex-start">
                            <Text size="xs" fw={isExpandable ? 700 : 400} c={isExpandable ? "blue" : (value === null ? "dimmed" : "white")} style={{ 
                                flex: '0 0 120px', 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {key}:
                            </Text>
                            
                            <Group gap={4} style={{ flex: 1 }} wrap="nowrap">
                                {isExpandable ? (
                                    <Box style={{ width: '100%' }}>
                                        {renderAttributes(value, currentPath)}
                                    </Box>
                                ) : (
                                    <>
                                        <Box style={{ flex: 1, overflow: 'hidden' }}>
                                            {isRelation ? (
                                                <Relation mrid={value as string} onDive={diveIntoMrid} />
                                            ) : (
                                                <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all', fontStyle: value === null ? 'italic' : 'normal' }}>
                                                    {value === null ? 'not in sample data' : String(value)}
                                                </Text>
                                            )}
                                        </Box>
                                        
                                        <Group gap={2} wrap="nowrap">
                                            <ActionIcon 
                                                variant="light" 
                                                size="xs" 
                                                color="blue"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectAttribute(currentPath, value);
                                                }}
                                                title="Quick add (==)"
                                            >
                                                <Plus size={12} />
                                            </ActionIcon>
                                        </Group>
                                    </>
                                )}
                            </Group>
                        </Group>
                    </Box>
                </AttributeRow>
            );
        });
    };

    const currentTitle = nodeDetails ? (nodeDetails.name || nodeDetails.mrid || 'Object') : 'No Selection';

    return (
        <Paper p="md" withBorder onClick={(e) => e.stopPropagation()} style={{ 
            background: 'rgba(0,0,0,0.15)', 
            border: '1px solid rgba(255,255,255,0.05)' 
        }}>
            <Group justify="space-between" mb="xs">
                <Group gap="xs">
                    {history.length > 1 ? (
                        <ActionIcon variant="subtle" size="sm" onClick={(e) => { e.stopPropagation(); goBack(); }} title="Go back">
                            <ArrowLeft size={16} />
                        </ActionIcon>
                    ) : (
                        <Database size={16} color="#4dabf7" />
                    )}
                    <Stack gap={0}>
                        <Text fw={700} size="sm">Rule Assistant</Text>
                        {nodeDetails && (
                            <Text size="10px" c="blue" truncate style={{ maxWidth: 200 }}>
                                {history.length > 1 ? "Navigating: " : "Selection: "}{currentTitle}
                            </Text>
                        )}
                    </Stack>
                </Group>
                <Group gap="xs">
                    <Button 
                        variant={hideNulls ? "filled" : "outline"} 
                        size="compact-xs" 
                        color="gray"
                        onClick={(e) => { e.stopPropagation(); setHideNulls(!hideNulls); }}
                        styles={{ label: { fontSize: '10px' } }}
                    >
                        {hideNulls ? "Showing All" : "Hide Nulls"}
                    </Button>
                    <Tooltip label="Right-click an attribute for more options (exists, !=, etc.). Click name to dive." position="top-end" withArrow withinPortal zIndex={zIndex + 1000}>
                        <Info size={14} style={{ opacity: 0.5, cursor: 'help' }} />
                    </Tooltip>
                </Group>
            </Group>

            {history.length === 0 && (
                <Select
                    placeholder="Search example equipment..."
                    leftSection={loading ? <Loader size={14} /> : <Search size={14} />}
                    data={options}
                    searchable
                    searchValue={searchValue}
                    onSearchChange={setSearchValue}
                    onChange={handleNodeSelect}
                    comboboxProps={{ withinPortal: true, zIndex: 1000000 }}
                    styles={{
                        input: { background: 'rgba(0,0,0,0.2)', color: 'white' }
                    }}
                />
            )}

            {(nodeDetails || fetchingDetails) && (
                <Box mt="sm">
                    {history.length > 0 && (
                         <Button 
                            variant="subtle" 
                            size="compact-xs" 
                            color="gray" 
                            mb={8} 
                            onClick={(e) => { e.stopPropagation(); setHistory([]); setNodeDetails(null); }}
                            leftSection={<Search size={10} />}
                         >
                            Start New Search
                         </Button>
                    )}
                    
                    <Box style={{ 
                        maxHeight: '400px', 
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <Text size="10px" fw={700} mb={8} c="dimmed" tt="uppercase">
                            {fetchingDetails ? "Fetching structure..." : "Real-time Structure (Right-click for options)"}
                        </Text>
                        
                        <ScrollArea h={isMobile ? 300 : 400} offsetScrollbars>
                            <Box pr="sm">
                                {nodeDetails && renderAttributes(nodeDetails)}
                                
                                {nodeDetails?.hierarchy && (
                                    <Box mt="md" pt="md" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <Text size="10px" fw={700} mb={8} c="dimmed" tt="uppercase">CIM Hierarchy & Children</Text>
                                        {renderAttributes(nodeDetails.hierarchy, '')}
                                    </Box>
                                )}
                            </Box>
                        </ScrollArea>
                    </Box>
                </Box>
            )}

            {!nodeDetails && !fetchingDetails && options.length === 0 && !searchValue && (
                <Box py="xl" ta="center" style={{ border: '1px dashed rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                    <Text size="xs" c="dimmed">Search to explore, Right-click to pick rules</Text>
                </Box>
            )}
        </Paper>
    );
};
