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
} from '@mantine/core';
import { useMantineColorScheme } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDeviceFloppy, IconDatabaseExport, IconFileExport } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  getSettings,
  updateSettings,
  createBackup,
  exportProductsUrl,
  exportTransactionsUrl,
} from '../api/settings.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { setLanguage } from '../i18n/index.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Settings() {
  const { t, i18n } = useTranslation();
  // Defaults shown (as placeholders) when a name is left blank — the same
  // per-language fallback the header/tab uses, so empty fields aren't misleading.
  const defaultNameEn = i18n.getFixedT('en')('app.title');
  const defaultNameAr = i18n.getFixedT('ar')('app.title');
  const { setSettings } = useSettings();
  const { setColorScheme } = useMantineColorScheme();
  const [values, setValues] = useState(null);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const { isAdmin } = useAuth();

  useEffect(() => {
    getSettings().then(setValues);
  }, []);

  const set = (key) => (val) =>
    setValues((v) => ({ ...v, [key]: val?.currentTarget ? val.currentTarget.value : val }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateSettings(values);
      setValues(updated);
      setSettings(updated); // refresh header store name + browser tab
      if (updated.default_theme) setColorScheme(updated.default_theme); // apply chosen default now
      if (updated.default_language) setLanguage(updated.default_language); // switch app language now
      notifications.show({ message: t('common.saved'), color: 'green' });
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const backup = async () => {
    setBackingUp(true);
    try {
      const res = await createBackup();
      notifications.show({ message: `${t('settings.backupDone')}: ${res.file}`, color: 'green' });
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setBackingUp(false);
    }
  };

  if (!values) return null;

  return (
    <Stack maw={640}>
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
          <TextInput
            label={t('settings.backupFolder')}
            description={t('settings.backupFolderHint')}
            placeholder="G:\\My Drive\\HotlineBackups"
            value={values.backup_dir || ''}
            onChange={set('backup_dir')}
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
          <Group grow wrap="nowrap">
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
              component="a"
              href={exportProductsUrl}
            >
              {t('settings.exportProducts')}
            </Button>
            <Button
              variant="default"
              size="sm"
              leftSection={<IconFileExport size={18} />}
              component="a"
              href={exportTransactionsUrl}
            >
              {t('settings.exportTransactions')}
            </Button>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
