import React from 'react';
import { Modal, type ModalProps, useMantineColorScheme, Box, Paper, Group, ActionIcon, Text } from '@mantine/core';
import { X } from 'lucide-react';

interface GridModalProps extends ModalProps {
    children: React.ReactNode;
    /** 
     * If true, renders as an absolute overlay within the parent container 
     * instead of using a Portal to the document body. 
     */
    internal?: boolean;
}

/**
 * A standardized Modal wrapper for the Griddy project that addresses 
 * z-index issues with Deck.gl and ensures a consistent, premium look.
 */
export const GridModal: React.FC<GridModalProps> = ({ 
    children, 
    zIndex = 5000, 
    internal = false,
    ...props 
}) => {
    const { colorScheme } = useMantineColorScheme();

    if (internal && props.opened) {
        return (
            <Box
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: zIndex,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    pointerEvents: 'auto'
                }}
            >
                {/* Backdrop */}
                <Box
                    onClick={props.onClose}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.7)',
                        backdropFilter: 'blur(4px)',
                        transition: 'opacity 0.2s ease'
                    }}
                />

                {/* Content */}
                <Paper
                    withBorder
                    p={0}
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        width: '100%',
                        maxWidth: props.size === 'sm' ? '400px' : '600px',
                        background: 'rgba(26, 27, 30, 0.95)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '16px',
                        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
                        overflow: 'hidden',
                        animation: 'modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }}
                >
                    <style>{`
                        @keyframes modalSlideUp {
                            from { transform: translateY(20px); opacity: 0; }
                            to { transform: translateY(0); opacity: 1; }
                        }
                    `}</style>
                    
                    <Group justify="space-between" px="xl" py="md" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <Text fw={600} size="sm">{props.title}</Text>
                        <ActionIcon variant="subtle" color="gray" onClick={props.onClose}>
                            <X size={16} />
                        </ActionIcon>
                    </Group>

                    <Box p="xl">
                        {children}
                    </Box>
                </Paper>
            </Box>
        );
    }

    return (
        <Modal
            {...props}
            zIndex={zIndex}
            withinPortal={true}
            portalProps={{ target: document.body }}
            centered
            overlayProps={{
                color: colorScheme === 'dark' ? '#000' : '#000',
                opacity: 0.55,
                blur: 3,
                ...props.overlayProps
            }}
            styles={{
                header: {
                    background: 'transparent',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    marginBottom: '16px',
                    padding: '16px 20px',
                    ...(props.styles as any)?.header
                },
                content: {
                    background: 'rgba(26, 27, 30, 0.9)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
                    overflow: 'hidden',
                    ...(props.styles as any)?.content
                },
                body: {
                    padding: '0 20px 20px 20px',
                    ...(props.styles as any)?.body
                },
                ...props.styles
            }}
        >
            {children}
        </Modal>
    );
};
