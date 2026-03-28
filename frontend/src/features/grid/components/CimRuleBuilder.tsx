import React, { useState, useEffect, useMemo } from 'react';
import { 
    Button, Group, Text, ActionIcon, Stack, 
    SegmentedControl, Box, Badge, Tooltip, 
    Collapse, TextInput, Select as MantineSelect 
} from '@mantine/core';
import { Sparkles, Plus, Trash2, FolderPlus, Info } from 'lucide-react';
import { fetchCimSchema } from '../../../shared/api';
import { RuleAssistant } from './RuleAssistant';

interface Condition {
    id: string;
    path: string;
    op: string;
    value: any;
}

interface ConditionGroup {
    id: string;
    logical_op: 'AND' | 'OR';
    conditions: (Condition | ConditionGroup)[];
}

interface MatchConditions extends ConditionGroup {
    target_class?: string;
}

interface CimRuleBuilderProps {
    value: string; // JSON string
    onChange: (value: string) => void;
}

// Helper to generate IDs
const genId = () => Math.random().toString(36).substr(2, 9);

// Helper to ensure every node has an ID
const ensureIds = (node: any): any => {
    if (!node || typeof node !== 'object') return node;

    const isLeaf = 'path' in node;
    const newNode = { ...node, id: node.id || genId() };

    if (isLeaf) {
        // Strip accidental group properties from leaf conditions
        delete newNode.logical_op;
        delete newNode.conditions;
    } else {
        // Ensure group properties are present and consistent
        newNode.logical_op = newNode.logical_op || 'AND';
        newNode.conditions = Array.isArray(newNode.conditions) 
            ? newNode.conditions.map((c: any) => ensureIds(c)) 
            : [];
    }
    
    return newNode;
};

// ── Recursive update/remove helpers (placed outside) ────────────────

const updateNode = (root: ConditionGroup, id: string, updater: (node: any) => any): ConditionGroup => {
    if (root.id === id) return updater(root);
    
    return {
        ...root,
        conditions: root.conditions.map(c => {
            if ('conditions' in c) return updateNode(c as ConditionGroup, id, updater);
            if (c.id === id) return updater(c);
            return c;
        })
    };
};

const removeNode = (root: ConditionGroup, id: string): ConditionGroup => {
    return {
        ...root,
        conditions: root.conditions.filter(c => c.id !== id).map(c => {
            if ('conditions' in c) return removeNode(c as ConditionGroup, id);
            return c;
        })
    };
};

// ── Sub-components moved outside to maintain focus ────────────────

const ConditionRow = React.memo(({ 
    condition, 
    handleUpdateCondition, 
    handleRemove,
    currentClassAttributes 
}: { 
    condition: Condition, 
    handleUpdateCondition: (id: string, updates: Partial<Condition>) => void,
    handleRemove: (id: string) => void,
    currentClassAttributes: any[]
}) => {
    // Local state for the value to prevent focus loss during rapid typing
    const [localValue, setLocalValue] = useState(condition.value);

    // Sync local value when external value changes (e.g. from Assistant)
    useEffect(() => {
        setLocalValue(condition.value || '');
    }, [condition.value]);

    return (
        <Group gap="xs" wrap="nowrap" align="flex-end" style={{ background: 'rgba(0,0,0,0.1)', padding: '8px', borderRadius: '4px' }}>
            <Box style={{ flex: 2, minWidth: 100 }}>
                <Text size="10px" c="dimmed" mb={2}>Path</Text>
                <TextInput
                    size="xs"
                    value={condition.path}
                    placeholder="attribute.path"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleUpdateCondition(condition.id, { path: e.target.value })}
                    styles={{ input: { background: '#2a2a2a', color: 'white', border: '1px solid #444' } }}
                />
            </Box>
            <Box style={{ flex: 1, minWidth: 80 }}>
                <Text size="10px" c="dimmed" mb={2}>Op</Text>
                <MantineSelect
                    size="xs"
                    value={condition.op}
                    data={[
                        { value: '==', label: '==' },
                        { value: '!=', label: '!=' },
                        { value: '>', label: '>' },
                        { value: '<', label: '<' },
                        { value: '>=', label: '>=' },
                        { value: '<=', label: '<=' },
                        { value: 'contains', label: 'contains' },
                        { value: 'exists', label: 'exists' },
                        { value: 'not_exists', label: 'not exists' },
                        { value: 'length_gt', label: 'length >' },
                    ]}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(val) => handleUpdateCondition(condition.id, { op: val || '==' })}
                    styles={{ input: { background: '#2a2a2a', color: 'white', border: '1px solid #444' } }}
                    comboboxProps={{ withinPortal: true, zIndex: 100000 }}
                />
            </Box>
            {condition.op !== 'exists' && condition.op !== 'not_exists' && (
                <Box style={{ flex: 2, minWidth: 100 }}>
                    <Text size="10px" c="dimmed" mb={2}>Value</Text>
                    <TextInput
                        size="xs"
                        value={localValue}
                        placeholder="value"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                            setLocalValue(e.target.value);
                            handleUpdateCondition(condition.id, { value: e.target.value });
                        }}
                        styles={{ input: { background: '#2a2a2a', color: 'white', border: '1px solid #444' } }}
                    />
                </Box>
            )}
            <ActionIcon variant="light" color="red" size="lg" mb={2} onClick={() => handleRemove(condition.id)}>
                <Trash2 size={16} />
            </ActionIcon>
        </Group>
    );
});

