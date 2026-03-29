import { useState, useRef } from 'react';
import { Menu, Box } from '@mantine/core';
import { Plus } from 'lucide-react';

interface AttributeRowProps {
    path: string;
    label: string;
    value: any;
    isMobile: boolean;
    onSelectAttribute: (path: string, value: any, operator?: string) => void;
    children?: React.ReactNode;
}

export const AttributeRow: React.FC<AttributeRowProps> = ({ path, label, value, isMobile, onSelectAttribute, children }) => {
    const longPressTimer = useRef<any>(null);
    const [menuOpened, setMenuOpened] = useState(false);

    const handleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        longPressTimer.current = setTimeout(() => {
            setMenuOpened(true);
        }, 600);
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpened(true);
    };

    return (
        <Menu 
            opened={menuOpened} 
            onChange={setMenuOpened} 
            trigger="click" 
            withinPortal 
            zIndex={1000000}
            position={isMobile ? "bottom" : "right-start"}
            offset={5}
            shadow="xl"
            styles={{
                dropdown: {
                    background: '#252525',
                    border: '1px solid #444',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    padding: '4px',
                    minWidth: '200px',
                    maxWidth: '90vw'
                },
                item: {
                    borderRadius: '4px',
                    fontSize: '13px',
                    padding: '8px 12px'
                },
                label: {
                    color: '#888',
                    textTransform: 'uppercase',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '4px 12px'
                }
            }}
        >
            <Menu.Target>
                <Box 
                    mb={4} 
                    onContextMenu={handleContextMenu}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    onTouchStart={handleTouchStart}
                    onTouchEnd={handleTouchEnd}
                    style={{ 
                        cursor: 'context-menu', 
                        borderRadius: '4px', 
                        transition: 'background 0.2s',
                        userSelect: 'none',
                        WebkitUserSelect: 'none'
                    }}
                    onMouseEnter={(e: React.MouseEvent) => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e: React.MouseEvent) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                >
                    {children}
                </Box>
            </Menu.Target>

            <Menu.Dropdown>
                <Menu.Label>Rule: {label}</Menu.Label>
                <Menu.Item leftSection={<Plus size={14} />} onClick={() => onSelectAttribute(path, value, '==')}>Equals current value</Menu.Item>
                <Menu.Item leftSection={<Plus size={14} />} onClick={() => onSelectAttribute(path, value, '!=')}>Does not equal value</Menu.Item>
                <Menu.Item leftSection={<Plus size={14} />} onClick={() => onSelectAttribute(path, null, 'exists')}>Exists</Menu.Item>
                <Menu.Item leftSection={<Plus size={14} />} onClick={() => onSelectAttribute(path, null, 'not_exists')}>Does not exist</Menu.Item>
                {Array.isArray(value) && (
                    <Menu.Item leftSection={<Plus size={14} />} onClick={() => onSelectAttribute(path, 1, 'length_gt')}>Has more than one</Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};
