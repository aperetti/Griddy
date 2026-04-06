import { useState, useEffect } from 'react';
import { fetchOneLineDiagram } from '../api';
import { computeLayout, type DiagramLayout } from '../model/OneLineModel';

interface UseOneLineDiagramResult {
    layout: DiagramLayout | null;
    loading: boolean;
    error: string | null;
}

export function useOneLineDiagram(nodeId: string | null, depth = 2): UseOneLineDiagramResult {
    const [layout, setLayout] = useState<DiagramLayout | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!nodeId) { setLayout(null); return; }

        let cancelled = false;
        setLoading(true);
        setError(null);

        fetchOneLineDiagram(nodeId, depth)
            .then(data => { if (!cancelled) setLayout(computeLayout(data)); })
            .catch(err => { if (!cancelled) setError(err.message ?? 'Failed to load diagram'); })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [nodeId, depth]);

    return { layout, loading, error };
}
