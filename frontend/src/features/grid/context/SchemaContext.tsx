import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { fetchCimSchema } from '../../../shared/api';

interface SchemaContextType {
    schema: Record<string, any>;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

const SchemaContext = createContext<SchemaContextType | undefined>(undefined);

export const SchemaProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [schema, setSchema] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSchema = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchCimSchema();
            setSchema(data || {});
        } catch (err) {
            console.error('Failed to fetch CIM schema:', err);
            setError('Failed to load CIM schema');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSchema();
    }, []);

    return (
        <SchemaContext.Provider value={{ schema, loading, error, refresh: fetchSchema }}>
            {children}
        </SchemaContext.Provider>
    );
};

export const useSchema = () => {
    const context = useContext(SchemaContext);
    if (context === undefined) {
        throw new Error('useSchema must be used within a SchemaProvider');
    }
    return context;
};
