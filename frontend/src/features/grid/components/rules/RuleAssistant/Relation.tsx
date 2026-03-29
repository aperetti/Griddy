import { useState, useEffect } from 'react';
import { Group, Text } from '@mantine/core';
import { fetchCimEquipment, fetchCimNode } from '../../../../../shared/api';

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
                let details: any = null;
                try { details = await fetchCimEquipment(mrid); } catch { /* try node next */ }
                if (!details) {
                    try { details = await fetchCimNode(mrid); } catch { /* not found */ }
                }
                if (details) {
                    setInfo({
                        name: details.name || mrid.slice(0, 8),
                        class: details.cim_type || details.class || details.type || 'Object'
                    });
                } else {
                    // Ref exists in data but is not independently fetchable — show mrid as-is
                    setInfo({ name: mrid.slice(0, 12), class: 'ref' });
                }
            } catch {
                setInfo({ name: mrid.slice(0, 12), class: 'ref' });
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
