import React from 'react';
import { Stack, Select, Group, Text, Box, Loader, Divider } from '@mantine/core';
import { Search, Network } from 'lucide-react';
import { AnalysisWindow } from '../../../features/analytics/components/AnalysisWindow';
import { GraphExplorer } from '../../../shared/components/GraphExplorer/GraphExplorer';
import { useDiagnosticExplorer } from '../hooks/useDiagnosticExplorer';
import type { AnalysisInstance } from '../../../hooks/useAnalyticsState';

interface DiagnosticExplorerWindowProps {
    instance: AnalysisInstance;
    onClose: (id: string) => void;
    onMinimize: (id: string) => void;
    onFocus: (id: string) => void;
}

export const DiagnosticExplorerWindow: React.FC<DiagnosticExplorerWindowProps> = ({
    instance,
    onClose,
    onMinimize,
    onFocus
}) => {
    // initialId comes from the window nodeIds or edgeIds (set during handleRun)
    const initialId = instance.nodeIds?.[0] || (instance as any).edgeIds?.[0];
    
    const {
        selectedRootId,
        selectRoot,
        searchValue,
        setSearchValue,
        options,
        loading,
        schema,
        isMobile
    } = useDiagnosticExplorer(initialId);

    // Filter out internal attribute types from rule builder selection
    const handleSelectAttribute = (path: string, value: any) => {
        console.log('[diagnostic_explorer] Selected attribute (context-only):', path, value);
        // In the standalone explorer, selection currently just logs or could 
        // trigger other diagnostic actions.
    };

    return (
        <AnalysisWindow
            isOpen={true}
            title={instance.nodeName || 'Diagnostic Explorer'}
            storageKey={`diagnostic-explorer-${instance.id}`}
            onClose={() => onClose(instance.id)}
            onMinimize={() => onMinimize(instance.id)}
            onFocus={() => onFocus(instance.id)}
            zIndex={instance.zIndex}
            isMinimized={instance.isMinimized}
            initialWidth={800}
            initialHeight={650}
        >
            <Stack gap="md" h="100%">
                <Box>
                    <Group justify="space-between" mb="xs">
                        <Group gap="xs">
                            <Network size={18} color="#4dabf7" />
                            <Text fw={700}>Relationship Discovery</Text>
                        </Group>
                        {selectedRootId && (
                            <Text size="xs" c="dimmed">Exploring connections for {selectedRootId}</Text>
                        )}
                    </Group>
                    
                    <Select
                        placeholder="Search for an asset to explore..."
                        leftSection={loading ? <Loader size={14} /> : <Search size={14} />}
                        data={options}
                        searchable
                        searchValue={searchValue}
                        onSearchChange={setSearchValue}
                        onChange={(val) => selectRoot(val)}
                        comboboxProps={{ withinPortal: true, zIndex: 1000000 }}
                        styles={{ input: { background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)' } }}
                    />
                </Box>

                <Divider variant="dashed" label="Graph Exploration" labelPosition="center" />

                <Box style={{ flex: 1, minHeight: 0 }}>
                    {selectedRootId ? (
                        <GraphExplorer
                            rootId={selectedRootId}
                            onSelectAttribute={handleSelectAttribute}
                            schema={schema}
                            isMobile={isMobile}
                        />
                    ) : (
                        <Stack align="center" justify="center" h="100%" gap="xs" style={{ opacity: 0.4 }}>
                            <Network size={48} strokeWidth={1} />
                            <Text size="sm">Search and select an asset to begin diagnostic exploration</Text>
                        </Stack>
                    )}
                </Box>
            </Stack>
        </AnalysisWindow>
    );
};