const ConditionGroupUI = ({ 
    group, 
    depth = 0,
    focusedGroupId,
    setFocusedGroupId,
    handleToggleOp,
    handleAddCondition,
    handleAddGroup,
    handleRemove,
    handleUpdateCondition,
    currentClassAttributes 
}: { 
    group: ConditionGroup, 
    depth: number,
    focusedGroupId: string | null,
    setFocusedGroupId: (id: string | null) => void,
    handleToggleOp: (id: string, op: 'AND' | 'OR') => void,
    handleAddCondition: (groupId: string) => void,
    handleAddGroup: (groupId: string) => void,
    handleRemove: (id: string) => void,
    handleUpdateCondition: (id: string, updates: Partial<Condition>) => void,
    currentClassAttributes: any[]
}) => {
    const isRoot = depth === 0;
    const isFocused = focusedGroupId === group.id;

    return (
        <Box 
            p="xs" 
            mb="xs" 
            style={{ 
                border: isFocused ? '1px solid #4dabf7' : '1px solid rgba(255,255,255,0.05)',
                background: isRoot ? 'transparent' : 'rgba(255,255,255,0.02)',
                borderRadius: '8px',
                marginLeft: isRoot ? 0 : '12px',
                position: 'relative'
            }}
            onClick={(e) => { e.stopPropagation(); setFocusedGroupId(group.id); }}
        >
            <Group justify="space-between" mb="xs">
                <Group gap="xs">
                    <SegmentedControl 
                        size="xs"
                        value={group.logical_op}
                        onChange={(val) => handleToggleOp(group.id, val as 'AND' | 'OR')}
                        data={[
                            { label: 'AND', value: 'AND' },
                            { label: 'OR', value: 'OR' }
                        ]}
                        styles={{
                            root: { background: 'rgba(0,0,0,0.2)' },
                            indicator: { background: group.logical_op === 'AND' ? '#224422' : '#442222' }
                        }}
                    />
                    <Badge size="xs" variant="outline" color={isFocused ? "blue" : "gray"}>
                        {isFocused ? "FOCUSED" : `GROUP`}
                    </Badge>
                </Group>
                <Group gap="xs">
                    <Tooltip label="Add Condition" position="top">
                        <ActionIcon variant="light" color="green" size="sm" onClick={(e) => { e.stopPropagation(); handleAddCondition(group.id); }}>
                            <Plus size={14} />
                        </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Add Nested Group" position="top">
                        <ActionIcon variant="light" color="blue" size="sm" onClick={(e) => { e.stopPropagation(); handleAddGroup(group.id); }}>
                            <FolderPlus size={14} />
                        </ActionIcon>
                    </Tooltip>
                    {!isRoot && (
                        <ActionIcon variant="subtle" color="red" size="sm" onClick={(e) => { e.stopPropagation(); handleRemove(group.id); }}>
                            <Trash2 size={14} />
                        </ActionIcon>
                    )}
                </Group>
            </Group>

            <Stack gap="xs">
                {(group.conditions || []).length === 0 && (
                    <Text size="xs" c="dimmed" ta="center" py="sm">Empty Group. Add something!</Text>
                )}
                {(group.conditions || []).map((c: any) => (
                    c && 'conditions' in c ? (
                        <ConditionGroupUI 
                            key={c.id} 
                            group={c as ConditionGroup} 
                            depth={depth + 1} 
                            focusedGroupId={focusedGroupId}
                            setFocusedGroupId={setFocusedGroupId}
                            handleToggleOp={handleToggleOp}
                            handleAddCondition={handleAddCondition}
                            handleAddGroup={handleAddGroup}
                            handleRemove={handleRemove}
                            handleUpdateCondition={handleUpdateCondition}
                            currentClassAttributes={currentClassAttributes}
                        />
                    ) : (
                        c ? (
                            <ConditionRow 
                                key={c.id} 
                                condition={c as Condition} 
                                handleUpdateCondition={handleUpdateCondition}
                                handleRemove={handleRemove}
                                currentClassAttributes={currentClassAttributes}
                            />
                        ) : null
                    )
                ))}
            </Stack>
        </Box>
    );
};

