import { Stack, Text, NavLink, Box, Table, Group } from '@mantine/core';
import { Folder, FileJson, Info } from 'lucide-react';

interface HierarchyNode {
    mrid: string;
    name: string;
    class: string;
    attributes: Record<string, any>;
    children?: HierarchyNode[];
}

interface AssetHierarchyProps {
    hierarchy: HierarchyNode;
}

export function AssetHierarchy({ hierarchy }: AssetHierarchyProps) {
    const renderAttributes = (attrs: Record<string, any>) => {
        // Filter out complex objects and specific fields we already show in labels
        const simpleAttrs = Object.entries(attrs).filter(([k, v]) => 
            (typeof v !== 'object' || v === null) && 
            !['hierarchy', 'transformerends', 'mrid', 'name', 'cim_class', 'class', 'id', 'type'].includes(k)
        );

        if (simpleAttrs.length === 0) return null;

        return (
            <Box p="xs" style={{ borderLeft: '1px dashed rgba(255,255,255,0.1)', marginLeft: '12px', marginBottom: '8px' }}>
                <Table variant="unstyled" verticalSpacing={2} horizontalSpacing={4}>
                    <Table.Tbody>
                        {simpleAttrs.map(([k, v]) => (
                            <Table.Tr key={k}>
                                <Table.Td style={{ width: '120px', verticalAlign: 'top' }}>
                                    <Text size="10px" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {k.replace(/_/g, ' ')}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="10px" fw={500}>{v?.toString() ?? 'null'}</Text>
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Box>
        );
    };

    const renderNode = (node: HierarchyNode) => {
        const hasChildren = node.children && node.children.length > 0;
        
        return (
            <NavLink
                key={node.mrid}
                label={
                    <Group gap="xs" wrap="nowrap">
                        <Box style={{ flex: 1 }}>
                            <Text size="xs" fw={700} truncate>{node.name || node.mrid}</Text>
                            <Text size="10px" c="dimmed" truncate>{node.class}</Text>
                        </Box>
                    </Group>
                }
                leftSection={hasChildren ? <Folder size={14} color="#fab005" /> : <FileJson size={14} color="#40c057" />}
                variant="subtle"
                defaultOpened={node.class === 'PowerTransformer' || node.class === 'TransformerTank'}
                styles={{
                    root: { 
                        padding: '4px 8px', 
                        borderRadius: '4px',
                        marginBottom: '2px'
                    },
                    label: { lineHeight: 1.2 },
                    section: { marginRight: '8px' }
                }}
            >
                {renderAttributes(node.attributes)}
                {node.children?.map(child => renderNode(child))}
            </NavLink>
        );
    };

    return (
        <Stack gap={0} p="xs">
            <Group gap="xs" mb="sm" px="xs">
                <Info size={14} color="#228be6" />
                <Text size="xs" fw={700} c="dimmed">ASSET HIERARCHY EXPLORER</Text>
            </Group>
            {renderNode(hierarchy)}
        </Stack>
    );
}
