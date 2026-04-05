import { Box, Group, Text } from '@mantine/core';
import { SKIP_KEYS, bareKey } from '../utils/graphUtils';
import { AttributeRow } from '../AttributeRow';

interface AttributeRendererProps {
    data: any;
    path: string;
    onSelectAttribute: (path: string, value: any, operator?: string) => void;
    schema: Record<string, any>;
    isMobile: boolean;
}

export function AttributeRenderer({
    data,
    path,
    onSelectAttribute,
    schema,
    isMobile,
}: AttributeRendererProps) {
    if (!data || typeof data !== 'object') return null;

    const className = data.cim_type || data.class || (path === '' ? data.type : undefined);
    const classSchema = className ? schema[className] : null;

    let keys = Object.keys(data).filter(k => !SKIP_KEYS.has(k));
    if (classSchema?.attributes) {
        const schemaKeys = classSchema.attributes.map((a: any) => a.name).filter(Boolean);
        keys = Array.from(new Set([...keys, ...schemaKeys]));
    }

    // Sort: meta keys first (match on bare name), then alphabetical
    const metaBare = ['id', 'mrid', 'name', 'cim_type', 'class', 'type'];
    keys.sort((a, b) => {
        const ai = metaBare.indexOf(bareKey(a)), bi = metaBare.indexOf(bareKey(b));
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return bareKey(a).localeCompare(bareKey(b));
    });

    return (
        <>
            {keys.map(key => {
                const value = data[key] !== undefined ? data[key] : null;
                const currentPath = path ? `${path}.${key}` : key;
                const display = bareKey(key);
                const isArray = Array.isArray(value);
                const isExpandable = !!(value && typeof value === 'object' && !isArray);

                if (isArray) {
                    return (
                        <AttributeRow key={currentPath} path={currentPath} label={display} value={value} isMobile={isMobile} onSelectAttribute={onSelectAttribute}>
                            <Box pl={path ? 'md' : 0} style={{ borderLeft: path ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                                <Text size="xs" fw={700} c="orange" mb={4}>{display}: [List of {value.length}]</Text>
                                <Box ml="md">
                                    {value.map((item: any, idx: number) => (
                                        <AttributeRow key={`${currentPath}.${idx}`} path={`${currentPath}.${idx}`} label={`${display}[${idx}]`} value={item} isMobile={isMobile} onSelectAttribute={onSelectAttribute}>
                                            <Group gap="xs" wrap="nowrap" align="flex-start" mb={4}>
                                                <Text size="10px" c="dimmed" style={{ flex: '0 0 40px' }}>[{idx}]:</Text>
                                                <Box style={{ flex: 1 }}>
                                                    {typeof item === 'object' && item !== null
                                                        ? <Box py={4} px={8} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                                                            <AttributeRenderer data={item} path={`${currentPath}.${idx}`} onSelectAttribute={onSelectAttribute} schema={schema} isMobile={isMobile} />
                                                        </Box>
                                                        : <Text size="xs" c="dimmed">{String(item)}</Text>}
                                                </Box>
                                            </Group>
                                        </AttributeRow>
                                    ))}
                                </Box>
                            </Box>
                        </AttributeRow>
                    );
                }

                return (
                    <AttributeRow key={currentPath} path={currentPath} label={display} value={value} isMobile={isMobile} onSelectAttribute={onSelectAttribute}>
                        <Box pl={path ? 'md' : 0} style={{ borderLeft: path ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                            <Group gap="xs" wrap="nowrap" align="flex-start">
                                <Text
                                    size="xs"
                                    fw={isExpandable ? 700 : 400}
                                    c={isExpandable ? 'blue' : value === null ? 'dimmed' : 'white'}
                                    style={{ flex: '0 0 120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                    {display}:
                                </Text>
                                <Group gap={4} style={{ flex: 1 }} wrap="nowrap">
                                    {isExpandable
                                        ? <Box style={{ width: '100%' }}>
                                            <AttributeRenderer data={value} path={currentPath} onSelectAttribute={onSelectAttribute} schema={schema} isMobile={isMobile} />
                                          </Box>
                                        : <>
                                            <Text size="xs" c="dimmed" style={{ flex: 1, wordBreak: 'break-all', fontStyle: value === null ? 'italic' : 'normal' }}>
                                                {value === null ? 'not in sample data' : String(value)}
                                            </Text>
                                        </>}
                                </Group>
                            </Group>
                        </Box>
                    </AttributeRow>
                );
            })}
        </>
    );
}
