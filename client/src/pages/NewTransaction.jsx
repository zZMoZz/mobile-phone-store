import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Title,
  Stack,
  Group,
  SegmentedControl,
  Paper,
  Box,
  Table,
  NumberInput,
  TextInput,
  Button,
  ActionIcon,
  Text,
  Badge,
  Center,
  Divider,
  Textarea,
  Select,
  Pagination,
  Modal,
  ScrollArea,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus, IconDeviceFloppy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import ProductSearchInput from '../components/ProductSearchInput.jsx';
import { lookupByBarcode, searchProducts } from '../api/products.js';
import { listTransactions, getTransaction, createTransaction } from '../api/transactions.js';
import { listUsers } from '../api/users.js';
import { formatMoney, formatDate, formatNumber } from '../lib/format.js';
import ServiceRecorder from '../components/ServiceRecorder.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const PAGE_SIZE = 20;
const MAX_SHOWN = 2;
const typeColor = (type) => {
  if (type === 'sale') return 'blue';
  if (type === 'purchase') return 'teal';
  if (type === 'return') return 'orange';
  return 'grape';
};

const nextKey = () => `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const DRAFT_KEY = 'txn_draft';
function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)); } catch { return null; }
}

function itemSummary(items = []) {
  const names = items.map((i) => i.name_snapshot);
  if (names.length === 0) return '—';
  if (names.length <= MAX_SHOWN) return names.join(', ');
  return `${names.slice(0, MAX_SHOWN).join(', ')} +${names.length - MAX_SHOWN}`;
}

function quickRange(preset) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'week') {
    // Week starts on Saturday (getDay: 0=Sun, 6=Sat)
    const daysSinceSat = (now.getDay() + 1) % 7;
    const sat = new Date(now);
    sat.setDate(now.getDate() - daysSinceSat);
    return { from: sat.toISOString().slice(0, 10), to: today };
  }
  if (preset === 'month') {
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return { from: `${now.getFullYear()}-${m}-01`, to: today };
  }
  if (preset === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: today };
  }
  return { from: '', to: '' };
}

export default function NewTransaction() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { isAdmin } = useAuth();
  const { colorScheme } = useMantineColorScheme();

  // --- New transaction form ---
  const [type, setType] = useState(() => loadDraft()?.type ?? 'sale');
  const [linesByType, setLinesByType] = useState(() => {
    const draft = loadDraft();
    const restore = (arr) => (arr ?? []).map((l) => ({ ...l, key: nextKey() }));
    return {
      sale: restore(draft?.linesByType?.sale),
      purchase: restore(draft?.linesByType?.purchase),
      return: restore(draft?.linesByType?.return),
    };
  });
  const lines = linesByType[type];
  const setLines = (updater) =>
    setLinesByType((prev) => ({
      ...prev,
      [type]: typeof updater === 'function' ? updater(prev[type]) : updater,
    }));
  const [note, setNote] = useState(() => loadDraft()?.note ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ type, linesByType, note }));
  }, [type, linesByType, note]);

  // --- Transaction history ---
  const [filterType, setFilterType] = useState(null);
  const [filterUser, setFilterUser] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [quickPeriod, setQuickPeriod] = useState(null);
  const [page, setPage] = useState(1);
  const [historyData, setHistoryData] = useState({ items: [], total: 0 });
  const [refresh, setRefresh] = useState(0);
  const [users, setUsers] = useState([]);

  const [detail, setDetail] = useState(null);
  const [opened, handlers] = useDisclosure(false);

  const [searchResults, setSearchResults] = useState([]);
  const [pickerOpened, pickerHandlers] = useDisclosure(false);

  const barcodeRef = useRef(null);
  const anyModalOpen = opened || pickerOpened;
  const anyModalOpenRef = useRef(anyModalOpen);
  anyModalOpenRef.current = anyModalOpen;
  const detailPending = useRef(false);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  useEffect(() => {
    const refocusIfIdle = () => {
      setTimeout(() => {
        if (anyModalOpenRef.current || detailPending.current) return;
        const active = document.activeElement;
        if (!active || active === document.body) {
          barcodeRef.current?.focus();
        }
      }, 50);
    };
    document.addEventListener('focusout', refocusIfIdle);
    return () => document.removeEventListener('focusout', refocusIfIdle);
  }, []);

  const prevModalOpen = useRef(anyModalOpen);
  useEffect(() => {
    if (prevModalOpen.current && !anyModalOpen) {
      setTimeout(() => barcodeRef.current?.focus(), 0);
    }
    prevModalOpen.current = anyModalOpen;
  }, [anyModalOpen]);

  // Load users list for the username filter (admin only)
  useEffect(() => {
    if (isAdmin) {
      listUsers().then(setUsers).catch(() => {});
    }
  }, [isAdmin]);

  const historyQuery = useMemo(
    () => ({
      type: filterType || undefined,
      username: filterUser || undefined,
      from: from || undefined,
      to: to ? `${to} 23:59:59` : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [filterType, filterUser, from, to, page],
  );

  useEffect(() => {
    listTransactions(historyQuery).then(setHistoryData).catch(() => {});
  }, [historyQuery, refresh]);

  useEffect(() => {
    setPage(1);
  }, [filterType, filterUser, from, to]);

  const applyQuickPeriod = (preset) => {
    const { from: f, to: tt } = quickRange(preset);
    setFrom(f);
    setTo(tt);
    setQuickPeriod(preset);
  };

  const clearFilters = () => {
    setFilterType(null);
    setFilterUser(null);
    setFrom('');
    setTo('');
    setQuickPeriod(null);
  };

  const openDetail = async (id) => {
    try {
      const txn = await getTransaction(id);
      setDetail(txn);
      handlers.open();
    } finally {
      detailPending.current = false;
    }
  };

  const totalPages = Math.max(1, Math.ceil(historyData.total / PAGE_SIZE));

  // --- Form logic ---
  // purchase uses buying_price; sale and return both use selling_price
  const priceFor = (product) => (type === 'purchase' ? product.buying_price : product.selling_price);

  const addLine = (line) => setLines((prev) => [...prev, { key: nextKey(), ...line }]);

  const addProductLine = (product) => {
    const unitPrice = priceFor(product);
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product_id === product.id ? { ...l, quantity: (Number(l.quantity) || 0) + 1 } : l
        );
      }
      return [
        ...prev,
        {
          key: nextKey(),
          product_id: product.id,
          name: product.name,
          barcode: product.barcode,
          quantity: 1,
          unit_price: unitPrice,
          unit_cost: product.buying_price,
          stock: product.quantity,
          locked: true,
        },
      ];
    });
  };

  const handleScan = async (code) => {
    const byBarcode = await lookupByBarcode(code).catch(() => null);
    if (byBarcode) { addProductLine(byBarcode); return; }

    const results = await searchProducts(code).catch(() => []);
    if (results.length === 1) {
      addProductLine(results[0]);
    } else if (results.length > 1) {
      setSearchResults(results);
      pickerHandlers.open();
    } else {
      notifications.show({ message: t('newTxn.productNotFound'), color: 'red' });
    }
  };

  const addManualLine = () =>
    addLine({ product_id: null, name: '', barcode: null, quantity: 1, unit_price: 0, unit_cost: '', locked: false });

  const updateLine = (key, patch) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
    const cost = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);
    const total = subtotal;
    const profit = type === 'purchase' ? 0 : total - cost;
    return { subtotal, total, profit };
  }, [lines, type]);

  const canSubmit =
    !saving &&
    lines.length > 0 &&
    lines.every((l) => {
      if (!l.product_id && !(l.name && l.name.trim())) return false;
      if (!l.product_id && type === 'sale' && !(Number(l.unit_cost) > 0)) return false;
      if (type === 'sale' && l.stock != null && Number(l.quantity) > l.stock) return false;
      return true;
    }) &&
    (type !== 'return' || lines.every((l) => l.product_id != null));

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        type,
        note: note || undefined,
        items: lines.map((l) => ({
          product_id: l.product_id || undefined,
          barcode: l.barcode || undefined,
          name: l.name || undefined,
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.unit_price) || 0,
          unit_cost: Number(l.unit_cost) || 0,
        })),
      };
      await createTransaction(payload);
      notifications.show({ message: t('newTxn.recorded'), color: 'green' });
      setLines([]);
      setNote('');
      setPage(1);
      setRefresh((r) => r + 1);
    } catch (err) {
      notifications.show({ message: err.response?.data?.error || t('common.error'), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const headerBg = colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'var(--mantine-color-gray-1)';
  const headerBorder = colorScheme === 'dark' ? 'var(--mantine-color-dark-4)' : 'var(--mantine-color-gray-3)';

  const userSelectData = users.map((u) => ({
    value: u.username,
    label: u.display_name ? `${u.display_name} (${u.username})` : u.username,
  }));

  return (
    <Stack>
      <Title order={2}>{t('newTxn.title')}</Title>

      <ServiceRecorder />

      <Paper withBorder p="md" radius="md">
        <SegmentedControl
          fullWidth
          value={type}
          onChange={(v) => {
            setType(v);
          }}
          data={[
            { value: 'sale', label: t('txnType.sale') },
            { value: 'purchase', label: t('txnType.purchase') },
            { value: 'return', label: t('txnType.return') },
          ]}
        />

        <Divider my="md" />

        <Group align="flex-end" mb="sm">
          <ProductSearchInput
            ref={barcodeRef}
            onScan={handleScan}
            onProductSelect={addProductLine}
            placeholder={t('newTxn.scanToAdd')}
            style={{ flex: 1 }}
          />
          {type !== 'return' && (
            <Button variant="default" leftSection={<IconPlus size={16} />} onClick={addManualLine}>
              {t('newTxn.manualAdd')}
            </Button>
          )}
        </Group>

        <Table verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
              <Table.Th>{t('newTxn.item')}</Table.Th>
              <Table.Th w={110}>{t('newTxn.barcode')}</Table.Th>
              <Table.Th w={90}>{t('newTxn.inStock')}</Table.Th>
              <Table.Th w={70}>{t('newTxn.quantity')}</Table.Th>
              <Table.Th w={100}>{type === 'return' ? t('newTxn.refundPerUnit') : t('newTxn.unitPrice')}</Table.Th>
              {type === 'sale' && <Table.Th w={120}>{t('newTxn.unitProfit')}</Table.Th>}
              <Table.Th w={120}>{t('newTxn.lineTotal')}</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {lines.map((l) => (
              <Table.Tr key={l.key}>
                <Table.Td>
                  {l.product_id ? (
                    <Text fw={500}>{l.name}</Text>
                  ) : (
                    <Stack gap={4}>
                      <TextInput
                        placeholder={t('newTxn.newItemName')}
                        value={l.name}
                        onChange={(e) => updateLine(l.key, { name: e.currentTarget.value })}
                      />
                      <NumberInput
                        placeholder={t('newTxn.buyingPrice')}
                        value={l.unit_cost}
                        min={0}
                        onChange={(v) => updateLine(l.key, { unit_cost: v })}
                        hideControls
                        size="xs"
                      />
                    </Stack>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text size="sm" fw={700} c="dimmed">{l.barcode || '—'}</Text>
                </Table.Td>
                <Table.Td>
                  {l.stock != null ? (
                    <Text fw={700} c={type === 'sale' && Number(l.quantity) > l.stock ? 'red' : 'dimmed'}>
                      {formatNumber(l.stock, lang)}
                    </Text>
                  ) : (
                    <Text fw={700} c="dimmed">—</Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    min={1}
                    value={l.quantity}
                    onChange={(v) => updateLine(l.key, { quantity: v })}
                    hideControls
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    min={0}
                    value={l.unit_price}
                    onChange={(v) => updateLine(l.key, { unit_price: v })}
                    hideControls
                  />
                </Table.Td>
                {type === 'sale' && (
                  <Table.Td>
                    <Text fw={700} c={(Number(l.unit_price) - Number(l.unit_cost)) < 0 ? 'red' : 'green'}>
                      {formatMoney(Number(l.unit_price) - Number(l.unit_cost), lang)}
                    </Text>
                  </Table.Td>
                )}
                <Table.Td><Text fw={700}>{formatMoney((Number(l.quantity) || 0) * (Number(l.unit_price) || 0), lang)}</Text></Table.Td>
                <Table.Td>
                  <ActionIcon variant="subtle" color="red" onClick={() => removeLine(l.key)}>
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
            {lines.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={type === 'sale' ? 8 : 7}>
                  <Center p="md">
                    <Text c="dimmed">{t('newTxn.empty')}</Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>

        <Divider mb="md" />

        <Textarea label={t('newTxn.note')} value={note} onChange={(e) => setNote(e.currentTarget.value)} mb="md" autosize minRows={1} />
        <Divider mb="sm" />
        <Group justify="space-between">
          <Group gap="md">
            <Text fw={700}>
              {type === 'return' ? t('newTxn.refundTotal') : t('newTxn.total')}: {formatMoney(totals.total, lang)}
            </Text>
            {type === 'sale' && (
              <Text fw={700} c={totals.profit < 0 ? 'red' : 'green'}>
                {t('newTxn.profit')}: {formatMoney(totals.profit, lang)}
              </Text>
            )}
          </Group>
          <Button
            size="md"
            leftSection={<IconDeviceFloppy size={18} />}
            disabled={!canSubmit}
            loading={saving}
            onClick={submit}
          >
            {t('newTxn.record')}
          </Button>
        </Group>
      </Paper>

      {/* ── Transaction history ─────────────────────────────── */}
      <Divider mt="md" />
      <Paper withBorder radius="md" p={0}>
        {/* Header bar: title + quick period buttons */}
        <Box
          px="md"
          py="xs"
          style={{
            backgroundColor: headerBg,
            borderBottom: `1px solid ${headerBorder}`,
            borderRadius: 'var(--mantine-radius-md) var(--mantine-radius-md) 0 0',
          }}
        >
          <Group justify="space-between">
            <Text fw={700} size="sm">{t('txns.title')}</Text>
            <Group gap="xs">
              {['today', 'week', 'month', 'year'].map((preset) => (
                <Button
                  key={preset}
                  size="xs"
                  variant={quickPeriod === preset ? 'filled' : 'default'}
                  onClick={() => applyQuickPeriod(preset)}
                >
                  {t(`txns.quick${preset.charAt(0).toUpperCase()}${preset.slice(1)}`)}
                </Button>
              ))}
            </Group>
          </Group>
        </Box>

        {/* Filter row */}
        <Group px="md" py="xs" gap="sm" align="flex-end" wrap="wrap">
          <Select
            size="xs"
            label={t('txns.filterType')}
            placeholder={t('common.all')}
            data={[
              { value: 'sale', label: t('txnType.sale') },
              { value: 'purchase', label: t('txnType.purchase') },
              { value: 'service', label: t('txnType.service') },
              { value: 'return', label: t('txnType.return') },
            ]}
            value={filterType}
            onChange={setFilterType}
            clearable
            w={120}
          />
          {isAdmin && (
            <Select
              size="xs"
              label={t('txns.filterUser')}
              placeholder={t('common.all')}
              data={userSelectData}
              value={filterUser}
              onChange={setFilterUser}
              clearable
              searchable
              w={150}
            />
          )}
          <TextInput
            size="xs"
            label={t('txns.from')}
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.currentTarget.value); setQuickPeriod(null); }}
            w={140}
          />
          <TextInput
            size="xs"
            label={t('txns.to')}
            type="date"
            value={to}
            onChange={(e) => { setTo(e.currentTarget.value); setQuickPeriod(null); }}
            w={140}
          />
          <Button size="xs" variant="default" onClick={clearFilters} style={{ alignSelf: 'flex-end' }}>
            {t('txns.clearFilters')}
          </Button>
        </Group>

        {/* Table */}
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="xs" fz="xs" miw={760}>
            <Table.Thead style={{ backgroundColor: colorScheme === 'dark' ? 'var(--mantine-color-dark-5)' : 'var(--mantine-color-gray-2)' }}>
              <Table.Tr>
                <Table.Th>{t('txns.date')}</Table.Th>
                <Table.Th>{t('newTxn.type')}</Table.Th>
                <Table.Th>{t('txns.items')}</Table.Th>
                <Table.Th w={40}>{t('txns.itemCount')}</Table.Th>
                <Table.Th>{t('txns.total')}</Table.Th>
                <Table.Th>{t('txns.profit')}</Table.Th>
                <Table.Th>{t('txns.user')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {historyData.items.map((txn) => (
                <Table.Tr
                  key={txn.id}
                  style={{ cursor: 'pointer' }}
                  onMouseDown={() => { detailPending.current = true; }}
                  onClick={() => openDetail(txn.id)}
                >
                  <Table.Td>{formatDate(txn.created_at, lang)}</Table.Td>
                  <Table.Td>
                    <Badge size="sm" variant="light" color={typeColor(txn.type)}>
                      {t(`txnType.${txn.type}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" lineClamp={1}>{itemSummary(txn.items)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{formatNumber(txn.items?.length ?? 0, lang)}</Text>
                  </Table.Td>
                  <Table.Td>{formatMoney(txn.total, lang)}</Table.Td>
                  <Table.Td>
                    {(txn.type === 'purchase' || txn.type === 'return') ? '—' : formatMoney(txn.profit, lang)}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">{txn.username_snapshot || '—'}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
              {historyData.items.length === 0 && (
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

        {/* Pagination */}
        <Group justify="flex-end" px="md" py="sm">
          <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
        </Group>
      </Paper>

      {/* Product picker modal */}
      <Modal opened={pickerOpened} onClose={pickerHandlers.close} title={t('newTxn.selectProduct')} size="sm">
        <Stack gap="xs">
          {searchResults.map((p) => (
            <Button
              key={p.id}
              variant="default"
              justify="space-between"
              fullWidth
              rightSection={
                <Text size="xs" c="dimmed" fw={700}>
                  {t('newTxn.inStock')}: {formatNumber(p.quantity, lang)}
                </Text>
              }
              onClick={() => { addProductLine(p); pickerHandlers.close(); }}
            >
              {p.name}
            </Button>
          ))}
        </Stack>
      </Modal>

      {/* Transaction detail modal */}
      <Modal opened={opened} onClose={handlers.close} title={t('txns.details')} size="lg">
        {detail && (
          <Stack>
            <Group>
              <Badge variant="light" color={typeColor(detail.type)}>
                {t(`txnType.${detail.type}`)}
              </Badge>
              <Text c="dimmed">{formatDate(detail.created_at, lang)}</Text>
              {detail.username_snapshot && (
                <Text size="sm" c="dimmed">{detail.username_snapshot}</Text>
              )}
            </Group>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('newTxn.item')}</Table.Th>
                  <Table.Th>{t('newTxn.quantity')}</Table.Th>
                  <Table.Th>{t('newTxn.unitPrice')}</Table.Th>
                  <Table.Th>{t('newTxn.lineTotal')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {detail.items.map((it) => (
                  <Table.Tr key={it.id}>
                    <Table.Td>{it.name_snapshot}</Table.Td>
                    <Table.Td>{formatNumber(it.quantity, lang)}</Table.Td>
                    <Table.Td>{formatMoney(it.unit_price, lang)}</Table.Td>
                    <Table.Td>{formatMoney(it.line_total, lang)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Divider />
            <Group justify="space-between">
              <Stack gap={2}>
                {detail.type === 'service' && (
                  <Text size="sm" c="dimmed">
                    {t('newTxn.fee')}: {formatMoney(detail.fee, lang)}
                  </Text>
                )}
                <Text fw={700}>
                  {t('newTxn.total')}: {formatMoney(detail.total, lang)}
                </Text>
              </Stack>
              {detail.type !== 'purchase' && detail.type !== 'return' && (
                <Badge color="teal" variant="light" size="lg">
                  {t('newTxn.profit')}: {formatMoney(detail.profit, lang)}
                </Badge>
              )}
            </Group>
            {detail.note && <Text c="dimmed">{detail.note}</Text>}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
