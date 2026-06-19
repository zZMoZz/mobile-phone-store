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
  SegmentedControl,
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
import { listProducts, getSummary, deleteProduct } from '../api/products.js';
import { useReference } from '../hooks/useReference.js';
import { formatMoney, formatNumber, periodStart } from '../lib/format.js';
import { productImage, productCategoryName, productBrandName, refName } from '../lib/display.js';
import ProductFormModal from '../components/ProductFormModal.jsx';
import AddProductModal from '../components/AddProductModal.jsx';

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
        <Text size="sm" c="dimmed">
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
  const navigate = useNavigate();
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
  const [period, setPeriod] = useState('all');
  const [page, setPage] = useState(1);

  const [data, setData] = useState({ items: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);

  const [formOpened, formHandlers] = useDisclosure(false);
  const [editing, setEditing] = useState(null);
  const [prefillBarcode, setPrefillBarcode] = useState('');
  const [prefillName, setPrefillName] = useState('');
  const [addOpened, addHandlers] = useDisclosure(false);

  // The search box is the default focus: focused on load, and focus returns to
  // it whenever it drops to nothing (unless a modal is open). Keeps the page
  // ready for the next search/scan, scanner-first.
  const searchRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const refocusIfIdle = () => {
      // Defer so document.activeElement reflects where focus landed.
      setTimeout(() => {
        if (formOpened || addOpened) return;
        const active = document.activeElement;
        if (!active || active === document.body) {
          searchRef.current?.focus();
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
      setTimeout(() => searchRef.current?.focus(), 0);
    }
    prevModalOpen.current = anyModalOpen;
  }, [anyModalOpen]);

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
      from: periodStart(period),
      sort,
      order,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, category, brand, minPrice, maxPrice, minQty, maxQty, inStock, lowStock, period, sort, order, page],
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

  // Reset to page 1 when filters/search change.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, brand, minPrice, maxPrice, minQty, maxQty, inStock, lowStock, period, sort, order]);

  const onSaved = () => {
    setEditing(null);
    reloadRef();
    load();
  };

  const handleDelete = async (product) => {
    if (!window.confirm(t('inventory.deleteConfirm'))) return;
    try {
      await deleteProduct(product.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      load();
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    }
  };

  // After interacting with a filter control, return focus to the search box so
  // the page stays ready for the next search/scan. Deferred so it runs after the
  // control finishes its own focus handling (e.g. a Select closing its dropdown).
  const refocusSearch = () => setTimeout(() => searchRef.current?.focus(), 0);

  // Resets search, filters, sorting, and the added-period back to defaults.
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
    setPeriod('all');
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
    <SimpleGrid cols={{ base: 2, lg: 1 }} spacing="xs" h="100%" style={{ gridAutoRows: '1fr' }}>
      <SummaryCard label={t('inventory.summary.totalUnits')} value={formatNumber(summary.total_units, lang)} />
      <SummaryCard
        label={t('inventory.summary.uniqueProducts')}
        value={formatNumber(summary.unique_products, lang)}
      />
      <SummaryCard
        label={t('inventory.summary.costValue')}
        value={formatMoney(summary.inventory_cost_value, lang)}
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
                <Button leftSection={<IconPlus size={18} />} onClick={openAdd}>
                  {t('inventory.addModal.title')}
                </Button>
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
                  min={0}
                  value={minPrice}
                  onChange={setMinPrice}
                />
                <NumberInput
                  label={t('inventory.maxPrice')}
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
                  <Stack gap={4}>
                    <Text size="xs" c="dimmed">
                      {t('inventory.period.label')}
                    </Text>
                    <SegmentedControl
                      size="xs"
                      value={period}
                      onChange={(v) => {
                        setPeriod(v);
                        refocusSearch();
                      }}
                      data={[
                        { value: 'all', label: t('inventory.period.all') },
                        { value: 'today', label: t('inventory.period.today') },
                        { value: 'week', label: t('inventory.period.week') },
                        { value: 'month', label: t('inventory.period.month') },
                      ]}
                    />
                  </Stack>
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

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="sm" miw={800}>
            <Table.Thead
              style={{
                backgroundColor: 'var(--mantine-color-indigo-light)',
                color: 'var(--mantine-color-indigo-light-color)',
              }}
            >
              <Table.Tr>
                <Table.Th />
                <Table.Th>{t('inventory.columns.name')}</Table.Th>
                <Table.Th>{t('inventory.columns.category')}</Table.Th>
                <Table.Th>{t('inventory.columns.brand')}</Table.Th>
                <Table.Th>{t('inventory.columns.quantity')}</Table.Th>
                <Table.Th>{t('inventory.columns.sellingPrice')}</Table.Th>
                <Table.Th>{t('common.actions')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.items.map((p) => {
                const open = () => navigate(`/inventory/${p.id}`);
                return (
                <Table.Tr key={p.id} style={{ cursor: 'pointer' }}>
                  <Table.Td onClick={open}>
                    <Image src={productImage(p)} w={40} h={40} radius="sm" fit="contain" />
                  </Table.Td>
                  <Table.Td onClick={open}>
                    <Group gap={6}>
                      <Text fw={500}>{p.name}</Text>
                      {p.is_temporary ? (
                        <Badge size="xs" color="orange" variant="light">
                          {t('product.temporary')}
                        </Badge>
                      ) : null}
                    </Group>
                  </Table.Td>
                  <Table.Td onClick={open}>{productCategoryName(p, lang) || '—'}</Table.Td>
                  <Table.Td onClick={open}>{productBrandName(p, lang) || '—'}</Table.Td>
                  <Table.Td onClick={open}>
                    <Badge
                      color={p.quantity > 0 ? 'teal' : 'red'}
                      variant="light"
                      size="lg"
                      radius="sm"
                      px={6}
                      miw={28}
                    >
                      {formatNumber(p.quantity, lang)}
                    </Badge>
                  </Table.Td>
                  <Table.Td onClick={open}>
                    <Text fw={700} size="md">
                      {formatMoney(p.selling_price, lang)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon variant="subtle" onClick={() => navigate(`/inventory/${p.id}`)}>
                        <IconEye size={16} />
                      </ActionIcon>
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
                    </Group>
                  </Table.Td>
                </Table.Tr>
                );
              })}
              {!loading && data.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
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
    </Stack>
  );
}
