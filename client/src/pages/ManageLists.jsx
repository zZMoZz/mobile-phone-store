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
  Select,
  Tooltip,
  Center,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconEdit, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
} from '../api/reference.js';
import { apiErrorMessage } from '../lib/apiError.js';

// A bilingual CRUD section for a reference list (categories or brands).
function ReferenceSection({ title, addLabel, newTitle, editTitle, api }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const localizedName = (item) => (lang === 'ar' ? item.name_ar : item.name_en);
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [opened, handlers] = useDisclosure(false);
  const [saving, setSaving] = useState(false);
  // Delete flow: a record in use must have its products moved to another record first.
  const [deleting, setDeleting] = useState(null);
  const [moveTo, setMoveTo] = useState(null);
  const [deleteOpened, deleteHandlers] = useDisclosure(false);
  const [removingItem, setRemovingItem] = useState(false);

  const form = useForm({
    initialValues: { name_en: '', name_ar: '' },
    validate: {
      name_en: (v) => (v.trim() ? null : t('lists.nameRequired')),
      name_ar: (v) => (v.trim() ? null : t('lists.nameRequired')),
    },
  });

  const load = () => api.list().then(setItems).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setEditing(null);
    form.setValues({ name_en: '', name_ar: '' });
    handlers.open();
  };

  const openEdit = (item) => {
    setEditing(item);
    form.setValues({ name_en: item.name_en, name_ar: item.name_ar });
    handlers.open();
  };

  const submit = async (values) => {
    setSaving(true);
    try {
      if (editing) await api.update(editing.id, values);
      else await api.create(values);
      notifications.show({ message: t('common.saved'), color: 'green' });
      handlers.close();
      load();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const askRemove = (item) => {
    setDeleting(item);
    setMoveTo(null);
    deleteHandlers.open();
  };

  const confirmRemove = async () => {
    const inUse = (deleting?.product_count ?? 0) > 0;
    if (inUse && !moveTo) return; // must choose a target first
    setRemovingItem(true);
    try {
      await api.remove(deleting.id, inUse ? Number(moveTo) : undefined);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      deleteHandlers.close();
      load();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setRemovingItem(false);
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{title}</Title>
        <Button size="xs" leftSection={<IconPlus size={16} />} onClick={openNew}>
          {addLabel}
        </Button>
      </Group>

      <Table highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('services.nameEn')}</Table.Th>
            <Table.Th>{t('services.nameAr')}</Table.Th>
            <Table.Th>{t('common.actions')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => (
            <Table.Tr key={item.id}>
              <Table.Td>{item.name_en}</Table.Td>
              <Table.Td>{item.name_ar}</Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon variant="subtle" onClick={() => openEdit(item)}>
                    <IconEdit size={16} />
                  </ActionIcon>
                  {item.is_protected ? (
                    <Tooltip label={t('lists.protectedTooltip')}>
                      <ActionIcon variant="subtle" color="red" data-disabled onClick={(e) => e.preventDefault()}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Tooltip>
                  ) : (
                    <ActionIcon variant="subtle" color="red" onClick={() => askRemove(item)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {items.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Center p="lg">
                  <Text c="dimmed">{t('common.noResults')}</Text>
                </Center>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Modal opened={opened} onClose={handlers.close} title={editing ? editTitle : newTitle}>
        <form onSubmit={form.onSubmit(submit)}>
          <TextInput label={t('services.nameEn')} required {...form.getInputProps('name_en')} mb="sm" />
          <TextInput
            label={t('services.nameAr')}
            required
            dir="auto"
            {...form.getInputProps('name_ar')}
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

      <Modal opened={deleteOpened} onClose={deleteHandlers.close} title={t('common.delete')}>
        {deleting && (
          <Stack>
            {(deleting.product_count ?? 0) > 0 ? (
              <>
                <Text size="sm">{t('lists.deleteInUse', { count: deleting.product_count })}</Text>
                <Select
                  label={t('lists.moveProductsTo')}
                  data={items
                    .filter((i) => i.id !== deleting.id)
                    .map((i) => ({ value: String(i.id), label: localizedName(i) }))}
                  value={moveTo}
                  onChange={setMoveTo}
                  allowDeselect={false}
                  required
                />
              </>
            ) : (
              <Text size="sm">{t('lists.deleteConfirm')}</Text>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={deleteHandlers.close}>
                {t('common.cancel')}
              </Button>
              <Button
                color="red"
                loading={removingItem}
                disabled={(deleting.product_count ?? 0) > 0 && !moveTo}
                onClick={confirmRemove}
              >
                {t('common.delete')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Paper>
  );
}

export default function ManageLists() {
  const { t } = useTranslation();

  return (
    <Stack>
      <Title order={2}>{t('lists.title')}</Title>

      <ReferenceSection
        title={t('lists.categories')}
        addLabel={t('lists.addCategory')}
        newTitle={t('lists.newCategory')}
        editTitle={t('lists.editCategory')}
        api={{ list: listCategories, create: createCategory, update: updateCategory, remove: deleteCategory }}
      />

      <ReferenceSection
        title={t('lists.brands')}
        addLabel={t('lists.addBrand')}
        newTitle={t('lists.newBrand')}
        editTitle={t('lists.editBrand')}
        api={{ list: listBrands, create: createBrand, update: updateBrand, remove: deleteBrand }}
      />
    </Stack>
  );
}
