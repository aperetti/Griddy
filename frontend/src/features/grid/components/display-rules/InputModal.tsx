import React, { useState, useEffect } from 'react';
import { Button, Group, Stack, TextInput } from '@mantine/core';
import { GridModal } from '../../../../features/ui/GridModal';

interface InputModalProps {
    opened: boolean;
    onClose: () => void;
    onSubmit: (value: string) => void;
    title: string;
    label: string;
    placeholder?: string;
    initialValue?: string;
    confirmLabel?: string;
    loading?: boolean;
}

export const InputModal: React.FC<InputModalProps> = ({
    opened,
    onClose,
    onSubmit,
    title,
    label,
    placeholder = '',
    initialValue = '',
    confirmLabel = 'Save',
    loading = false
}) => {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        if (opened) {
            setValue(initialValue);
        }
    }, [opened, initialValue]);

    const handleSubmit = () => {
        if (value.trim()) {
            onSubmit(value.trim());
            onClose();
        }
    };

    return (
        <GridModal 
            opened={opened} 
            onClose={onClose} 
            title={title}
            size="sm"
            internal={true}
        >
            <Stack gap="md">
                <TextInput
                    label={label}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => setValue(e.currentTarget.value)}
                    data-autofocus
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && value.trim()) {
                            handleSubmit();
                        }
                    }}
                />
                <Group justify="flex-end" mt="md">
                    <Button variant="subtle" color="gray" onClick={onClose} disabled={loading} size="sm">
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSubmit} 
                        disabled={!value.trim()} 
                        loading={loading}
                        size="sm"
                    >
                        {confirmLabel}
                    </Button>
                </Group>
            </Stack>
        </GridModal>
    );
};
