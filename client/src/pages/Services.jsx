import { useEffect, useState } from 'react';
import {
  Title,
  Stack,
  Group,
  Button,
  Paper,
  Table,
  ActionIcon,
  Text,
  Badge,
  Modal,
  TextInput,
  NumberInput,
  Switch,
  Center,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  listServiceTypes,
  createServiceType,
  updateServiceType,
  deleteServiceType,
} from '../api/serviceTypes.js';
import { formatMoney } from '../lib/format.js';

export default function Services() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [opened, handlers] = useDisclosure(false);
  const [saving, setSaving] = useState(false);

  const form = useForm({
    initialValues: { name_en: '', name_ar: '', default_fee: 0, consumes_parts: false },
    validate: {
      name_en: (v) => (v.trim() ? null : 'required'),
      name_ar: (v) => (v.trim() ? null : 'required'),
    },
  });

  const load = () => listServiceTypes().then(setItems).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    form.setValues({ name_en: '', name_ar: '', default_fee: 0, consumes_parts: false });
    handlers.open();
  };

  const openEdit = (s) => {
    setEditing(s);
    form.setValues({
      name_en: s.name_en,
      name_ar: s.name_ar,
      default_fee: s.default_fee,
      consumes_parts: !!s.consumes_parts,
    });
    handlers.open();
  };

  const submit = async (values) => {
    setSaving(true);
    try {
      if (editing) await updateServiceType(editing.id, values);
      else await createServiceType(values);
      notifications.show({ message: t('common.saved'), color: 'green' });
      handlers.close();
      load();
    } catch (err) {
      notifications.show({ message: err.response?.data?.error || t('common.error'), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(t('services.deleteConfirm'))) return;
    await deleteServiceType(s.id);
    notifications.show({ message: t('common.deleted'), color: 'green' });
    load();
  };

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('services.title')}</Title>
        <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
          {t('services.addService')}
        </Button>
      </Group>
      <Text c="dimmed">{t('services.intro')}</Text>

      <Paper withBorder radius="md">
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('services.nameEn')}</Table.Th>
              <Table.Th>{t('services.nameAr')}</Table.Th>
              <Table.Th>{t('services.defaultFee')}</Table.Th>
              <Table.Th>{t('services.consumesParts')}</Table.Th>
              <Table.Th>{t('common.actions')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.name_en}</Table.Td>
                <Table.Td>{s.name_ar}</Table.Td>
                <Table.Td>{formatMoney(s.default_fee, lang)}</Table.Td>
                <Table.Td>
                  {s.consumes_parts ? (
                    <Badge color="grape" variant="light">
                      {t('common.yes')}
                    </Badge>
                  ) : (
                    <Text c="dimmed">{t('common.no')}</Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    <ActionIcon variant="subtle" onClick={() => openEdit(s)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => remove(s)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {items.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Center p="lg">
                    <Text c="dimmed">{t('common.noResults')}</Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal opened={opened} onClose={handlers.close} title={editing ? t('services.editService') : t('services.newService')}>
        <form onSubmit={form.onSubmit(submit)}>
          <TextInput label={t('services.nameEn')} required {...form.getInputProps('name_en')} mb="sm" />
          <TextInput label={t('services.nameAr')} required {...form.getInputProps('name_ar')} mb="sm" />
          <NumberInput label={t('services.defaultFee')} min={0} {...form.getInputProps('default_fee')} mb="sm" />
          <Switch
            label={t('services.consumesParts')}
            checked={form.values.consumes_parts}
            onChange={(e) => form.setFieldValue('consumes_parts', e.currentTarget.checked)}
            mb="md"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={handlers.close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {t('common.save')}
            </Button>
          </Group>
        </form>
      </Modal>
    </Stack>
  );
}
