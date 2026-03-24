import { useState, useEffect } from 'react';
import { Table, TextInput, Button, Paper, Title, Stack, ActionIcon, Text, Group, Modal, PasswordInput, Notification } from '@mantine/core';
import { Plus, Trash, KeyRound } from 'lucide-react';
import { usersApi } from '../../api';

interface UserItem {
  id: number;
  username: string;
  created_at: string;
}

export function UserManagementPanel() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchUsers = async () => {
    try {
      const data = await usersApi.get();
      setUsers(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openModal = (mode: 'create' | 'edit', targetUser?: string) => {
    setModalMode(mode);
    setUsername(targetUser || '');
    setPassword('');
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!username || !password) {
        setErrorMsg('Username and password are required');
        return;
      }
      await usersApi.set(username, password);
      setModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || err.message);
    }
  };

  const handleDelete = async (targetUser: string) => {
    if (!window.confirm(`Are you sure you want to delete user ${targetUser}?`)) return;
    try {
      await usersApi.delete(targetUser);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.error || err.message);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={4}>Registered Accounts</Title>
        <Button size="sm" leftSection={<Plus size={16} />} onClick={() => openModal('create')}>
          Add User
        </Button>
      </Group>

      <Paper>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Username</Table.Th>
              <Table.Th>Created At</Table.Th>
              <Table.Th w={120}>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>{u.id}</Table.Td>
                <Table.Td><Text size="sm" fw={500}>{u.username}</Text></Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{new Date(u.created_at + 'Z').toLocaleString()}</Text></Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <ActionIcon variant="subtle" title="Reset Password" onClick={() => openModal('edit', u.username)}>
                      <KeyRound size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" title="Delete User" onClick={() => handleDelete(u.username)}>
                      <Trash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {users.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4} align="center"><Text c="dimmed">No users found</Text></Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title={modalMode === 'create' ? "Create User" : "Reset Password"} centered>
        <Stack>
          {errorMsg && <Notification color="red" onClose={() => setErrorMsg('')}>{errorMsg}</Notification>}
          <TextInput
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            disabled={modalMode === 'edit'}
            required
            data-autofocus
          />
          <PasswordInput
            label="New Password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{modalMode === 'create' ? "Create" : "Save Changes"}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
