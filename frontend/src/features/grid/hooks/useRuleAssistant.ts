import { useState, useEffect, useCallback } from 'react';
import { searchCim, fetchCimNode, fetchCimEquipment } from '../../../shared/api';
import { useSchema } from '../context/SchemaContext';

export function useRuleAssistant(targetClass?: string) {
    const { schema } = useSchema();
    const [searchValue, setSearchValue] = useState('');
    const [options, setOptions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [nodeDetails, setNodeDetails] = useState<any>(null);
    const [fetchingDetails, setFetchingDetails] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

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

    const handleNodeSelect = useCallback(async (id: string | null) => {
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
    }, []);

    const diveIntoMrid = useCallback(async (mrid: string) => {
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
    }, []);

    const goBack = useCallback(() => {
        if (history.length <= 1) return;
        const newHistory = [...history];
        newHistory.pop();
        const prevDetails = newHistory[newHistory.length - 1];
        setHistory(newHistory);
        setNodeDetails(prevDetails);
    }, [history]);

    const clearSelection = useCallback(() => {
        setHistory([]);
        setNodeDetails(null);
        setSearchValue('');
    }, []);

    return {
        searchValue,
        setSearchValue,
        options,
        loading,
        nodeDetails,
        fetchingDetails,
        history,
        schema,
        handleNodeSelect,
        diveIntoMrid,
        goBack,
        clearSelection
    };
}
