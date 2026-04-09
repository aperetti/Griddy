import { useState } from 'react';
import { Select, Stack, Text, Group, Paper, Button, Loader } from '@mantine/core';
import { Search, Database } from 'lucide-react';
import { useMediaQuery } from '@mantine/hooks';
import { useRuleAssistant } from '../../../hooks/useRuleAssistant';
import { GraphExplorer } from '../../../../../shared/components/GraphExplorer/GraphExplorer';

import type { GraphPathStep } from '../../../../../shared/hooks/useGraphExplorer';

interface RuleAssistantProps {
    onSelectAttribute: (path: string, value: any, operator?: string, graphPath?: GraphPathStep[]) => void;
    targetClass?: string;
    zIndex?: number;
    /** Called whenever the user navigates to a node in the explorer.
     *  Receives the ordered CIM class chain from the root to the selected node. */
    onNodePathChange?: (cimClassChain: string[]) => void;
}

export const RuleAssistant: React.FC<RuleAssistantProps> = ({ onSelectAttribute, targetClass, onNodePathChange }) => {
    const isMobile = useMediaQuery('(max-width: 768px)') || false;
    const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

    const {
        searchValue, setSearchValue, options, loading, schema,
    } = useRuleAssistant(targetClass);

    const handleSelect = (id: string | null) => {
        if (id) setSelectedRootId(id);
    };

    return (
        <Paper p="md" withBorder onClick={(e) => e.stopPropagation()} style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Group justify="space-between" mb="xs">
                <Group gap="xs">
                    <Database size={16} color="#4dabf7" />
                    <Stack gap={0}>
                        <Text fw={700} size="sm">Rule Assistant</Text>
                        {selectedRootId && (
                            <Text size="10px" c="blue">Graph Explorer</Text>
                        )}
                    </Stack>
                </Group>
                {selectedRootId && (
                    <Button
                        variant="subtle" size="compact-xs" color="gray"
                        leftSection={<Search size={10} />}
                        onClick={(e) => { e.stopPropagation(); setSelectedRootId(null); }}
                    >
                        New Search
                    </Button>
                )}
            </Group>

            {!selectedRootId ? (
                <Select
                    placeholder="Search example equipment..."
                    leftSection={loading ? <Loader size={14} /> : <Search size={14} />}
                    data={options}
                    searchable
                    searchValue={searchValue}
                    onSearchChange={setSearchValue}
                    onChange={handleSelect}
                    comboboxProps={{ withinPortal: true, zIndex: 1000000 }}
                    styles={{ input: { background: 'rgba(0,0,0,0.2)', color: 'white' } }}
                />
            ) : (
                <GraphExplorer
                    rootId={selectedRootId}
                    onSelectAttribute={onSelectAttribute}
                    schema={schema}
                    isMobile={isMobile}
                    onNodePathChange={onNodePathChange}
                />
            )}
        </Paper>
    );
};
