import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Title,
  Stack,
  Group,
  SegmentedControl,
  Paper,
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
  Pagination,
  Modal,
  ScrollArea,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus, IconDeviceFloppy, IconSearch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import ProductSearchInput from '../components/ProductSearchInput.jsx';
import { lookupByBarcode, searchProducts } from '../api/products.js';
import { listTransactions, getTransaction, createTransaction } from '../api/transactions.js';
import { formatMoney, formatDate, formatNumber } from '../lib/format.js';
import ServiceRecorder from '../components/ServiceRecorder.jsx';
import ExpenseRecorder from '../components/ExpenseRecorder.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const MAX_SHOWN = 2;

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
  const { can } = useAuth();
  const canSale = can('txn.sale');
  const canReturn = can('txn.return');
  const canExpense = can('txn.expense');
  const canService = can('txn.service');
  const { colorScheme } = useMantineColorScheme();
  const location = useLocation();
  const navigate = useNavigate();

  // --- New transaction form ---
  const [type, setType] = useState(() => loadDraft()?.type ?? (can('txn.sale') ? 'sale' : 'return'));
  const expenseRef = useRef(null);
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

  // Arriving from a product's "Sell" button: pre-add it to a sale (quantity 1),
  // appending to any in-progress draft. The ref guard keeps it one-shot even if
  // the effect runs twice (React StrictMode double-invokes effects in dev).
  const sellConsumed = useRef(false);
  useEffect(() => {
    const p = location.state?.addProduct;
    if (!p || sellConsumed.current) return;
    sellConsumed.current = true;
    setType('sale');
    setLinesByType((prev) => {
      const sale = prev.sale;
      const existing = sale.find((l) => l.product_id === p.id);
      const nextSale = existing
        ? sale.map((l) =>
            l.product_id === p.id ? { ...l, quantity: (Number(l.quantity) || 0) + 1 } : l,
          )
        : [
            ...sale,
            {
              key: nextKey(),
              product_id: p.id,
              name: p.name,
              barcode: p.barcode,
              quantity: 1,
              unit_price: p.selling_price,
              unit_cost: p.buying_price,
              stock: p.quantity,
              locked: true,
            },
          ];
      return { ...prev, sale: nextSale };
    });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const [searchResults, setSearchResults] = useState([]);
  const [pickerOpened, pickerHandlers] = useDisclosure(false);

  const [salePickerOpened, salePickerHandlers] = useDisclosure(false);
  const [salePickerData, setSalePickerData] = useState({ items: [], total: 0 });
  const [saleFrom, setSaleFrom] = useState('');
  const [saleTo, setSaleTo] = useState('');
  const [salePage, setSalePage] = useState(1);
  const [saleQuick, setSaleQuick] = useState(null);

  const barcodeRef = useRef(null);
  const anyModalOpen = pickerOpened || salePickerOpened;
  const anyModalOpenRef = useRef(anyModalOpen);
  anyModalOpenRef.current = anyModalOpen;

  useEffect(() => {
    barcodeRef.current?.focus({ preventScroll: true });
  }, []);

  // Refocus when focus drops to idle (Tab away, programmatic blur)
  useEffect(() => {
    const refocusIfIdle = () => {
      setTimeout(() => {
        if (anyModalOpenRef.current) return;
        const active = document.activeElement;
        if (!active || active === document.body) {
          barcodeRef.current?.focus({ preventScroll: true });
        }
      }, 0);
    };
    document.addEventListener('focusout', refocusIfIdle);
    return () => document.removeEventListener('focusout', refocusIfIdle);
  }, []);

  // Refocus when clicking any non-input element (buttons, theme toggle, language selector, etc.)
  useEffect(() => {
    const handleMouseDown = (e) => {
      if (anyModalOpenRef.current) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
      if (e.target.closest('[data-barcode-dropdown]')) return;
      setTimeout(() => barcodeRef.current?.focus({ preventScroll: true }), 0);
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, []);

  const prevModalOpen = useRef(anyModalOpen);
  useEffect(() => {
    if (prevModalOpen.current && !anyModalOpen) {
      setTimeout(() => barcodeRef.current?.focus({ preventScroll: true }), 0);
    }
    prevModalOpen.current = anyModalOpen;
  }, [anyModalOpen]);

  // Switching record mode (sale ↔ return) leaves focus on the segmented control;
  // pull it back to the scanner so wedge input keeps working.
  useEffect(() => {
    if (anyModalOpenRef.current) return;
    setTimeout(() => barcodeRef.current?.focus({ preventScroll: true }), 0);
  }, [type]);

  useEffect(() => {
    if (!salePickerOpened) return;
    listTransactions({
      type: 'sale',
      from: saleFrom || undefined,
      to: saleTo ? `${saleTo} 23:59:59` : undefined,
      page: salePage,
      pageSize: 10,
    }).then(setSalePickerData).catch(() => {});
  }, [salePickerOpened, saleFrom, saleTo, salePage]);

  useEffect(() => { setSalePage(1); }, [saleFrom, saleTo]);

  const loadFromSale = async (id) => {
    try {
      const txn = await getTransaction(id);
      const newLines = txn.items.map((item) => ({
        key: nextKey(),
        product_id: item.product_id || null,
        name: item.name_snapshot,
        barcode: item.barcode || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cost: item.unit_cost,
        stock: item.current_stock ?? null,
        locked: true,
      }));
      setLines(newLines);
      salePickerHandlers.close();
      notifications.show({ message: t('newTxn.saleLoaded'), color: 'green' });
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    }
  };

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
    });

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
    } catch (err) {
      notifications.show({ message: err.response?.data?.error || t('common.error'), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  // Recording modes the user is allowed to use (product-line recorder + expense modal).
  const lineTypeOptions = [
    canSale && { value: 'sale', label: t('txnType.sale') },
    canReturn && { value: 'return', label: t('txnType.return') },
    canExpense && { value: 'expense', label: t('txnType.expense') },
  ].filter(Boolean);

  return (
    <Stack>
      <Title order={2}>{t('newTxn.title')}</Title>

      {canService && <ServiceRecorder />}

      {canExpense && (
        <ExpenseRecorder
          ref={expenseRef}
          hideButton
          onClosed={() => {
            if (anyModalOpenRef.current) return;
            setTimeout(() => barcodeRef.current?.focus({ preventScroll: true }), 0);
          }}
        />
      )}

      {(canSale || canReturn) && (
      <Paper withBorder p="md" radius="md">
        <SegmentedControl
          fullWidth
          value={type}
          onChange={(v) => {
            if (v === 'expense') {
              expenseRef.current?.open();
              return;
            }
            setType(v);
          }}
          data={lineTypeOptions}
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
          {type === 'return' && (
            <Button variant="default" leftSection={<IconSearch size={16} />} onClick={salePickerHandlers.open}>
              {t('newTxn.loadFromSale')}
            </Button>
          )}
        </Group>

        <ScrollArea type="auto">
        <Table verticalSpacing="xs" miw={560}>
          <Table.Thead>
            <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'} style={{ whiteSpace: 'nowrap' }}>
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
                  {(l.product_id || l.locked) ? (
                    <Text fw={500}>{l.name}</Text>
                  ) : (
                    <Stack gap={4}>
                      <TextInput
                        placeholder={t('newTxn.newItemName')}
                        value={l.name}
                        onChange={(e) => updateLine(l.key, { name: e.currentTarget.value })}
                        size="xs"
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const row = e.currentTarget.closest('tr');
                        const inputs = Array.from(row?.querySelectorAll('input') || []);
                        const idx = inputs.indexOf(e.currentTarget);
                        if (idx !== -1 && inputs[idx + 1]) inputs[idx + 1].focus();
                      }
                    }}
                  />
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    min={0}
                    value={l.unit_price}
                    onChange={(v) => updateLine(l.key, { unit_price: v })}
                    hideControls
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        barcodeRef.current?.focus({ preventScroll: true });
                      }
                    }}
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
        </ScrollArea>

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
      )}

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

      {/* Sale-picker modal for returns */}
      <Modal opened={salePickerOpened} onClose={salePickerHandlers.close} title={t('newTxn.selectSale')} size="lg">
        <Stack mb="sm" gap="xs">
          <Group gap="xs" align="center">
            <Text size="xs" fw={500}>{t('txns.date')}</Text>
            <TextInput size="xs" type="date"
              value={saleFrom && saleFrom === saleTo ? saleFrom : ''}
              onChange={(e) => { const d = e.currentTarget.value; setSaleFrom(d); setSaleTo(d); setSaleQuick(null); }}
              w={140} />
            <Text size="xs" fw={500}>{t('txns.from')}</Text>
            <TextInput size="xs" type="date" value={saleFrom}
              onChange={(e) => { setSaleFrom(e.currentTarget.value); setSaleQuick(null); }} w={140} />
            <Text size="xs" fw={500}>{t('txns.to')}</Text>
            <TextInput size="xs" type="date" value={saleTo}
              onChange={(e) => { setSaleTo(e.currentTarget.value); setSaleQuick(null); }} w={140} />
          </Group>
          <Group gap="xs">
            {['today', 'week', 'month'].map((p) => (
              <Button key={p} size="xs"
                variant={saleQuick === p ? 'filled' : 'default'}
                onClick={() => {
                  const { from: f, to: tt } = quickRange(p);
                  setSaleFrom(f); setSaleTo(tt); setSaleQuick(p);
                }}>
                {t(`txns.quick${p.charAt(0).toUpperCase()}${p.slice(1)}`)}
              </Button>
            ))}
            <Button size="xs" variant="default"
              onClick={() => { setSaleFrom(''); setSaleTo(''); setSaleQuick(null); }}>
              {t('txns.clearFilters')}
            </Button>
          </Group>
        </Stack>

        <Table highlightOnHover verticalSpacing="xs" fz="sm">
          <Table.Thead>
            <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
              <Table.Th>{t('txns.date')}</Table.Th>
              <Table.Th>{t('txns.items')}</Table.Th>
              <Table.Th>{t('txns.total')}</Table.Th>
              <Table.Th>{t('txns.user')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {salePickerData.items.map((txn) => (
              <Table.Tr key={txn.id} style={{ cursor: 'pointer' }} onClick={() => loadFromSale(txn.id)}>
                <Table.Td>{formatDate(txn.created_at, lang)}</Table.Td>
                <Table.Td><Text size="xs" lineClamp={1}>{itemSummary(txn.items)}</Text></Table.Td>
                <Table.Td>{formatMoney(txn.total, lang)}</Table.Td>
                <Table.Td><Text size="xs" c="dimmed">{txn.username_snapshot || '—'}</Text></Table.Td>
              </Table.Tr>
            ))}
            {salePickerData.items.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Center p="md"><Text c="dimmed">{t('common.noResults')}</Text></Center>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>

        <Group justify="flex-end" mt="sm">
          <Pagination
            total={Math.max(1, Math.ceil(salePickerData.total / 10))}
            value={salePage}
            onChange={setSalePage}
            size="sm"
          />
        </Group>
      </Modal>
    </Stack>
  );
}
