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
  Modal,
  TextInput,
  TagsInput,
  Center,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  listOptionLists,
  createOptionList,
  updateOptionList,
  deleteOptionList,
} from '../api/optionLists.js';
import { apiErrorMessage } from '../lib/apiError.js';

export default function OptionListSection() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const localizedName = (item) => (lang === 'ar' ? item.name_ar : item.name_en);
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [opened, handlers] = useDisclosure(false);
  const [saving, setSaving] = useState(false);

  const form = useForm({
    initialValues: { name_en: '', name_ar: '', options: [] },
    validate: {
      name_en: (v) => (v.trim() ? null : t('lists.nameRequired')),
      name_ar: (v) => (v.trim() ? null : t('lists.nameRequired')),
    },
  });

  const load = () => listOptionLists().then(setItems).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setEditing(null);
    form.setValues({ name_en: '', name_ar: '', options: [] });
    handlers.open();
  };

  const openEdit = (item) => {
    setEditing(item);
    form.setValues({ name_en: item.name_en, name_ar: item.name_ar, options: item.options ?? [] });
    handlers.open();
  };

  const submit = async (values) => {
    setSaving(true);
    try {
      if (editing) await updateOptionList(editing.id, values);
      else await createOptionList(values);
      notifications.show({ message: t('common.saved'), color: 'green' });
      handlers.close();
      load();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`${localizedName(item)}?`)) return;
    try {
      await deleteOptionList(item.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      load();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{t('lists.optionLists')}</Title>
        <Button size="xs" leftSection={<IconPlus size={16} />} onClick={openNew}>
          {t('lists.addOptionList')}
        </Button>
      </Group>

      <Table highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('services.nameEn')}</Table.Th>
            <Table.Th>{t('services.nameAr')}</Table.Th>
            <Table.Th>{t('lists.optionsLabel')}</Table.Th>
            <Table.Th>{t('common.actions')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => (
            <Table.Tr key={item.id}>
              <Table.Td>{item.name_en}</Table.Td>
              <Table.Td>{item.name_ar}</Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {(item.options ?? []).slice(0, 3).join(', ')}
                  {(item.options ?? []).length > 3 ? ` +${(item.options ?? []).length - 3}` : ''}
                  {(item.options ?? []).length === 0 ? '—' : ''}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon variant="subtle" onClick={() => openEdit(item)}>
                    <IconEdit size={16} />
                  </ActionIcon>
                  <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(item)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {items.length === 0 && (
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

      <Modal opened={opened} onClose={handlers.close} title={editing ? t('lists.editOptionList') : t('lists.newOptionList')}>
        <form onSubmit={form.onSubmit(submit)}>
          <TextInput label={t('services.nameEn')} required {...form.getInputProps('name_en')} mb="sm" />
          <TextInput
            label={t('services.nameAr')}
            required
            dir="auto"
            {...form.getInputProps('name_ar')}
            mb="sm"
          />
          <TagsInput
            label={t('lists.optionsLabel')}
            description={t('lists.optionsHint')}
            {...form.getInputProps('options')}
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
    </Paper>
  );
}
