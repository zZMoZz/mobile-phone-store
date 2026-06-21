import { useEffect, useState } from 'react';
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
  IconTrash,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  getSettings,
  updateSettings,
  createBackup,
  exportCsv,
  pickFolder,
} from '../api/settings.js';
import { listUsers, createUser, updateUser, deleteUser } from '../api/users.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { setLanguage } from '../i18n/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate } from '../lib/format.js';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // Defaults shown (as placeholders) when a name is left blank — the same
  // per-language fallback the header/tab uses, so empty fields aren't misleading.
  const defaultNameEn = i18n.getFixedT('en')('app.title');
  const defaultNameAr = i18n.getFixedT('ar')('app.title');
  const { setSettings } = useSettings();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { isAdmin, user: currentUser } = useAuth();

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('staff');
  const [userSaving, setUserSaving] = useState(false);

  useEffect(() => {
    getSettings().then(setValues);
  }, []);

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

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
    setBackingUp(true);
    try {
      const dir = await pickFolder();
      const res = await createBackup(dir || undefined);
      notifications.show({ message: `${t('settings.backupDone')}: ${res.file}`, color: 'green' });
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setBackingUp(false);
    }
  };

  const loadUsers = () => listUsers().then(setUsers).catch(() => {});

  const openNew = () => {
    setEditing(null);
    setUsername('');
    setPassword('');
    setRole('staff');
    openUserModal();
  };

  const openEdit = (u) => {
    setEditing(u);
    setUsername(u.username);
    setPassword('');
    setRole(u.role);
    openUserModal();
  };

  const saveUser = async () => {
    setUserSaving(true);
    try {
      if (editing) {
        const patch = { username, role };
        if (password) patch.password = password;
        await updateUser(editing.id, patch);
      } else {
        await createUser({ username, password, role });
      }
      notifications.show({ message: t('common.saved'), color: 'green' });
      closeUserModal();
      loadUsers();
    } catch (err) {
      notifications.show({
        message: err.response?.data?.code
          ? t(`errors.${err.response.data.code}`, { defaultValue: t('common.error') })
          : (err.response?.data?.error || t('common.error')),
        color: 'red',
      });
    } finally {
      setUserSaving(false);
    }
  };

  const removeUser = async (u) => {
    if (u.id === currentUser?.id) {
      notifications.show({ message: t('users.cannotDeleteSelf'), color: 'orange' });
      return;
    }
    if (!window.confirm(t('users.deleteConfirm'))) return;
    try {
      await deleteUser(u.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      loadUsers();
    } catch (err) {
      notifications.show({
        message: err.response?.data?.code
          ? t(`errors.${err.response.data.code}`, { defaultValue: t('common.error') })
          : (err.response?.data?.error || t('common.error')),
        color: 'red',
      });
    }
  };

  const roleColor = (r) => (r === 'admin' ? 'violet' : 'blue');

  if (!values) return null;

  return (
    <Stack>
      <Title order={2}>{t('settings.title')}</Title>

      <Paper withBorder p="lg" radius="md">
        <Stack>
          <Group grow>
            <TextInput
              label={t('settings.storeNameEn')}
              placeholder={defaultNameEn}
              value={values.store_name_en || ''}
              onChange={set('store_name_en')}
            />
            <TextInput
              label={t('settings.storeNameAr')}
              dir="auto"
              placeholder={defaultNameAr}
              value={values.store_name_ar || ''}
              onChange={set('store_name_ar')}
            />
          </Group>
          <Select
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
            label={t('settings.lowStockThreshold')}
            min={0}
            value={values.low_stock_threshold}
            onChange={set('low_stock_threshold')}
          />
          <Group justify="flex-end">
            <Tooltip label={t('auth.adminOnly')} disabled={isAdmin}>
              <span>
                <Button leftSection={<IconDeviceFloppy size={18} />} loading={saving} onClick={save} disabled={!isAdmin}>
                  {t('common.save')}
                </Button>
              </span>
            </Tooltip>
          </Group>
        </Stack>
      </Paper>

      {isAdmin && (
        <Paper withBorder p="lg" radius="md">
          <Text fw={600} mb="xs">
            {t('settings.data')}
          </Text>
          <Divider mb="md" />
          <NumberInput
            label={t('settings.backupIntervalHours')}
            description={t('settings.backupIntervalHint')}
            min={1}
            value={values.backup_interval_hours ?? 12}
            onChange={set('backup_interval_hours')}
            mb="xs"
          />
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light" mb="md">
            {t('settings.backupInfo', { hours: values.backup_interval_hours ?? 12 })}
          </Alert>
          <SimpleGrid cols={{ base: 1, xs: 3 }}>
            <Button
              variant="default"
              size="sm"
              leftSection={<IconDatabaseExport size={18} />}
              loading={backingUp}
              onClick={backup}
            >
              {t('settings.backup')}
            </Button>
            <Button
              variant="default"
              size="sm"
              leftSection={<IconFileExport size={18} />}
              loading={exportingProducts}
              onClick={() => downloadCsv('/export/products.csv', 'products.csv', setExportingProducts)}
            >
              {t('settings.exportProducts')}
            </Button>
            <Button
              variant="default"
              size="sm"
              leftSection={<IconFileExport size={18} />}
              loading={exportingTransactions}
              onClick={() => downloadCsv('/export/transactions.csv', 'transactions.csv', setExportingTransactions)}
            >
              {t('settings.exportTransactions')}
            </Button>
          </SimpleGrid>
        </Paper>
      )}

      {isAdmin && (
        <Paper withBorder radius="md">
          <Group justify="space-between" align="center" p="lg" pb="xs">
            <Text fw={600}>{t('users.title')}</Text>
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={openNew}>
              {t('users.addUser')}
            </Button>
          </Group>
          <Divider />
          <Table highlightOnHover verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
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
                        onClick={() => removeUser(u)}
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
      )}

      <Modal
        opened={userOpened}
        onClose={closeUserModal}
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
            <Button variant="default" onClick={closeUserModal}>{t('common.cancel')}</Button>
            <Button loading={userSaving} onClick={saveUser}>{t('common.save')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
