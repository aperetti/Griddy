import { useState, useEffect } from 'react';
import { Group, Text } from '@mantine/core';
import { fetchCimEquipment } from '../../../../../shared/api';

interface RelationProps {
    mrid: string;
    onDive: (mrid: string) => void;
}

export const Relation: React.FC<RelationProps> = ({ mrid, onDive }) => {
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
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDive(mrid); }}
            >
                {loading ? '...' : (info ? `${info.name} (${info.class})` : mrid.slice(0, 8))}
            </Text>
        </Group>
    );
};