// ── Main Component ──────────────────────────────────────────

export const CimRuleBuilder: React.FC<CimRuleBuilderProps> = ({ value, onChange }) => {
    const [schema, setSchema] = useState<Record<string, any>>({});
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [showAssistant, setShowAssistant] = useState(false);
    const [focusedGroupId, setFocusedGroupId] = useState<string | null>(null);

    const [config, setConfig] = useState<MatchConditions>(() => {
        let parsed: any = { conditions: [], logical_op: 'AND' };
        if (typeof value === 'string' && value) {
            try {
                parsed = JSON.parse(value);
            } catch (e) {
                console.error("Failed to parse value", e);
            }
        }
        return ensureIds(parsed);
    });

    useEffect(() => {
        fetchCimSchema().then(setSchema).catch(console.error);
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Sync from parent - ONLY when the value prop changes
    useEffect(() => {
        if (!value) return;
        try {
            const parsed = JSON.parse(value);
            
            // To compare meaningfully, we should ignore IDs when checking if we need to sync
            // because local config might have IDs generated by us that aren't in 'value' yet.
            const stripIds = (obj: any): string => JSON.stringify(obj, (k, v) => k === 'id' ? undefined : v);
            
            if (stripIds(parsed) !== stripIds(config)) {
                setConfig(ensureIds(parsed));
            }
        } catch { /* ignore */ }
    }, [value]);

    const updateConfig = (newConfig: MatchConditions) => {
        setConfig(newConfig);
        onChange(JSON.stringify(newConfig));
    };

    const handleAddCondition = (groupId: string) => {
        updateConfig(updateNode(config as MatchConditions, groupId, (node: ConditionGroup) => ({
            ...node,
            conditions: [...node.conditions, { id: genId(), path: '', op: '==', value: '' }]
        })));
        setFocusedGroupId(groupId);
    };

    const handleAddGroup = (groupId: string) => {
        updateConfig(updateNode(config as MatchConditions, groupId, (node: ConditionGroup) => ({
            ...node,
            conditions: [...node.conditions, { id: genId(), logical_op: 'AND', conditions: [] }]
        })));
        setFocusedGroupId(null);
    };

    const handleRemove = (id: string) => {
        updateConfig(removeNode(config as MatchConditions, id));
    };

    const handleUpdateCondition = (id: string, updates: Partial<Condition>) => {
        updateConfig(updateNode(config as MatchConditions, id, (node: Condition) => ({ ...node, ...updates })));
    };

    const handleToggleOp = (id: string, op: 'AND' | 'OR') => {
        updateConfig(updateNode(config as MatchConditions, id, (node: ConditionGroup) => ({ ...node, logical_op: op })));
    };

    const handleAssistantSelect = (path: string, value: any, operator: string = '==') => {
        const targetId = focusedGroupId || config.id;
        updateConfig(updateNode(config as MatchConditions, targetId, (node: ConditionGroup) => ({
            ...node,
            conditions: [...node.conditions, { 
                id: genId(), 
                path, 
                op: operator, 
                value: value !== null && value !== undefined ? String(value) : '' 
            }]
        })));
    };

    const availableClasses = useMemo(() => Object.keys(schema).sort(), [schema]);
    const currentClassAttributes = config.target_class ? schema[config.target_class]?.attributes || [] : [];

    const isWide = !isMobile && window.innerWidth > 800;

    return (
        <Box p="xs" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
            <Group justify="space-between" mb="md" wrap="nowrap" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                <Text fw={700} size="xs" c="dimmed">Condition Logic</Text>
                <Button 
                    variant={showAssistant ? "filled" : "light"}
                    color="blue"
                    size="compact-xs" 
                    leftSection={<Sparkles size={12} />}
                    onClick={() => setShowAssistant(!showAssistant)}
                >
                    {showAssistant ? "Hide Assistant" : "Use Rule Assistant"}
                </Button>
            </Group>

            <Box style={{ 
                display: 'flex', 
                flexDirection: (isWide && showAssistant) ? 'row' : 'column',
                gap: '20px',
                alignItems: 'flex-start'
            }}>
                {/* Left Side: Rule Builder */}
                <Box style={{ flex: (isWide && showAssistant) ? '1 1 50%' : '1 1 0', width: '100%', minWidth: 0 }}>
                    <Box mb="md">
                        <Group gap={4} mb={4}>
                            <Text size="12px" fw={700}>Target CIM Class</Text>
                            <Tooltip label="The type of CIM object this rule applies to (e.g. PowerTransformer). Use 'Any Class' for cross-cutting rules." position="top-start" withArrow withinPortal zIndex={10000}>
                                <Info size={12} style={{ opacity: 0.6, cursor: 'help' }} />
                            </Tooltip>
                        </Group>
                        <MantineSelect
                            size="xs"
                            value={config.target_class || ''}
                            onChange={(val) => updateConfig({ ...config, target_class: val || '' })}
                            placeholder="Any Class"
                            data={[
                                { value: '', label: 'Any Class' },
                                ...availableClasses.map(cls => ({ value: cls, label: cls }))
                            ]}
                            styles={{ input: { background: '#2a2a2a', color: 'white', border: '1px solid #444' } }}
                            comboboxProps={{ withinPortal: true, zIndex: 100000 }}
                        />
                    </Box>

                    <ConditionGroupUI 
                        group={config} 
                        depth={0} 
                        focusedGroupId={focusedGroupId}
                        setFocusedGroupId={setFocusedGroupId}
                        handleToggleOp={handleToggleOp}
                        handleAddCondition={handleAddCondition}
                        handleAddGroup={handleAddGroup}
                        handleRemove={handleRemove}
                        handleUpdateCondition={handleUpdateCondition}
                        currentClassAttributes={currentClassAttributes}
                    />

                    <Box mt="md" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                         <Text size="10px" c="dimmed" mb={8}>
                            <Info size={10} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                            To add from Assistant: Select a group (blue border) and click "Add" in the Assistant.
                         </Text>
                         
                         <Collapse in={true}>
                            <Box mt="sm" p="xs" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                                <Group justify="space-between" mb={4}>
                                    <Text size="10px" fw={700} c="dimmed">RESOLVED JSON</Text>
                                    <Badge size="xs" variant="light" color="gray">Read-only</Badge>
                                </Group>
                                <Text size="10px" component="pre" style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', opacity: 0.7 }}>
                                    {JSON.stringify(config, (key, value) => key === 'id' ? undefined : value, 2)}
                                </Text>
                            </Box>
                         </Collapse>
                    </Box>
                </Box>

                {/* Right Side: Assistant */}
                {showAssistant && (
                    <Box style={{ 
                        flex: isWide ? '1 1 50%' : '1 1 0', width: '100%', minWidth: 0,
                        position: isWide ? 'sticky' : 'relative', top: isWide ? '10px' : '0'
                    }}>
                        <RuleAssistant 
                            targetClass={config.target_class}
                            onSelectAttribute={handleAssistantSelect} 
                        />
                    </Box>
                )}
            </Box>
        </Box>
    );
};
