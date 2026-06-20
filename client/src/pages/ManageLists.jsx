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
  Checkbox,
  Pagination,
  useMantineColorScheme,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconEdit, IconTrash, IconSearch, IconLock, IconChevronUp, IconChevronDown, IconSelector } from '@tabler/icons-react';
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

const PAGE_SIZE = 10;

function ReferenceSection({ title, addLabel, newTitle, editTitle, api, searchQuery }) {
  const { t, i18n } = useTranslation();
  const { colorScheme } = useMantineColorScheme();
  const lang = i18n.language;
  const localizedName = (item) => (lang === 'ar' ? item.name_ar : item.name_en);
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [opened, handlers] = useDisclosure(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkMoveTarget, setBulkMoveTarget] = useState(null);
  const [bulkDeleteOpened, bulkDeleteHandlers] = useDisclosure(false);

  // Delete flow for single item
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

  const load = () => api.list().then((data) => { setItems(data); setSelected(new Set()); }).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to page 1 when search changes
  useEffect(() => { setPage(1); }, [searchQuery]);

  const filtered = items.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return item.name_en.toLowerCase().includes(q) || item.name_ar.toLowerCase().includes(q);
  });

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const diff = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
        return sortDir === 'asc' ? diff : -diff;
      })
    : filtered;

  const toggleSort = (key) => {
    setPage(1);
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <IconSelector size={14} style={{ opacity: 0.4 }} />;
    return sortDir === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
  };

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const canSelect = (item) => !item.is_protected;

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelectable = sorted.filter(canSelect).map((i) => i.id);
  const allSelected = allSelectable.length > 0 && allSelectable.every((id) => selected.has(id));

  // Still used for the per-row checkbox column alignment (no-op header cell)
  const allPageSelectable = paginated.filter(canSelect).map((i) => i.id);

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) { allSelectable.forEach((id) => next.delete(id)); }
      else { allSelectable.forEach((id) => next.add(id)); }
      return next;
    });
  };

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
    if (inUse && !moveTo) return;
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

  const handleBulkDelete = () => {
    if (selected.size === 0) return;
    setBulkMoveTarget(null);
    bulkDeleteHandlers.open();
  };

  const confirmBulkDelete = async () => {
    const selectedItems = items.filter((i) => selected.has(i.id));
    const withProducts = selectedItems.filter((i) => (i.product_count ?? 0) > 0);
    const withoutProducts = selectedItems.filter((i) => (i.product_count ?? 0) === 0);
    if (withProducts.length > 0 && !bulkMoveTarget) return;
    setBulkDeleting(true);
    try {
      for (const item of withProducts) {
        await api.remove(item.id, Number(bulkMoveTarget));
      }
      await Promise.all(withoutProducts.map((i) => api.remove(i.id)));
      notifications.show({ message: t('common.deleted'), color: 'green' });
      bulkDeleteHandlers.close();
      load();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>{title}</Title>
        <Group gap="xs">
          {selected.size > 0 && (
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconTrash size={14} />}
              loading={bulkDeleting}
              onClick={handleBulkDelete}
            >
              {t('lists.bulkDelete')} ({selected.size})
            </Button>
          )}
          <Button
            size="xs"
            variant={allSelected ? 'filled' : 'default'}
            onClick={toggleSelectAll}
          >
            {allSelected ? t('common.deselectAll') : t('common.selectAll')}
          </Button>
          <Button size="xs" leftSection={<IconPlus size={16} />} onClick={openNew}>
            {addLabel}
          </Button>
        </Group>
      </Group>

      <Table highlightOnHover verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
            <Table.Th w={40} />
            <Table.Th>{t('services.nameEn')}</Table.Th>
            <Table.Th>{t('services.nameAr')}</Table.Th>
            <Table.Th w={110} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => toggleSort('product_count')}>
              {t('lists.productsCount')} <SortIcon col="product_count" />
            </Table.Th>
            <Table.Th w={110} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => toggleSort('units_count')}>
              {t('lists.unitsCount')} <SortIcon col="units_count" />
            </Table.Th>
            <Table.Th>{t('common.actions')}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {paginated.map((item) => (
            <Table.Tr key={item.id} bg={selected.has(item.id) ? 'var(--mantine-color-indigo-light)' : undefined}>
              <Table.Td>
                {canSelect(item) ? (
                  <Checkbox
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    size="sm"
                  />
                ) : (
                  <Tooltip label={t('lists.protectedTooltip')} withArrow>
                    <IconLock size={16} style={{ color: 'var(--mantine-color-dimmed)', display: 'block' }} />
                  </Tooltip>
                )}
              </Table.Td>
              <Table.Td><Text fw={500}>{item.name_en}</Text></Table.Td>
              <Table.Td><Text fw={500}>{item.name_ar}</Text></Table.Td>
              <Table.Td>
                <Text fw={600} c={(item.product_count ?? 0) === 0 ? 'red' : undefined}>
                  {item.product_count ?? 0}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text fw={600} c={(item.units_count ?? 0) === 0 ? 'red' : undefined}>
                  {item.units_count ?? 0}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4} wrap="nowrap">
                  <ActionIcon variant="subtle" onClick={() => openEdit(item)}>
                    <IconEdit size={16} />
                  </ActionIcon>
                  {item.is_protected ? (
                    <Tooltip label={t('lists.protectedTooltip')}>
                      <ActionIcon variant="subtle" color="gray" style={{ cursor: 'not-allowed' }} onClick={(e) => e.preventDefault()}>
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
          {paginated.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={6}>
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

      {/* Edit / New modal */}
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

      {/* Delete / move modal */}
      <Modal opened={deleteOpened} onClose={deleteHandlers.close} title={t('common.delete')}>
        {deleting && (
          <Stack>
            {(deleting.product_count ?? 0) > 0 ? (
              <>
                <Text size="sm" c="red" fw={500} style={{ whiteSpace: 'pre-line' }}>
                  {t('lists.bulkDeleteHasProducts')}
                </Text>
                <Stack gap={4}>
                  <Text size="sm">
                    {localizedName(deleting)} — {deleting.product_count} {t('lists.productsCount')}
                  </Text>
                </Stack>
                <Select
                  label={t('lists.moveProductsTo')}
                  data={items
                    .filter((i) => i.id !== deleting.id && !i.is_protected)
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

      {/* Bulk delete / move modal */}
      {(() => {
        const selectedItems = items.filter((i) => selected.has(i.id));
        const withProducts = selectedItems.filter((i) => (i.product_count ?? 0) > 0);
        return (
          <Modal opened={bulkDeleteOpened} onClose={bulkDeleteHandlers.close} title={t('lists.bulkDeleteTitle')}>
            <Stack>
              {withProducts.length > 0 ? (
                <>
                  <Text size="sm" c="red" fw={500} style={{ whiteSpace: 'pre-line' }}>
                    {t('lists.bulkDeleteHasProducts')}
                  </Text>
                  <Stack gap={4}>
                    {withProducts.map((item) => (
                      <Text key={item.id} size="sm">
                        {localizedName(item)} — {item.product_count} {t('lists.productsCount')}
                      </Text>
                    ))}
                  </Stack>
                  <Select
                    label={t('lists.moveProductsTo')}
                    data={items
                      .filter((i) => !selected.has(i.id) && !i.is_protected)
                      .map((i) => ({ value: String(i.id), label: localizedName(i) }))}
                    value={bulkMoveTarget}
                    onChange={setBulkMoveTarget}
                    allowDeselect={false}
                    required
                  />
                </>
              ) : (
                <Text size="sm">{t('lists.deleteConfirm')}</Text>
              )}
              <Group justify="flex-end">
                <Button variant="default" onClick={bulkDeleteHandlers.close}>
                  {t('common.cancel')}
                </Button>
                <Button
                  color="red"
                  loading={bulkDeleting}
                  disabled={withProducts.length > 0 && !bulkMoveTarget}
                  onClick={confirmBulkDelete}
                >
                  {t('common.delete')}
                </Button>
              </Group>
            </Stack>
          </Modal>
        );
      })()}
    </Paper>
  );
}

export default function ManageLists() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  return (
    <Stack>
      <Title order={2}>{t('lists.title')}</Title>

      <TextInput
        leftSection={<IconSearch size={16} />}
        placeholder={t('lists.searchPlaceholder')}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
        maw={400}
      />

      <ReferenceSection
        title={t('lists.categories')}
        addLabel={t('lists.addCategory')}
        newTitle={t('lists.newCategory')}
        editTitle={t('lists.editCategory')}
        api={{ list: listCategories, create: createCategory, update: updateCategory, remove: deleteCategory }}
        searchQuery={search}
      />

      <ReferenceSection
        title={t('lists.brands')}
        addLabel={t('lists.addBrand')}
        newTitle={t('lists.newBrand')}
        editTitle={t('lists.editBrand')}
        api={{ list: listBrands, create: createBrand, update: updateBrand, remove: deleteBrand }}
        searchQuery={search}
      />
    </Stack>
  );
}
