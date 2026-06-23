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
  Center,
  Divider,
  Pagination,
  Checkbox,
  useMantineColorScheme,
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
import BilingualOptionsEditor from './BilingualOptionsEditor.jsx';

export default function OptionListSection({ onUpdate }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { colorScheme } = useMantineColorScheme();
  const localizedName = (item) => (lang === 'ar' ? item.name_ar : item.name_en);
  const localizedOption = (o) => (typeof o === 'string' ? o : (lang === 'ar' ? o.name_ar : o.name_en));

  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [opened, handlers] = useDisclosure(false);
  const [saving, setSaving] = useState(false);
  const [optionsError, setOptionsError] = useState(null);

  const [deleting, setDeleting] = useState(null);
  const [deleteOpened, deleteHandlers] = useDisclosure(false);
  const [removing, setRemoving] = useState(false);

  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteOpened, bulkDeleteHandlers] = useDisclosure(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [blockedItems, setBlockedItems] = useState([]);
  const [blockedOpened, blockedHandlers] = useDisclosure(false);

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const form = useForm({
    initialValues: { name_en: '', name_ar: '', options: [] },
    validate: {
      name_en: (v) => (v.trim() ? null : t('lists.nameRequired')),
      name_ar: (v) => (v.trim() ? null : t('lists.nameRequired')),
    },
  });

  const load = () => listOptionLists().then((data) => { setItems(data); setSelected(new Set()); }).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setEditing(null);
    setOptionsError(null);
    form.setValues({ name_en: '', name_ar: '', options: [] });
    handlers.open();
  };

  const openEdit = (item) => {
    setEditing(item);
    setOptionsError(null);
    const options = (item.options ?? []).map((o) =>
      typeof o === 'string' ? { name_en: o, name_ar: o } : o
    );
    form.setValues({ name_en: item.name_en, name_ar: item.name_ar, options });
    handlers.open();
  };

  const validateOptions = (options) => {
    if (options.length === 0) return t('lists.optionsRequired');
    for (const o of options) {
      if (!o.name_en.trim() || !o.name_ar.trim()) return t('lists.optionNameRequired');
    }
    const enNames = options.map((o) => o.name_en.trim().toLowerCase());
    if (new Set(enNames).size !== enNames.length) return t('lists.optionDupEn');
    const arNames = options.map((o) => o.name_ar.trim());
    if (new Set(arNames).size !== arNames.length) return t('lists.optionDupAr');
    return null;
  };

  const submit = async (values) => {
    const optErr = validateOptions(values.options);
    if (optErr) { setOptionsError(optErr); return; }
    setOptionsError(null);
    setSaving(true);
    try {
      if (editing) await updateOptionList(editing.id, values);
      else await createOptionList(values);
      notifications.show({ message: t('common.saved'), color: 'green' });
      handlers.close();
      load();
      onUpdate?.();
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'optlist_name_en_duplicate') {
        form.setFieldError('name_en', t('errors.optlist_name_en_duplicate'));
      } else if (code === 'optlist_name_ar_duplicate') {
        form.setFieldError('name_ar', t('errors.optlist_name_ar_duplicate'));
      } else {
        notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
      }
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (item) => {
    setDeleting(item);
    deleteHandlers.open();
  };

  const confirmDelete = async () => {
    setRemoving(true);
    try {
      await deleteOptionList(deleting.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      deleteHandlers.close();
      load();
      onUpdate?.();
    } catch (err) {
      deleteHandlers.close();
      if (err?.response?.data?.code === 'optlist_in_use') {
        setBlockedItems([{
          listName: lang === 'ar' ? deleting.name_ar : deleting.name_en,
          services: err.response.data.params?.services || [],
        }]);
        blockedHandlers.open();
      } else {
        notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
      }
    } finally {
      setRemoving(false);
    }
  };

  const toggleSelect = (id) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggleSelectAll = () => setSelected(() => allSelected ? new Set() : new Set(items.map((i) => i.id)));
  const confirmBulkDelete = async () => {
    bulkDeleteHandlers.close();
    setBulkDeleting(true);
    const blocked = [];
    try {
      for (const item of items.filter((i) => selected.has(i.id))) {
        try {
          await deleteOptionList(item.id);
        } catch (err) {
          if (err?.response?.data?.code === 'optlist_in_use') {
            blocked.push({
              listName: lang === 'ar' ? item.name_ar : item.name_en,
              services: err.response.data.params?.services || [],
            });
          } else {
            throw err;
          }
        }
      }
      if (items.filter((i) => selected.has(i.id)).length > blocked.length) {
        notifications.show({ message: t('common.deleted'), color: 'green' });
      }
      load();
      onUpdate?.();
      if (blocked.length > 0) {
        setBlockedItems(blocked);
        blockedHandlers.open();
      }
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setBulkDeleting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paginatedItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{t('lists.optionLists')}</Title>
        <Group gap="xs">
          {selected.size > 0 && (
            <Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} loading={bulkDeleting} onClick={bulkDeleteHandlers.open}>
              {t('lists.bulkDelete')} ({selected.size})
            </Button>
          )}
          <Button size="xs" variant={allSelected ? 'filled' : 'default'} onClick={toggleSelectAll}>
            {allSelected ? t('common.deselectAll') : t('common.selectAll')}
          </Button>
          <Button size="xs" leftSection={<IconPlus size={16} />} onClick={openNew}>
            {t('lists.addOptionList')}
          </Button>
        </Group>
      </Group>

      <Table highlightOnHover verticalSpacing="sm" styles={{ td: { fontWeight: 500 } }}>
        <Table.Thead>
          <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
            <Table.Th w={40} />
            <Table.Th>{t('services.nameEn')}</Table.Th>
            <Table.Th>{t('services.nameAr')}</Table.Th>
            <Table.Th>{t('lists.optionsLabel')}</Table.Th>
            <Table.Th>{t('common.actions')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {paginatedItems.map((item) => {
            const opts = item.options ?? [];
            const preview = opts.slice(0, 3).map(localizedOption).join(', ');
            const extra = opts.length > 3 ? ` +${opts.length - 3}` : '';
            return (
              <Table.Tr key={item.id} bg={selected.has(item.id) ? 'var(--mantine-color-indigo-light)' : undefined}>
                <Table.Td>
                  <Checkbox checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} size="sm" />
                </Table.Td>
                <Table.Td>{item.name_en}</Table.Td>
                <Table.Td>{item.name_ar}</Table.Td>
                <Table.Td>
                  {opts.length === 0
                    ? <Text size="sm" c="dimmed">—</Text>
                    : preview + extra}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <ActionIcon variant="subtle" onClick={() => openEdit(item)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => openDelete(item)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
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
      {totalPages > 1 && (
        <Group justify="center" mt="md">
          <Pagination value={page} onChange={setPage} total={totalPages} size="sm" />
        </Group>
      )}

      {/* Bulk delete modal */}
      <Modal opened={bulkDeleteOpened} onClose={bulkDeleteHandlers.close} title={t('lists.bulkDeleteTitle')} size="sm">
        <Text mb="xl">{t('lists.bulkDeleteConfirm', { count: selected.size })}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={bulkDeleteHandlers.close}>{t('common.cancel')}</Button>
          <Button color="red" loading={bulkDeleting} onClick={confirmBulkDelete}>{t('common.delete')}</Button>
        </Group>
      </Modal>

      {/* In-use blocked modal */}
      <Modal opened={blockedOpened} onClose={blockedHandlers.close} title={t('lists.inUseTitle')} size="sm">
        <Stack gap="md" mb="xl">
          {blockedItems.map((item, i) => (
            <div key={i}>
              <Text fw={600} mb={4}>{item.listName}</Text>
              <Text size="sm" c="dimmed" mb={4}>{t('lists.inUseBy')}</Text>
              <Stack gap={2}>
                {item.services.map((s, j) => (
                  <Text key={j} size="sm">{'• '}{lang === 'ar' ? s.name_ar : s.name_en}</Text>
                ))}
              </Stack>
            </div>
          ))}
        </Stack>
        <Group justify="flex-end">
          <Button onClick={blockedHandlers.close}>{t('common.close')}</Button>
        </Group>
      </Modal>

      {/* Edit / create modal */}
      <Modal
        opened={opened}
        onClose={handlers.close}
        title={editing ? t('lists.editOptionList') : t('lists.newOptionList')}
      >
        <form onSubmit={form.onSubmit(submit)}>
          <TextInput label={t('services.nameEn')} required {...form.getInputProps('name_en')} mb="sm" />
          <TextInput
            label={t('services.nameAr')}
            required
            dir="auto"
            {...form.getInputProps('name_ar')}
            mb="sm"
          />
          <Divider label={t('lists.optionsLabel')} labelPosition="left" mb="xs" />
          <BilingualOptionsEditor
            value={form.values.options}
            onChange={(v) => { form.setFieldValue('options', v); setOptionsError(null); }}
            error={optionsError}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={handlers.close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {t('common.save')}
            </Button>
          </Group>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal opened={deleteOpened} onClose={deleteHandlers.close} title={t('common.delete')}>
        {deleting && (
          <Stack>
            <Text size="sm">{t('lists.deleteConfirm')}</Text>
            <Text size="sm" fw={500}>{localizedName(deleting)}</Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={deleteHandlers.close}>
                {t('common.cancel')}
              </Button>
              <Button color="red" loading={removing} onClick={confirmDelete}>
                {t('common.delete')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Paper>
  );
}
