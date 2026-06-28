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
  Checkbox,
  SimpleGrid,
  Divider,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconPencil, IconKey, IconUserOff, IconUserCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { listUsers, createUser, updateUser } from '../api/users.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate } from '../lib/format.js';
import { CAPABILITY_GROUPS, PRESETS } from '../lib/permissions.js';

function CapabilityEditor({ value, onChange, t }) {
  const toggle = (cap) => {
    onChange(value.includes(cap) ? value.filter((c) => c !== cap) : [...value, cap]);
  };
  return (
    <Stack gap="xs">
      {CAPABILITY_GROUPS.map(({ group, caps }) => (
        <div key={group}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" mb={4}>
            {t(`permissions.group.${group}`)}
          </Text>
          <SimpleGrid cols={2} spacing={4}>
            {caps.map((cap) => (
              <Checkbox
                key={cap}
                label={t(`permissions.caps.${cap.replace(/\./g, '_')}`)}
                checked={value.includes(cap)}
                onChange={() => toggle(cap)}
                size="xs"
              />
            ))}
          </SimpleGrid>
          <Divider mt="xs" />
        </div>
      ))}
    </Stack>
  );
}

export default function Users() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user: currentUser } = useAuth();
  const { colorScheme } = useMantineColorScheme();

  const [users, setUsers] = useState([]);
  const isOwner = currentUser?.role === 'owner';

  // New user modal
  const [newOpened, { open: openNewModal, close: closeNewModal }] = useDisclosure(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('staff');
  const [newPermissions, setNewPermissions] = useState([...PRESETS.staff]);
  const [newErrors, setNewErrors] = useState({});
  const [newSaving, setNewSaving] = useState(false);

  // Edit user modal
  const [editTarget, setEditTarget] = useState(null);
  const [editOpened, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState('staff');
  const [editPermissions, setEditPermissions] = useState([]);
  const [editSaving, setEditSaving] = useState(false);

  // Reset password modal
  const [pwTarget, setPwTarget] = useState(null);
  const [pwOpened, { open: openPwModal, close: closePwModal }] = useDisclosure(false);
  const [pwValue, setPwValue] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const load = () => listUsers().then(setUsers).catch(() => {});
  useEffect(() => { load(); }, []);

  const errMsg = (err) => {
    const code = err.response?.data?.code;
    if (code) return t(`errors.${code}`, { defaultValue: err.response?.data?.error || t('common.error') });
    return err.response?.data?.error || t('common.error');
  };

  // New user
  const openNew = () => {
    setNewUsername(''); setNewDisplayName(''); setNewPassword('');
    setNewRole('staff'); setNewPermissions([...PRESETS.staff]); setNewErrors({});
    openNewModal();
  };

  const handleCreate = async () => {
    const errs = {};
    if (!newUsername.trim()) errs.username = t('errors.user_username_required');
    if (!newPassword) errs.password = t('errors.user_password_required');
    if (Object.keys(errs).length) { setNewErrors(errs); return; }
    setNewErrors({});
    setNewSaving(true);
    try {
      await createUser({
        username: newUsername.trim(),
        display_name: newDisplayName.trim() || undefined,
        password: newPassword,
        role: newRole,
        ...(isOwner ? { permissions: newPermissions } : {}),
      });
      notifications.show({ message: t('common.saved'), color: 'green' });
      closeNewModal();
      load();
    } catch (err) {
      notifications.show({ message: errMsg(err), color: 'red' });
    } finally { setNewSaving(false); }
  };

  // Edit user
  const openEdit = (u) => {
    setEditTarget(u);
    setEditDisplayName(u.display_name || '');
    setEditRole(u.role);
    setEditPermissions(Array.isArray(u.permissions) ? u.permissions : []);
    openEditModal();
  };

  const handleEdit = async () => {
    setEditSaving(true);
    try {
      await updateUser(editTarget.id, {
        display_name: editDisplayName.trim() || null,
        ...(isOwner ? { role: editRole, permissions: editPermissions } : {}),
      });
      notifications.show({ message: t('common.saved'), color: 'green' });
      closeEditModal();
      load();
    } catch (err) {
      notifications.show({ message: errMsg(err), color: 'red' });
    } finally { setEditSaving(false); }
  };

  // Reset password
  const openPw = (u) => {
    setPwTarget(u); setPwValue(''); setPwError('');
    openPwModal();
  };

  const handleResetPassword = async () => {
    if (!pwValue) { setPwError(t('errors.user_password_required')); return; }
    setPwError('');
    setPwSaving(true);
    try {
      await updateUser(pwTarget.id, { password: pwValue });
      notifications.show({ message: t('common.saved'), color: 'green' });
      closePwModal();
    } catch (err) {
      notifications.show({ message: errMsg(err), color: 'red' });
    } finally { setPwSaving(false); }
  };

  // Toggle disable / enable
  const toggleStatus = async (u) => {
    const newStatus = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const msg = newStatus === 'DISABLED' ? t('users.disableConfirm') : t('users.enableConfirm');
    if (!window.confirm(msg)) return;
    try {
      await updateUser(u.id, { status: newStatus });
      notifications.show({ message: t('common.saved'), color: 'green' });
      load();
    } catch (err) {
      notifications.show({ message: errMsg(err), color: 'red' });
    }
  };

  const roleColor = (r) => (r === 'owner' ? 'violet' : r === 'admin' ? 'indigo' : 'blue');
  const roleLabel = (r) => t(`users.role${r === 'owner' ? 'Owner' : r === 'admin' ? 'Admin' : 'Staff'}`);
  const canAct = (u) => u.role !== 'owner' && u.id !== currentUser?.id;

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <Title order={2} fz={18}>{t('users.title')}</Title>
        <Button leftSection={<IconPlus size={14} />} onClick={openNew} fz="12.8px">
          {t('users.addUser')}
        </Button>
      </Group>

      <Paper withBorder radius="md">
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
              <Table.Th>{t('users.username')}</Table.Th>
              <Table.Th>{t('users.displayName')}</Table.Th>
              <Table.Th>{t('users.role')}</Table.Th>
              <Table.Th>{t('users.status')}</Table.Th>
              <Table.Th>{t('users.createdAt')}</Table.Th>
              <Table.Th w={100} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((u) => (
              <Table.Tr key={u.id}>
                <Table.Td><Text fw={500}>{u.username}</Text></Table.Td>
                <Table.Td>
                  <Text c={u.display_name ? undefined : 'dimmed'}>{u.display_name || '—'}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={roleColor(u.role)} variant="filled" tt="uppercase">
                    {roleLabel(u.role)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={u.status === 'ACTIVE' ? 'green' : 'orange'}
                    variant="dot"
                    tt="uppercase"
                  >
                    {u.status === 'ACTIVE' ? t('users.statusActive') : t('users.statusDisabled')}
                  </Badge>
                </Table.Td>
                <Table.Td>{formatDate(u.created_at, lang)}</Table.Td>
                <Table.Td>
                  {canAct(u) && (
                    <Group gap={4} justify="flex-end" wrap="nowrap">
                      <Tooltip label={t('common.edit')}>
                        <ActionIcon variant="subtle" color="blue" onClick={() => openEdit(u)}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={t('users.resetPassword')}>
                        <ActionIcon variant="subtle" color="orange" onClick={() => openPw(u)}>
                          <IconKey size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={u.status === 'ACTIVE' ? t('users.disable') : t('users.enable')}>
                        <ActionIcon
                          variant="subtle"
                          color={u.status === 'ACTIVE' ? 'red' : 'green'}
                          onClick={() => toggleStatus(u)}
                        >
                          {u.status === 'ACTIVE'
                            ? <IconUserOff size={16} />
                            : <IconUserCheck size={16} />}
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
            {users.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Center p="lg"><Text c="dimmed">{t('common.noResults')}</Text></Center>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* New User Modal */}
      <Modal opened={newOpened} onClose={closeNewModal} title={t('users.newUser')} size="md">
        <Stack gap="sm">
          <TextInput
            label={t('users.username')}
            value={newUsername}
            onChange={(e) => setNewUsername(e.currentTarget.value)}
            error={newErrors.username}
            required
          />
          <TextInput
            label={t('users.displayName')}
            description={t('users.displayNameHint')}
            value={newDisplayName}
            onChange={(e) => setNewDisplayName(e.currentTarget.value)}
          />
          <PasswordInput
            label={t('users.tempPassword')}
            description={t('users.tempPasswordHint')}
            value={newPassword}
            onChange={(e) => { setNewPassword(e.currentTarget.value); if (newErrors.password) setNewErrors((p) => ({ ...p, password: undefined })); }}
            error={newErrors.password}
            required
          />
          {isOwner && (
            <>
              <Select
                label={t('users.role')}
                description={t('users.roleHint')}
                value={newRole}
                onChange={(v) => { if (v) { setNewRole(v); setNewPermissions([...(PRESETS[v] ?? [])]); } }}
                data={[
                  { value: 'admin', label: t('users.roleAdmin') },
                  { value: 'staff', label: t('users.roleStaff') },
                ]}
                allowDeselect={false}
              />
              <CapabilityEditor value={newPermissions} onChange={setNewPermissions} t={t} />
            </>
          )}
          <Text size="xs" c="dimmed">{t('users.newUserHint')}</Text>
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={closeNewModal}>{t('common.cancel')}</Button>
            <Button loading={newSaving} onClick={handleCreate}>{t('common.save')}</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Edit User Modal */}
      <Modal opened={editOpened} onClose={closeEditModal} title={t('users.editUser')} size="md">
        <Stack gap="sm">
          <TextInput
            label={t('users.displayName')}
            description={t('users.displayNameHint')}
            value={editDisplayName}
            onChange={(e) => setEditDisplayName(e.currentTarget.value)}
          />
          {isOwner && (
            <>
              <Select
                label={t('users.role')}
                description={t('users.roleHint')}
                value={editRole}
                onChange={(v) => v && setEditRole(v)}
                data={[
                  { value: 'admin', label: t('users.roleAdmin') },
                  { value: 'staff', label: t('users.roleStaff') },
                ]}
                allowDeselect={false}
              />
              <CapabilityEditor value={editPermissions} onChange={setEditPermissions} t={t} />
            </>
          )}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={closeEditModal}>{t('common.cancel')}</Button>
            <Button loading={editSaving} onClick={handleEdit}>{t('common.save')}</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Reset Password Modal */}
      <Modal opened={pwOpened} onClose={closePwModal} title={t('users.resetPassword')}>
        <Stack gap="sm">
          <PasswordInput
            label={t('users.tempPassword')}
            description={t('users.tempPasswordHint')}
            value={pwValue}
            onChange={(e) => { setPwValue(e.currentTarget.value); if (pwError) setPwError(''); }}
            error={pwError}
            required
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={closePwModal}>{t('common.cancel')}</Button>
            <Button loading={pwSaving} onClick={handleResetPassword}>{t('common.save')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
