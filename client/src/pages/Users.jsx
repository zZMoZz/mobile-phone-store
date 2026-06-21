import { useEffect, useState } from 'react';
import {
  Title,
  Stack,
  Paper,
  Table,
  Button,
  ActionIcon,
  Group,
  Modal,
  TextInput,
  PasswordInput,
  Select,
  Badge,
  Text,
  Center,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconPencil, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { listUsers, createUser, updateUser, deleteUser } from '../api/users.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate } from '../lib/format.js';

export default function Users() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null); // null = new, object = edit
  const [opened, { open, close }] = useDisclosure(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('staff');
  const [saving, setSaving] = useState(false);

  const load = () => listUsers().then(setUsers).catch(() => {});

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setUsername('');
    setPassword('');
    setRole('staff');
    open();
  };

  const openEdit = (u) => {
    setEditing(u);
    setUsername(u.username);
    setPassword('');
    setRole(u.role);
    open();
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editing) {
        const patch = { username, role };
        if (password) patch.password = password;
        await updateUser(editing.id, patch);
      } else {
        await createUser({ username, password, role });
      }
      notifications.show({ message: t('common.saved'), color: 'green' });
      close();
      load();
    } catch (err) {
      notifications.show({ message: err.response?.data?.error || t('common.error'), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u) => {
    if (u.id === currentUser?.id) {
      notifications.show({ message: t('users.cannotDeleteSelf'), color: 'orange' });
      return;
    }
    if (!window.confirm(t('users.deleteConfirm'))) return;
    try {
      await deleteUser(u.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      load();
    } catch (err) {
      notifications.show({ message: err.response?.data?.error || t('common.error'), color: 'red' });
    }
  };

  const roleColor = (r) => (r === 'admin' ? 'violet' : 'blue');

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2}>{t('users.title')}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openNew}>
          {t('users.addUser')}
        </Button>
      </Group>

      <Paper withBorder radius="md">
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('users.username')}</Table.Th>
              <Table.Th>{t('users.role')}</Table.Th>
              <Table.Th>{t('users.createdAt')}</Table.Th>
              <Table.Th w={80} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td>
                  <Text fw={500}>{u.username}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={roleColor(u.role)} variant="light">
                    {t(`users.role${u.role === 'admin' ? 'Admin' : 'Staff'}`)}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatDate(u.created_at, lang)}</Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end">
                    <ActionIcon variant="subtle" onClick={() => openEdit(u)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      disabled={u.id === currentUser?.id}
                      onClick={() => remove(u)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {users.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Center p="lg">
                    <Text c="dimmed">{t('common.noResults')}</Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal
        opened={opened}
        onClose={close}
        title={editing ? t('users.editUser') : t('users.newUser')}
      >
        <Stack gap="sm">
          <TextInput
            label={t('users.username')}
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label={t('users.password')}
            description={editing ? t('users.passwordHint') : undefined}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required={!editing}
          />
          <Select
            label={t('users.role')}
            value={role}
            onChange={(v) => v && setRole(v)}
            data={[
              { value: 'admin', label: t('users.roleAdmin') },
              { value: 'staff', label: t('users.roleStaff') },
            ]}
            allowDeselect={false}
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={close}>{t('common.cancel')}</Button>
            <Button loading={saving} onClick={save}>{t('common.save')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
