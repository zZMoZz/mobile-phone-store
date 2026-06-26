import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Title,
  Group,
  Button,
  TextInput,
  Select,
  NumberInput,
  Switch,
  Table,
  Image,
  ActionIcon,
  Pagination,
  Paper,
  SimpleGrid,
  Grid,
  Text,
  Badge,
  Stack,
  Tooltip,
  Center,
  ScrollArea,
  Checkbox,
  Modal,
  Alert,
  useMantineColorScheme,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconPlus,
  IconSearch,
  IconEdit,
  IconTrash,
  IconEye,
  IconArrowsSort,
  IconRestore,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  listProducts,
  getSummary,
  deleteProduct,
  listProductIds,
  productsStockCheck,
  bulkDeleteProducts,
  bulkUpdateProducts,
} from '../api/products.js';
import { useReference } from '../hooks/useReference.js';
import { formatMoney, formatNumber } from '../lib/format.js';
import { productImage, productCategoryName, productBrandName, refName } from '../lib/display.js';
import ProductFormModal from '../components/ProductFormModal.jsx';
import AddProductModal from '../components/AddProductModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const PAGE_SIZE = 15;

function SummaryCard({ label, value, color, icon, onClick, active, description }) {
  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      h="100%"
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : undefined,
        borderColor: active ? 'var(--mantine-color-red-6)' : undefined,
      }}
    >
      <Group gap={6} mb={4} align="baseline">
        {icon}
        <Text fz="1rem" c="dimmed" fw={600}>
          {label}
        </Text>
        {description ? (
          <Text size="xs" c="dimmed">
            ({description})
          </Text>
        ) : null}
      </Group>
      <Text fw={700} size="xl" c={color}>
        {value}
      </Text>
    </Paper>
  );
}

