import { useState, useEffect } from 'react';
import { searchCim } from '../../../shared/api';
import { useSchema } from '../context/SchemaContext';

export function useRuleAssistant(targetClass?: string) {
    const { schema } = useSchema();
    const [searchValue, setSearchValue] = useState('');
    const [options, setOptions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

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

    return { searchValue, setSearchValue, options, loading, schema };
}
