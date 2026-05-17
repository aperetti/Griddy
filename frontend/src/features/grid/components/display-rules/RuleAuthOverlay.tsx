import React from 'react';
import { TextInput, PasswordInput, Button, Stack, Text, Box } from '@mantine/core';
import { Lock } from 'lucide-react';
import { AnalysisWindow } from '../../../../shared/components/AnalysisWindow';

interface RuleAuthOverlayProps {
    onClose: () => void;
    onLogin: (username: string, password: string) => void;
    error: string | null;
    isAuthenticating: boolean;
    zIndex: number;
}

export const RuleAuthOverlay: React.FC<RuleAuthOverlayProps> = ({
    onClose,
    onLogin,
    error,
    isAuthenticating,
    zIndex
}) => {
    const [username, setUsername] = React.useState('');
    const [password, setPassword] = React.useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onLogin(username, password);
    };

    return (
        <AnalysisWindow 
            isOpen={true}
            storageKey="display-rules-auth"
            title="Display Rules Manager Access" 
            onClose={onClose} 
            zIndex={zIndex}
            initialWidth={400} 
            initialHeight={350}
        >
            <Box p="xl">
                <Stack align="center" gap="md" py="xl">
                    <Lock size={40} color="gray" strokeWidth={1.5} />
                    <Text fw={600} size="lg">Restricted Access</Text>
                    <Text size="sm" c="dimmed" ta="center">Authentication is required to modify network display rules.</Text>
                    
                    <form onSubmit={handleSubmit} style={{ width: '100%' }}>
                        <Stack gap="xs" mt="md">
                            <TextInput 
                                label="Username" 
                                value={username} 
                                onChange={(e) => setUsername(e.currentTarget.value)} 
                                required
                            />
                            <PasswordInput 
                                label="Password" 
                                value={password} 
                                onChange={(e) => setPassword(e.currentTarget.value)} 
                                required
                            />
                            {error && <Text c="red" size="xs">{error}</Text>}
                            <Button type="submit" fullWidth mt="md" loading={isAuthenticating}>Sign In</Button>
                        </Stack>
                    </form>
                </Stack>
            </Box>
        </AnalysisWindow>
    );
};