export default function Inventory() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { colorScheme } = useMantineColorScheme();
  const navigate = useNavigate();
  const { can } = useAuth();
  const showCost = can('see.cost');
  const canEdit = can('inventory.edit');
  const { categories, brands, reload: reloadRef } = useReference();

  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [category, setCategory] = useState(null);
  const [brand, setBrand] = useState(null);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minQty, setMinQty] = useState('');
  const [maxQty, setMaxQty] = useState('');
  const [inStock, setInStock] = useState(false);
  const [lowStock, setLowStock] = useState(false);
  const [sort, setSort] = useState('updated_at');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);

  const [data, setData] = useState({ items: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const [formOpened, formHandlers] = useDisclosure(false);
  const [editing, setEditing] = useState(null);
  const [prefillBarcode, setPrefillBarcode] = useState('');
  const [prefillName, setPrefillName] = useState('');
  const [addOpened, addHandlers] = useDisclosure(false);

  // Multi-select for bulk actions. `selected` holds product ids across pages.
  const [selected, setSelected] = useState(() => new Set());
  const [bulkDeleteOpened, bulkDeleteHandlers] = useDisclosure(false);
  const [bulkEditOpened, bulkEditHandlers] = useDisclosure(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkInStock, setBulkInStock] = useState({ inStock: 0, units: 0 });
  const [deleteOpened, deleteHandlers] = useDisclosure(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('__keep__');
  const [bulkBrand, setBulkBrand] = useState('__keep__');

  // The search box is the default focus: focused on load, and focus returns to
  // it whenever it drops to nothing (unless a modal is open). Keeps the page
  // ready for the next search/scan, scanner-first.
  const searchRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const refocusIfIdle = () => {
      // Defer so document.activeElement reflects where focus landed.
      setTimeout(() => {
        if (formOpened || addOpened) return;
        const active = document.activeElement;
        if (!active || active === document.body) {
          searchRef.current?.focus({ preventScroll: true });
        }
      }, 0);
    };
    document.addEventListener('focusout', refocusIfIdle);
    return () => document.removeEventListener('focusout', refocusIfIdle);
  }, [formOpened, addOpened]);

  // When a modal closes, Mantine restores focus to the trigger button rather
  // than the body, so the focusout handler above doesn't catch it. Explicitly
  // return focus to the search box once both modals are closed.
  const anyModalOpen = formOpened || addOpened;
  const prevModalOpen = useRef(anyModalOpen);
  useEffect(() => {
    if (prevModalOpen.current && !anyModalOpen) {
      // Defer past Mantine's own focus restoration on close.
      setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 0);
    }
    prevModalOpen.current = anyModalOpen;
  }, [anyModalOpen]);

  // Toggling theme or language moves focus to the header control (a button/select,
  // not the body), so the focusout guard above misses it. Pull focus back to the
  // search box whenever either changes — keeps the page scanner-ready.
  useEffect(() => {
    if (anyModalOpen) return;
    setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorScheme, lang]);

  const query = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      category: category || undefined,
      brand: brand || undefined,
      minPrice: minPrice !== '' ? minPrice : undefined,
      maxPrice: maxPrice !== '' ? maxPrice : undefined,
      minQty: minQty !== '' ? minQty : undefined,
      maxQty: maxQty !== '' ? maxQty : undefined,
      inStock: inStock ? 'true' : undefined,
      lowStock: lowStock ? 'true' : undefined,
      sort,
      order,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, category, brand, minPrice, maxPrice, minQty, maxQty, inStock, lowStock, sort, order, page],
  );

  const load = async () => {
    setLoading(true);
    try {
      const [list, sum] = await Promise.all([
        listProducts(query),
        getSummary(query),
      ]);
      setData(list);
      setSummary(sum);
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Reset to page 1 and clear any selection when filters/search change, so a
  // bulk action never touches products hidden by the current filters.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [debouncedSearch, category, brand, minPrice, maxPrice, minQty, maxQty, inStock, lowStock, sort, order]);

  const onSaved = () => {
    setEditing(null);
    reloadRef();
    load();
  };

  const handleDelete = (product) => {
    setDeleteTarget(product);
    deleteHandlers.open();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteProduct(deleteTarget.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      deleteHandlers.close();
      setDeleteTarget(null);
      load();
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setDeleteBusy(false);
    }
  };

  // --- Multi-select / bulk actions ---------------------------------------
  const pageIds = data.items.map((p) => p.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectPage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });

  const clearSelection = () => setSelected(new Set());

  // Select every product matching the current filters (across all pages).
  const selectAllMatching = async () => {
    try {
      const ids = await listProductIds(query);
      setSelected(new Set(ids));
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    }
  };

  // Open the bulk-delete confirm and check (across all pages) how many of the
  // selected products still hold stock, so we can warn before deleting.
  const openBulkDelete = async () => {
    setBulkInStock({ inStock: 0, units: 0 });
    bulkDeleteHandlers.open();
    try {
      setBulkInStock(await productsStockCheck([...selected]));
    } catch {
      // Non-fatal: if the check fails the modal still works, just without the warning.
    }
  };

  const handleBulkDelete = async () => {
    setBulkBusy(true);
    try {
      const { deleted } = await bulkDeleteProducts([...selected]);
      notifications.show({ message: t('inventory.bulk.deleted', { count: deleted }), color: 'green' });
      bulkDeleteHandlers.close();
      clearSelection();
      reloadRef();
      load();
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setBulkBusy(false);
    }
  };

  const openBulkEdit = () => {
    setBulkCategory('__keep__');
    setBulkBrand('__keep__');
    bulkEditHandlers.open();
  };

  const handleBulkEdit = async () => {
    const fields = {};
    if (bulkCategory !== '__keep__') fields.category_id = bulkCategory === '__clear__' ? null : Number(bulkCategory);
    if (bulkBrand !== '__keep__') fields.brand_id = bulkBrand === '__clear__' ? null : Number(bulkBrand);
    if (Object.keys(fields).length === 0) {
      bulkEditHandlers.close();
      return;
    }
    setBulkBusy(true);
    try {
      const { updated } = await bulkUpdateProducts([...selected], fields);
      notifications.show({ message: t('inventory.bulk.updated', { count: updated }), color: 'green' });
      bulkEditHandlers.close();
      clearSelection();
      reloadRef();
      load();
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setBulkBusy(false);
    }
  };

  // After interacting with a filter control, return focus to the search box so
  // the page stays ready for the next search/scan. Deferred so it runs after the
  // control finishes its own focus handling (e.g. a Select closing its dropdown).
  const refocusSearch = () => setTimeout(() => searchRef.current?.focus({ preventScroll: true }), 0);

  // Resets search, filters, and sorting back to defaults.
  const handleReset = () => {
    setSearch('');
    setCategory(null);
    setBrand(null);
    setMinPrice('');
    setMaxPrice('');
    setMinQty('');
    setMaxQty('');
    setInStock(false);
    setLowStock(false);
    setSort('updated_at');
    setOrder('desc');
    refocusSearch();
  };

  const openAdd = () => {
    setEditing(null);
    setPrefillBarcode('');
    setPrefillName('');
    addHandlers.open();
  };

  // From the add/restock modal: an unknown barcode or "create new" hands off to
  // the full product form, prefilled with whatever the user already entered.
  const handleCreateNew = ({ name = '', barcode = '' } = {}) => {
    addHandlers.close();
    setEditing(null);
    setPrefillBarcode(barcode);
    setPrefillName(name);
    formHandlers.open();
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const toOptions = (rows) => rows.map((r) => ({ value: String(r.id), label: refName(r, lang) }));

  const sortOptions = [
    { value: 'updated_at', label: t('inventory.columns.updatedAt') },
    { value: 'name', label: t('inventory.columns.name') },
    { value: 'quantity', label: t('inventory.columns.quantity') },
    { value: 'selling_price', label: t('inventory.columns.sellingPrice') },
    { value: 'buying_price', label: t('inventory.columns.buyingPrice') },
  ];

  const summaryCards = summary ? (
    <SimpleGrid cols={{ base: 1, xs: 2, lg: 1 }} spacing="xs" h="100%" style={{ gridAutoRows: '1fr' }}>
      <SummaryCard label={t('inventory.summary.totalUnits')} value={formatNumber(summary.total_units, lang)} />
      <SummaryCard
        label={t('inventory.summary.uniqueProducts')}
        value={formatNumber(summary.unique_products, lang)}
      />
      <SummaryCard
        label={t('inventory.summary.costValue')}
        value={formatMoney(summary.inventory_cost_value, lang, { noCents: true })}
        description={t('inventory.summary.costValueHint')}
      />
      <SummaryCard
        label={t('inventory.summary.lowStock')}
        value={formatNumber(summary.low_stock_count, lang)}
        color={summary.low_stock_count > 0 ? 'red' : undefined}
        icon={
          summary.low_stock_count > 0 ? (
            <IconAlertTriangle size={14} color="var(--mantine-color-red-6)" />
          ) : null
        }
        active={lowStock}
        onClick={() => {
          setLowStock((v) => !v);
          refocusSearch();
        }}
      />
    </SimpleGrid>
  ) : null;

  return (
    <Stack>
      <Title order={2}>{t('inventory.title')}</Title>

      <Grid gutter="md" align="stretch">
        {/* Filters: leading side (right in RTL) on wide screens, below the
            summary when stacked on small screens. */}
        <Grid.Col span={{ base: 12, lg: 8 }} order={{ base: 2, lg: 1 }}>
          <Paper withBorder p="md" radius="md" h="100%">
            <Stack gap="sm">
              <Group align="flex-end" wrap="nowrap">
                <TextInput
                  ref={searchRef}
                  style={{ flex: 1 }}
                  placeholder={t('inventory.searchPlaceholder')}
                  leftSection={<IconSearch size={16} />}
                  value={search}
                  onChange={(e) => setSearch(e.currentTarget.value)}
                />
                {canEdit && (
                  <Button leftSection={<IconPlus size={18} />} onClick={openAdd}>
                    {t('inventory.addModal.title')}
                  </Button>
                )}
              </Group>
              <Group grow align="flex-end">
                <Select
                  label={t('inventory.category')}
                  placeholder={t('common.all')}
                  data={toOptions(categories)}
                  value={category}
                  onChange={(v) => {
                    setCategory(v);
                    refocusSearch();
                  }}
                  clearable
                />
                <Select
                  label={t('inventory.brand')}
                  placeholder={t('common.all')}
                  data={toOptions(brands)}
                  value={brand}
                  onChange={(v) => {
                    setBrand(v);
                    refocusSearch();
                  }}
                  clearable
                />
              </Group>
              <SimpleGrid cols={2}>
                <NumberInput
                  label={t('inventory.minPrice')}
                  description={t('inventory.priceFilterNote')}
                  min={0}
                  value={minPrice}
                  onChange={setMinPrice}
                />
                <NumberInput
                  label={t('inventory.maxPrice')}
                  description={t('inventory.priceFilterNote')}
                  min={0}
                  value={maxPrice}
                  onChange={setMaxPrice}
                />
                <NumberInput
                  label={t('inventory.minQty')}
                  min={0}
                  value={minQty}
                  onChange={setMinQty}
                />
                <NumberInput
                  label={t('inventory.maxQty')}
                  min={0}
                  value={maxQty}
                  onChange={setMaxQty}
                />
              </SimpleGrid>
              <Group justify="space-between" align="flex-end">
                <Group align="flex-end">
                  <Select
                    label={t('inventory.sortBy')}
                    data={sortOptions}
                    value={sort}
                    onChange={(v) => {
                      if (v) setSort(v);
                      refocusSearch();
                    }}
                    allowDeselect={false}
                    w={200}
                  />
                  <Tooltip label={order === 'asc' ? t('inventory.sortAsc') : t('inventory.sortDesc')}>
                    <ActionIcon
                      variant="default"
                      size="lg"
                      onClick={() => {
                        setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
                        refocusSearch();
                      }}
                    >
                      <IconArrowsSort size={18} />
                    </ActionIcon>
                  </Tooltip>
                  <Switch
                    label={t('inventory.inStockOnly')}
                    checked={inStock}
                    onChange={(e) => {
                      setInStock(e.currentTarget.checked);
                      refocusSearch();
                    }}
                    pb={6}
                  />
                </Group>
                <Group align="flex-end" gap="md">
                  <Tooltip label={t('inventory.lowStockFilter')}>
                    <ActionIcon
                      variant={lowStock ? 'filled' : 'default'}
                      color="red"
                      size="lg"
                      onClick={() => {
                        setLowStock((v) => !v);
                        refocusSearch();
                      }}
                    >
                      <IconAlertTriangle size={18} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t('inventory.reset')}>
                    <ActionIcon variant="default" size="lg" onClick={handleReset}>
                      <IconRestore size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Stack>
          </Paper>
        </Grid.Col>

        {/* Summary: trailing side (left in RTL) on wide screens, on top when
            stacked on small screens. */}
        <Grid.Col span={{ base: 12, lg: 4 }} order={{ base: 1, lg: 2 }}>
          {summaryCards}
        </Grid.Col>
      </Grid>

      {someSelected && (
        <Paper withBorder radius="md" p="xs" bg="var(--mantine-color-indigo-light)">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Group gap="sm">
              <Text fw={600} size="sm">
                {t('inventory.bulk.selectedCount', { count: selected.size })}
              </Text>
              {selected.size < data.total && (
                <Button size="xs" variant="subtle" onClick={selectAllMatching}>
                  {t('inventory.bulk.selectAllMatching', { count: data.total })}
                </Button>
              )}
              <Button size="xs" variant="subtle" color="gray" onClick={clearSelection}>
                {t('inventory.bulk.clear')}
              </Button>
            </Group>
            <Group gap="xs">
              <Button size="xs" variant="default" leftSection={<IconEdit size={14} />} onClick={openBulkEdit}>
                {t('inventory.bulk.edit')}
              </Button>
              <Button
                size="xs"
                color="red"
                variant="light"
                leftSection={<IconTrash size={14} />}
                onClick={openBulkDelete}
              >
                {t('inventory.bulk.delete')}
              </Button>
            </Group>
          </Group>
        </Paper>
      )}

      <Paper withBorder radius="md" style={{ maxWidth: '100%', overflow: 'hidden' }}>
        <ScrollArea type="auto">
          <Table highlightOnHover verticalSpacing="sm" miw={800}>
            <Table.Thead style={{ whiteSpace: 'nowrap' }}>
              <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
                {canEdit && (
                  <Table.Th w={40}>
                    <Checkbox
                      aria-label={t('common.selectAll')}
                      checked={allPageSelected}
                      indeterminate={someSelected && !allPageSelected}
                      onChange={toggleSelectPage}
                    />
                  </Table.Th>
                )}
                <Table.Th />
                <Table.Th>{t('inventory.columns.name')}</Table.Th>
                <Table.Th>{t('inventory.columns.category')}</Table.Th>
                <Table.Th>{t('inventory.columns.brand')}</Table.Th>
                <Table.Th>{t('inventory.columns.quantity')}</Table.Th>
                <Table.Th>{t('inventory.columns.sellingPrice')}</Table.Th>
                <Table.Th>{t('inventory.columns.buyingPrice')}</Table.Th>
                <Table.Th>{t('common.actions')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.items.map((p) => {
                const open = () => navigate(`/inventory/${p.id}`);
                return (
                <Table.Tr
                  key={p.id}
                  style={{ cursor: 'pointer' }}
                  onClick={open}
                  bg={selected.has(p.id) ? 'var(--mantine-color-indigo-light)' : undefined}
                >
                  {canEdit && (
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={p.name}
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                      />
                    </Table.Td>
                  )}
                  <Table.Td>
                    <Image src={productImage(p)} w={40} h={40} radius="sm" fit="contain" />
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      <Text fw={500}>{p.name}</Text>
                      {p.is_temporary ? (
                        <Badge size="xs" color="orange" variant="light">
                          {t('product.temporary')}
                        </Badge>
                      ) : null}
                    </Group>
                  </Table.Td>
                  <Table.Td>{productCategoryName(p, lang) || '—'}</Table.Td>
                  <Table.Td>{productBrandName(p, lang) || '—'}</Table.Td>
                  <Table.Td>
                    <Text fw={700} size="md" c={p.quantity > 0 ? undefined : 'red'}>
                      {formatNumber(p.quantity, lang)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={700} size="md">
                      {formatMoney(p.selling_price, lang, { noCents: true })}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text fw={700} size="md" style={!showCost ? { filter: 'blur(4px)', userSelect: 'none' } : undefined}>
                      {formatMoney(p.buying_price, lang, { noCents: true })}
                    </Text>
                  </Table.Td>
                  {/* Action buttons stop propagation so they don't also trigger the row's open. */}
                  <Table.Td onClick={(e) => e.stopPropagation()}>
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon variant="subtle" onClick={() => navigate(`/inventory/${p.id}`)}>
                        <IconEye size={16} />
                      </ActionIcon>
                      {canEdit && (
                        <>
                          <ActionIcon
                            variant="subtle"
                            onClick={() => {
                              setEditing(p);
                              setPrefillBarcode('');
                              setPrefillName('');
                              formHandlers.open();
                            }}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(p)}>
                            <IconTrash size={16} />
                          </ActionIcon>
                        </>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
                );
              })}
              {!loading && data.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={9}>
                    <Center p="lg">
                      <Text c="dimmed">{t('common.noResults')}</Text>
                    </Center>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Group justify="space-between">
        <Text size="sm" c="dimmed">
          {formatNumber(data.total, lang)}
        </Text>
        <Pagination total={totalPages} value={page} onChange={setPage} />
      </Group>

      <AddProductModal
        opened={addOpened}
        onClose={addHandlers.close}
        onCreateNew={handleCreateNew}
        onRestocked={load}
      />

      <ProductFormModal
        opened={formOpened}
        onClose={formHandlers.close}
        product={editing}
        initialBarcode={prefillBarcode}
        initialName={prefillName}
        categories={categories}
        brands={brands}
        reloadReference={reloadRef}
        onSaved={onSaved}
      />

      <Modal
        opened={deleteOpened}
        onClose={deleteHandlers.close}
        title={t('inventory.deleteTitle')}
        centered
      >
        <Stack>
          <Text>{t('inventory.deleteConfirm')}</Text>
          {(deleteTarget?.quantity ?? 0) > 0 && (
            <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
              {t('inventory.bulk.hasStockWarning', {
                count: 1,
                units: formatNumber(deleteTarget.quantity, lang),
              })}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={deleteHandlers.close} disabled={deleteBusy}>
              {t('common.cancel')}
            </Button>
            <Button color="red" loading={deleteBusy} onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={bulkDeleteOpened}
        onClose={bulkDeleteHandlers.close}
        title={t('inventory.bulk.deleteTitle')}
        centered
      >
        <Stack>
          <Text>{t('inventory.bulk.deleteConfirm', { count: selected.size })}</Text>
          {bulkInStock.inStock > 0 && (
            <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
              {t('inventory.bulk.hasStockWarning', {
                count: bulkInStock.inStock,
                units: formatNumber(bulkInStock.units, lang),
              })}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={bulkDeleteHandlers.close} disabled={bulkBusy}>
              {t('common.cancel')}
            </Button>
            <Button color="red" loading={bulkBusy} onClick={handleBulkDelete}>
              {t('inventory.bulk.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={bulkEditOpened}
        onClose={bulkEditHandlers.close}
        title={t('inventory.bulk.editTitle')}
        centered
      >
        <Stack>
          <Text size="sm" c="dimmed">
            {t('inventory.bulk.selectedCount', { count: selected.size })} — {t('inventory.bulk.editHint')}
          </Text>
          <Select
            label={t('inventory.category')}
            value={bulkCategory}
            onChange={(v) => setBulkCategory(v ?? '__keep__')}
            allowDeselect={false}
            data={[
              { value: '__keep__', label: t('inventory.bulk.keepUnchanged') },
              { value: '__clear__', label: t('inventory.bulk.clear') },
              ...toOptions(categories),
            ]}
          />
          <Select
            label={t('inventory.brand')}
            value={bulkBrand}
            onChange={(v) => setBulkBrand(v ?? '__keep__')}
            allowDeselect={false}
            data={[
              { value: '__keep__', label: t('inventory.bulk.keepUnchanged') },
              { value: '__clear__', label: t('inventory.bulk.clear') },
              ...toOptions(brands),
            ]}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={bulkEditHandlers.close} disabled={bulkBusy}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={bulkBusy}
              disabled={bulkCategory === '__keep__' && bulkBrand === '__keep__'}
              onClick={handleBulkEdit}
            >
              {t('inventory.bulk.apply')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
