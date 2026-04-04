import React from 'react';
import { Modal, type ModalProps, useMantineColorScheme } from '@mantine/core';

interface GridModalProps extends ModalProps {
    children: React.ReactNode;
}

/**
 * A standardized Modal wrapper for the Griddy project that addresses 
 * z-index issues with Deck.gl and ensures a consistent, premium look.
 */
export const GridModal: React.FC<GridModalProps> = ({ 
    children, 
    zIndex = 5000, 
    ...props 
}) => {
    const { colorScheme } = useMantineColorScheme();

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
