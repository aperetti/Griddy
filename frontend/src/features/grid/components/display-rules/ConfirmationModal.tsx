import React from 'react';
import { Button, Group, Text, Stack } from '@mantine/core';
import { GridModal } from '../../../../features/ui/GridModal';

interface ConfirmationModalProps {
    opened: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmColor?: string;
    loading?: boolean;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    opened,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    confirmColor = 'red',
    loading = false
}) => {
    return (
        <GridModal 
            opened={opened} 
            onClose={onClose} 
            title={title}
            size="sm"
        >
            <Stack gap="md">
                <Text size="sm" c="dimmed">{message}</Text>
                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" color="gray" onClick={onClose} disabled={loading} size="sm">
                        {cancelLabel}
                    </Button>
                    <Button 
                        color={confirmColor} 
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }} 
                        loading={loading}
                        size="sm"
                        style={{ 
                            boxShadow: confirmColor === 'red' 
                                ? '0 0 15px rgba(255, 0, 0, 0.2)' 
                                : '0 0 15px rgba(0, 0, 255, 0.2)' 
                        }}
                    >
                        {confirmLabel}
                    </Button>
                </Group>
            </Stack>
        </GridModal>
    );
};
