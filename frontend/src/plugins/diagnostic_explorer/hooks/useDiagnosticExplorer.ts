import { useState, useEffect } from 'react';
import { useMediaQuery } from '@mantine/hooks';
import { searchCim } from '../../../shared/api';
import { useSchema } from '../../../features/grid/context/SchemaContext';

export function useDiagnosticExplorer(initialId?: string | null) {
    const isMobile = useMediaQuery('(max-width: 768px)') || false;
    const { schema } = useSchema();
    const [selectedRootId, setSelectedRootId] = useState<string | null>(initialId || null);
    const [searchValue, setSearchValue] = useState('');
    const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
    const [loading, setLoading] = useState(false);

    // Initial ID sync if it changes from external source (e.g. plugin context)
    useEffect(() => {
        if (initialId) setSelectedRootId(initialId);
    }, [initialId]);

    // CIM Search logic — identical to RuleAssistant for consistency
    useEffect(() => {
        if (!searchValue || searchValue.length < 2) {
            setOptions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const results = await searchCim(searchValue);
                setOptions(results.map((r: any) => ({
                    value: r.id || r.mrid,
                    label: `${r.name || r.id || r.mrid} (${r.cim_type || r.type || r.class || 'CIM Object'})`
                })));
            } catch (err) {
                console.error('[diagnostic_explorer] Search failed', err);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchValue]);

    const selectRoot = (id: string | null) => {
        setSelectedRootId(id);
    };

    const reset = () => {
        setSelectedRootId(null);
        setSearchValue('');
    };

    return {
        selectedRootId,
        selectRoot,
        searchValue,
        setSearchValue,
        options,
        loading,
        schema,
        isMobile,
        reset
    };
}
