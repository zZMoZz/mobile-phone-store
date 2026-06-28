import { useEffect, useRef, useState } from 'react';
import {
  Title,
  Stack,
  Group,
  Paper,
  TextInput,
  Select,
  NumberInput,
  Button,
  Divider,
  Text,
  Tooltip,
  Table,
  ActionIcon,
  Badge,
  Center,
  Modal,
  PasswordInput,
  SimpleGrid,
  Alert,
  List,
  Checkbox,
  ScrollArea,
} from '@mantine/core';
import { useMantineColorScheme } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconDeviceFloppy,
  IconDatabaseExport,
  IconFileExport,
  IconInfoCircle,
  IconPlus,
  IconPencil,
  IconKey,
  IconUserOff,
  IconUserCheck,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  getSettings,
  updateSettings,
  createBackup,
  exportCsv,
  pickFolder,
} from '../api/settings.js';
import { listUsers, createUser, updateUser } from '../api/users.js';
import { verifyPasswordApi } from '../api/auth.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { setLanguage } from '../i18n/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate } from '../lib/format.js';
import { CAPABILITY_GROUPS, PRESETS } from '../lib/permissions.js';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // Defaults shown (as placeholders) when a name is left blank — the same
  // per-language fallback the header/tab uses, so empty fields aren't misleading.
  const defaultNameEn = i18n.getFixedT('en')('app.title');
  const defaultNameAr = i18n.getFixedT('ar')('app.title');
  const { setSettings } = useSettings();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { can, isOwner, user: currentUser } = useAuth();
  const canSettings = can('settings.manage');
  const canBackup = can('data.backup');
  const canUsers = can('users.manage');

  // Settings state
  const [values, setValues] = useState(null);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [exportingProducts, setExportingProducts] = useState(false);
  const [exportingTransactions, setExportingTransactions] = useState(false);

  // Users state
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [userOpened, { open: openUserModal, close: closeUserModal }] = useDisclosure(false);
  const [resetPwOpened, { open: openResetPw, close: closeResetPw }] = useDisclosure(false);
  const [resetTarget, setResetTarget] = useState(null);

  // Form fields
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('staff');
  const [permissions, setPermissions] = useState(PRESETS.staff);
  const [tempPassword, setTempPassword] = useState('');
  const [userSaving, setUserSaving] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);

  // Password verification gate
  const [verifyOpened, { open: openVerify, close: closeVerify }] = useDisclosure(false);
  const [verifyPw, setVerifyPw] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const pendingAction = useRef(null);

  const withVerification = (action) => {
    pendingAction.current = action;
    setVerifyPw('');
    setVerifyError('');
    openVerify();
  };

  const handleVerify = async () => {
    setVerifyLoading(true);
    setVerifyError('');
    try {
      await verifyPasswordApi(verifyPw);
      closeVerify();
      pendingAction.current?.();
    } catch (err) {
      const code = err.response?.data?.code;
      setVerifyError(code ? t(`errors.${code}`, { defaultValue: t('common.error') }) : t('common.error'));
    } finally {
      setVerifyLoading(false);
    }
  };

  useEffect(() => {
    getSettings().then(setValues);
  }, []);

  useEffect(() => {
    if (canUsers) loadUsers();
  }, [canUsers]);

  const set = (key) => (val) =>
    setValues((v) => ({ ...v, [key]: val?.currentTarget ? val.currentTarget.value : val }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings(values);
      setValues(updated);
      setSettings(updated);
      if (updated.default_theme) setColorScheme(updated.default_theme);
      if (updated.default_language) setLanguage(updated.default_language);
      notifications.show({ message: t('common.saved'), color: 'green' });
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const downloadCsv = async (path, filename, setLoading) => {
    setLoading(true);
    try {
      const blob = await exportCsv(path);
      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        notifications.show({ message: t('common.error'), color: 'red' });
      }
    } finally {
      setLoading(false);
    }
  };

  const backup = async () => {
    try {
      const dir = await pickFolder();
      setBackingUp(true);
      const res = await createBackup(dir || undefined);
      notifications.show({ message: `${t('settings.backupDone')}: ${res.file}`, color: 'green' });
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setBackingUp(false);
    }
  };

  const loadUsers = () => listUsers().then(setUsers).catch(() => {});

  const openNew = () => withVerification(() => {
    setEditing(null);
    setUsername('');
    setDisplayName('');
    setPassword('');
    setRole('staff');
    setPermissions(PRESETS.staff);
    openUserModal();
  });

  const openEdit = (u) => withVerification(() => {
    setEditing(u);
    setUsername(u.username);
    setDisplayName(u.display_name || '');
    setPassword('');
    setRole(u.role);
    setPermissions(u.permissions ?? []);
    openUserModal();
  });

  const openResetPassword = (u) => withVerification(() => {
    setResetTarget(u);
    setTempPassword('');
    openResetPw();
  });

  const saveUser = async () => {
    setUserSaving(true);
    try {
      if (editing) {
        const patch = {};
        if (username !== editing.username) patch.username = username.trim();
        if (displayName !== (editing.display_name || '')) patch.display_name = displayName.trim() || null;
        if (role !== editing.role) patch.role = role;
        // Capabilities are owner-only; send them when they actually changed.
        if (isOwner && JSON.stringify(permissions) !== JSON.stringify(editing.permissions ?? [])) {
          patch.permissions = permissions;
        }
        if (Object.keys(patch).length > 0) await updateUser(editing.id, patch);
      } else {
        await createUser({
          username,
          display_name: displayName.trim() || null,
          password,
          role,
          // Only the owner may confer custom capabilities; the server ignores this
          // field for delegated managers and applies the staff preset.
          permissions: isOwner ? permissions : undefined,
        });
      }
      notifications.show({ message: t('common.saved'), color: 'green' });
      closeUserModal();
      loadUsers();
    } catch (err) {
      notifications.show({
        message: err.response?.data?.code
          ? t(`errors.${err.response.data.code}`, { defaultValue: t('common.error') })
          : t('common.error'),
        color: 'red',
      });
    } finally {
      setUserSaving(false);
    }
  };

  const saveResetPassword = async () => {
    if (!tempPassword || !resetTarget) return;
    setResetSaving(true);
    try {
      await updateUser(resetTarget.id, { password: tempPassword });
      notifications.show({ message: t('common.saved'), color: 'green' });
      closeResetPw();
      loadUsers();
    } catch (err) {
      notifications.show({
        message: err.response?.data?.code
          ? t(`errors.${err.response.data.code}`, { defaultValue: t('common.error') })
          : t('common.error'),
        color: 'red',
      });
    } finally {
      setResetSaving(false);
    }
  };

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);

  const toggleStatus = (u) => {
    if (u.id === currentUser?.id) {
      notifications.show({ message: t('users.cannotDisableSelf'), color: 'orange' });
      return;
    }
    withVerification(() => { setConfirmTarget(u); openConfirm(); });
  };

  const confirmToggleStatus = async () => {
    const u = confirmTarget;
    closeConfirm();
    try {
      await updateUser(u.id, { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' });
      notifications.show({ message: t('common.saved'), color: 'green' });
      loadUsers();
    } catch (err) {
      notifications.show({
        message: err.response?.data?.code
          ? t(`errors.${err.response.data.code}`, { defaultValue: t('common.error') })
          : t('common.error'),
        color: 'red',
      });
    }
  };

  // What the current viewer can do to a given target user. The owner account is
  // always protected; otherwise any users.manage holder may manage non-owners.
  const canEditUser = (u) => canUsers && u.role !== 'owner';
  const canResetPassword = (u) => canUsers && u.role !== 'owner' && u.id !== currentUser?.id;
  const canToggleStatus = (u) => canUsers && u.role !== 'owner' && u.id !== currentUser?.id;

  const roleColor = (r) => ({ owner: 'grape', admin: 'violet', staff: 'blue' })[r] ?? 'gray';
  const statusColor = (s) => (s === 'ACTIVE' ? 'green' : 'red');

  // Role options available when creating/editing
  const roleOptions = () => {
    if (isOwner) return [
      { value: 'admin', label: t('users.roleAdmin') },
      { value: 'staff', label: t('users.roleStaff') },
    ];
    return [{ value: 'staff', label: t('users.roleStaff') }];
  };

  if (!values) return null;

  return (
    <Stack>
      <Title order={2}>{t('settings.title')}</Title>

      {canSettings && (
      <Paper withBorder p="lg" radius="md">
        <Stack>
          <Group grow>
            <TextInput
              size="md"
              label={t('settings.storeNameEn')}
              placeholder={defaultNameEn}
              value={values.store_name_en || ''}
              onChange={set('store_name_en')}
            />
            <TextInput
              size="md"
              label={t('settings.storeNameAr')}
              dir="auto"
              placeholder={defaultNameAr}
              value={values.store_name_ar || ''}
              onChange={set('store_name_ar')}
            />
          </Group>
          <Select
            size="md"
            label={t('settings.defaultLanguage')}
            data={[
              { value: 'ar', label: 'العربية' },
              { value: 'en', label: 'English' },
            ]}
            value={values.default_language}
            onChange={set('default_language')}
            allowDeselect={false}
          />
          <Select
            size="md"
            label={t('settings.defaultTheme')}
            data={[
              { value: 'light', label: t('settings.themeLight') },
              { value: 'dark', label: t('settings.themeDark') },
            ]}
            value={values.default_theme}
            onChange={set('default_theme')}
            allowDeselect={false}
          />
          <NumberInput
            size="md"
            label={t('settings.lowStockThreshold')}
            min={0}
            value={values.low_stock_threshold}
            onChange={set('low_stock_threshold')}
          />
          <Group justify="flex-end">
            <Button leftSection={<IconDeviceFloppy size={18} />} loading={saving} onClick={save}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </Paper>
      )}

      {canBackup && (
        <Paper withBorder p="lg" radius="md">
          <Text fw={600} fz="md" mb="xs">
            {t('settings.data')}
          </Text>
          <Divider mb="md" />
          <NumberInput
            size="md"
            label={t('settings.backupIntervalHours')}
            description={t('settings.backupIntervalHint')}
            min={1}
            value={values.backup_interval_hours ?? 12}
            onChange={set('backup_interval_hours')}
            mb="xs"
          />
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light" mb="md">
            <List size="sm" spacing={4}>
              <List.Item>{t('settings.backupInfo1', { hours: values.backup_interval_hours ?? 12 })}</List.Item>
              <List.Item>{t('settings.backupInfo2')}</List.Item>
              <List.Item>{t('settings.backupInfo3')}</List.Item>
            </List>
          </Alert>
          <SimpleGrid cols={{ base: 1, xs: 3 }}>
            <Button
              variant="default"
              size="md"
              leftSection={<IconDatabaseExport size={18} />}
              loading={backingUp}
              onClick={backup}
            >
              {t('settings.backup')}
            </Button>
            <Button
              variant="default"
              size="md"
              leftSection={<IconFileExport size={18} />}
              loading={exportingProducts}
              onClick={() => downloadCsv(`/export/products.csv?lang=${lang}`, 'products.csv', setExportingProducts)}
            >
              {t('settings.exportProducts')}
            </Button>
            <Button
              variant="default"
              size="md"
              leftSection={<IconFileExport size={18} />}
              loading={exportingTransactions}
              onClick={() => downloadCsv(`/export/transactions.csv?lang=${lang}`, 'transactions.csv', setExportingTransactions)}
            >
              {t('settings.exportTransactions')}
            </Button>
          </SimpleGrid>
        </Paper>
      )}

      {canUsers && (
        <Paper withBorder radius="md">
          <Group justify="space-between" align="center" p={10}>
            <Text fw={600} fz={18}>{t('users.title')}</Text>
            <Button size="sm" leftSection={<IconPlus size={14} />} onClick={openNew} fz="12.8px">
              {t('users.addUser')}
            </Button>
          </Group>
          <Divider />
          <ScrollArea>
          <Table highlightOnHover verticalSpacing="md" fz={15} miw={700} styles={{ th: { padding: 10, whiteSpace: 'nowrap' }, td: { whiteSpace: 'nowrap' } }}>
            <Table.Thead>
              <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
                <Table.Th>{t('users.username')}</Table.Th>
                <Table.Th>{t('users.displayName')}</Table.Th>
                <Table.Th>{t('users.role')}</Table.Th>
                <Table.Th>{t('users.status')}</Table.Th>
                <Table.Th>{t('users.createdAt')}</Table.Th>
                <Table.Th w={120}>{t('common.actions')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users.map((u) => (
                <Table.Tr key={u.id}>
                  <Table.Td><Text fw={500}>{u.username}</Text></Table.Td>
                  <Table.Td><Text c="dimmed">{u.display_name || '—'}</Text></Table.Td>
                  <Table.Td>
                    <Badge color={roleColor(u.role)} variant="light">
                      {t(`users.role${u.role === 'owner' ? 'Owner' : u.role === 'admin' ? 'Admin' : 'Staff'}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={statusColor(u.status)} variant="dot">
                      {t(`users.status${u.status === 'ACTIVE' ? 'Active' : 'Disabled'}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{formatDate(u.created_at, lang)}</Table.Td>
                  <Table.Td>
                    <Group gap={4} justify="flex-end">
                      {canEditUser(u) && (
                        <Tooltip label={t('common.edit')}>
                          <ActionIcon variant="subtle" onClick={() => openEdit(u)}>
                            <IconPencil size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {canResetPassword(u) && (
                        <Tooltip label={t('users.resetPassword')}>
                          <ActionIcon variant="subtle" color="orange" onClick={() => openResetPassword(u)}>
                            <IconKey size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {canToggleStatus(u) && (
                        <Tooltip label={u.status === 'ACTIVE' ? t('users.disable') : t('users.enable')}>
                          <ActionIcon
                            variant="subtle"
                            color={u.status === 'ACTIVE' ? 'red' : 'green'}
                            onClick={() => toggleStatus(u)}
                          >
                            {u.status === 'ACTIVE' ? <IconUserOff size={16} /> : <IconUserCheck size={16} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
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
          </ScrollArea>
        </Paper>
      )}

      {/* Create / Edit User Modal */}
      <Modal
        opened={userOpened}
        onClose={closeUserModal}
        title={editing ? t('users.editUser') : t('users.newUser')}
      >
        <Stack gap="sm">
          <TextInput
            size="md"
            label={t('users.username')}
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            required
          />
          <TextInput
            size="md"
            label={t('users.displayName')}
            description={t('users.displayNameHint')}
            value={displayName}
            onChange={(e) => setDisplayName(e.currentTarget.value)}
          />
          {!editing && (
            <PasswordInput
              size="md"
              label={t('users.password')}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />
          )}
          <Select
            size="md"
            label={t('users.role')}
            description={t('users.roleHint')}
            value={role}
            onChange={(v) => {
              if (!v) return;
              setRole(v);
              setPermissions([...(PRESETS[v] ?? [])]);
            }}
            data={roleOptions()}
            allowDeselect={false}
            disabled={!isOwner}
          />
          {isOwner && (
            <Stack gap="xs">
              <Text size="sm" fw={600}>{t('permissions.title')}</Text>
              <Checkbox.Group value={permissions} onChange={setPermissions}>
                <Stack gap="sm">
                  {CAPABILITY_GROUPS.map((g) => (
                    <div key={g.group}>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={4}>
                        {t(`permissions.group.${g.group}`)}
                      </Text>
                      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" verticalSpacing="xs">
                        {g.caps.map((capKey) => (
                          <Checkbox
                            key={capKey}
                            value={capKey}
                            label={t(`permissions.caps.${capKey.replaceAll('.', '_')}`)}
                          />
                        ))}
                      </SimpleGrid>
                    </div>
                  ))}
                </Stack>
              </Checkbox.Group>
            </Stack>
          )}
          {!editing && (
            <Text size="sm" c="dimmed">{t('users.newUserHint')}</Text>
          )}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={closeUserModal}>{t('common.cancel')}</Button>
            <Button loading={userSaving} onClick={saveUser}>{t('common.save')}</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        opened={resetPwOpened}
        onClose={closeResetPw}
        title={t('users.resetPassword')}
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{resetTarget?.username}</Text>
          <PasswordInput
            size="md"
            label={t('users.tempPassword')}
            description={t('users.tempPasswordHint')}
            value={tempPassword}
            onChange={(e) => setTempPassword(e.currentTarget.value)}
            required
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={closeResetPw}>{t('common.cancel')}</Button>
            <Button loading={resetSaving} onClick={saveResetPassword} disabled={!tempPassword}>
              {t('users.resetPassword')}
            </Button>
          </Group>
        </Stack>
      </Modal>
      {/* Password verification modal */}
      <Modal opened={verifyOpened} onClose={closeVerify} title={t('auth.verifyTitle')} size="sm">
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{t('auth.verifyHint')}</Text>
          <PasswordInput
            label={t('auth.password')}
            value={verifyPw}
            onChange={(e) => { setVerifyPw(e.currentTarget.value); if (verifyError) setVerifyError(''); }}
            error={verifyError}
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
            autoFocus
          />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={closeVerify}>{t('common.cancel')}</Button>
            <Button loading={verifyLoading} onClick={handleVerify}>{t('common.confirm')}</Button>
          </Group>
        </Stack>
      </Modal>

      {/* Disable / Enable confirmation modal */}
      <Modal
        opened={confirmOpened}
        onClose={closeConfirm}
        title={confirmTarget?.status === 'ACTIVE' ? t('users.disable') : t('users.enable')}
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            {confirmTarget?.status === 'ACTIVE' ? t('users.disableConfirm') : t('users.enableConfirm')}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeConfirm}>{t('common.cancel')}</Button>
            <Button
              color={confirmTarget?.status === 'ACTIVE' ? 'red' : 'green'}
              onClick={confirmToggleStatus}
            >
              {confirmTarget?.status === 'ACTIVE' ? t('users.disable') : t('users.enable')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
