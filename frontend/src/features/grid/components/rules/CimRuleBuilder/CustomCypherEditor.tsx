import { useMemo } from 'react';
import { Stack, Textarea, Alert, Text, rem } from '@mantine/core';
import { AlertCircle } from 'lucide-react';

interface CustomCypherEditorProps {
    value: string;
    onChange: (cypher: string) => void;
    entityType?: 'node' | 'edge';
}

function validateCypher(cypher: string, entityType?: 'node' | 'edge'): string[] {
    const warnings: string[] = [];
    if (!cypher.trim()) return warnings;
    if (!/RETURN/i.test(cypher)) {
        warnings.push('Query must include a RETURN clause.');
    } else if (!/as\s+mrid/i.test(cypher)) {
        warnings.push('RETURN clause should include ... AS mrid so the rule engine can use the results.');
    }
    if (entityType === 'node' && !/ConnectivityNode/i.test(cypher)) {
        warnings.push('Node rules should reference ConnectivityNode to anchor symbols to the topology.');
    }
    return warnings;
}

export function CustomCypherEditor({ value, onChange, entityType }: CustomCypherEditorProps) {
    const warnings = useMemo(() => validateCypher(value, entityType), [value, entityType]);

    return (
        <Stack gap="xs">
            <Textarea
                placeholder={`MATCH (cn:ConnectivityNode)-[]-(t:Terminal)-[]-(n:EnergyConsumer)\nWHERE n.\`IdentifiedObject.name\` CONTAINS 'Solar'\nRETURN DISTINCT cn.\`IdentifiedObject.mRID\` AS mrid`}
                value={value}
                onChange={(e) => onChange(e.currentTarget.value)}
                minRows={6}
                autosize
                styles={{
                    input: {
                        fontFamily: 'monospace',
                        fontSize: rem(12),
                    }
                }}
            />

            {warnings.length > 0 && (
                <Alert color="orange" icon={<AlertCircle size={14} />} p="xs">
                    <Stack gap={2}>
                        {warnings.map((w, i) => (
                            <Text key={i} size="xs">{w}</Text>
                        ))}
                    </Stack>
                </Alert>
            )}

            <Text size="xs" c="dimmed" fs="italic">
                Query must <code>RETURN ... AS mrid</code> — mRIDs of ConnectivityNodes (node rules) or equipment (edge rules).
                Parameters are not supported in custom Cypher mode.
            </Text>
        </Stack>
    );
}
