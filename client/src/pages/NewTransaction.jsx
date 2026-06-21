import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Select,
  Pagination,
  Modal,
  ScrollArea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus, IconDeviceFloppy, IconSettings } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import BarcodeInput from '../components/BarcodeInput.jsx';
import { lookupByBarcode } from '../api/products.js';
import { listTransactions, getTransaction, createTransaction } from '../api/transactions.js';
import { formatMoney, formatDate, formatNumber } from '../lib/format.js';
import ServiceRecorder from '../components/ServiceRecorder.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const PAGE_SIZE = 20;
const typeColor = (type) => (type === 'sale' ? 'blue' : type === 'purchase' ? 'teal' : 'grape');

let lineCounter = 0;
const nextKey = () => `line-${lineCounter++}`;

export default function NewTransaction() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  // --- New transaction form ---
  const [type, setType] = useState('sale');
  const [lines, setLines] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // --- Transaction history ---
  const [filterType, setFilterType] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [historyData, setHistoryData] = useState({ items: [], total: 0 });
  const [refresh, setRefresh] = useState(0);

  const [detail, setDetail] = useState(null);
  const [opened, handlers] = useDisclosure(false);

  const historyQuery = useMemo(
    () => ({
      type: filterType || undefined,
      from: from || undefined,
      to: to ? `${to} 23:59:59` : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [filterType, from, to, page],
  );

  useEffect(() => {
    listTransactions(historyQuery).then(setHistoryData).catch(() => {});
  }, [historyQuery, refresh]);

  useEffect(() => {
    setPage(1);
  }, [filterType, from, to]);

  const openDetail = async (id) => {
    const txn = await getTransaction(id);
    setDetail(txn);
    handlers.open();
  };

  const totalPages = Math.max(1, Math.ceil(historyData.total / PAGE_SIZE));

  // --- Form logic ---
  const priceFor = (product) => (type === 'purchase' ? product.buying_price : product.selling_price);

  const addLine = (line) => setLines((prev) => [...prev, { key: nextKey(), ...line }]);

  const handleScan = async (code) => {
    const product = await lookupByBarcode(code).catch(() => null);
    if (product) {
      addLine({
        product_id: product.id,
        name: product.name,
        barcode: product.barcode,
        quantity: 1,
        unit_price: priceFor(product),
        unit_cost: product.buying_price,
        locked: true,
      });
    } else {
      addLine({
        product_id: null,
        name: '',
        barcode: code,
        quantity: 1,
        unit_price: 0,
        unit_cost: 0,
        locked: false,
      });
      notifications.show({ message: t('newTxn.notFoundQuickAdd'), color: 'yellow' });
    }
  };

  const addManualLine = () =>
    addLine({ product_id: null, name: '', barcode: null, quantity: 1, unit_price: 0, unit_cost: 0, locked: false });

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
    lines.every((l) => l.product_id || (l.name && l.name.trim()));

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

  return (
    <Stack>
      <Title order={2}>{t('newTxn.title')}</Title>

      <SegmentedControl
        value={type}
        onChange={(v) => {
          setType(v);
          setLines([]);
        }}
        data={[
          { value: 'sale', label: t('txnType.sale') },
          { value: 'purchase', label: t('txnType.purchase') },
          { value: 'service', label: t('txnType.service') },
        ]}
      />

      {type === 'service' ? (
        <>
          <Group justify="flex-end">
            <Button
              variant="default"
              size="xs"
              leftSection={<IconSettings size={16} />}
              onClick={() => navigate('/services/manage')}
            >
              {t('services.manage')}
            </Button>
          </Group>
          <ServiceRecorder />
        </>
      ) : (
        <>
          <Paper withBorder p="md" radius="md">
            <Group align="flex-end" mb="sm">
              <BarcodeInput
                onScan={handleScan}
                placeholder={t('newTxn.scanToAdd')}
                style={{ flex: 1 }}
              />
              <Button variant="default" leftSection={<IconPlus size={16} />} onClick={addManualLine}>
                {t('newTxn.manualAdd')}
              </Button>
            </Group>

            <Table verticalSpacing="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('newTxn.item')}</Table.Th>
                  <Table.Th w={90}>{t('newTxn.quantity')}</Table.Th>
                  <Table.Th w={130}>{t('newTxn.unitPrice')}</Table.Th>
                  {type !== 'purchase' && <Table.Th w={130}>{t('newTxn.unitCost')}</Table.Th>}
                  <Table.Th w={120}>{t('newTxn.lineTotal')}</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {lines.map((l) => (
                  <Table.Tr key={l.key}>
                    <Table.Td>
                      {l.product_id ? (
                        <Group gap={6}>
                          <Text fw={500}>{l.name}</Text>
                          {l.barcode ? (
                            <Text size="xs" c="dimmed">
                              {l.barcode}
                            </Text>
                          ) : null}
                        </Group>
                      ) : (
                        <TextInput
                          placeholder={t('newTxn.newItemName')}
                          value={l.name}
                          onChange={(e) => updateLine(l.key, { name: e.currentTarget.value })}
                        />
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
                    {type !== 'purchase' && (
                      <Table.Td>
                        {isAdmin ? (
                          <NumberInput
                            min={0}
                            value={l.unit_cost}
                            onChange={(v) => updateLine(l.key, { unit_cost: v })}
                            hideControls
                          />
                        ) : (
                          <Text style={{ filter: 'blur(4px)', userSelect: 'none' }}>
                            {formatMoney(l.unit_cost, lang)}
                          </Text>
                        )}
                      </Table.Td>
                    )}
                    <Table.Td>{formatMoney((Number(l.quantity) || 0) * (Number(l.unit_price) || 0), lang)}</Table.Td>
                    <Table.Td>
                      <ActionIcon variant="subtle" color="red" onClick={() => removeLine(l.key)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
                {lines.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={6}>
                      <Center p="md">
                        <Text c="dimmed">{t('newTxn.empty')}</Text>
                      </Center>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Textarea label={t('newTxn.note')} value={note} onChange={(e) => setNote(e.currentTarget.value)} mb="md" autosize minRows={1} />
            <Divider mb="sm" />
            <Group justify="space-between">
              <Stack gap={2}>
                <Text size="sm" c="dimmed">
                  {t('newTxn.subtotal')}: {formatMoney(totals.subtotal, lang)}
                </Text>
                <Text fw={700}>
                  {t('newTxn.total')}: {formatMoney(totals.total, lang)}
                </Text>
                {type !== 'purchase' && (
                  <Badge color="teal" variant="light">
                    {t('newTxn.profit')}: {formatMoney(totals.profit, lang)}
                  </Badge>
                )}
              </Stack>
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
        </>
      )}

      {/* Transaction history */}
      <Divider mt="md" />
      <Title order={3}>{t('txns.title')}</Title>

      <Paper withBorder p="md" radius="md">
        <Group grow align="flex-end">
          <Select
            label={t('txns.filterType')}
            placeholder={t('common.all')}
            data={[
              { value: 'sale', label: t('txnType.sale') },
              { value: 'purchase', label: t('txnType.purchase') },
              { value: 'service', label: t('txnType.service') },
            ]}
            value={filterType}
            onChange={setFilterType}
            clearable
          />
          <TextInput
            label={t('txns.from')}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.currentTarget.value)}
          />
          <TextInput
            label={t('txns.to')}
            type="date"
            value={to}
            onChange={(e) => setTo(e.currentTarget.value)}
          />
        </Group>
      </Paper>

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="sm" miw={700}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('txns.date')}</Table.Th>
                <Table.Th>{t('newTxn.type')}</Table.Th>
                <Table.Th>{t('txns.items')}</Table.Th>
                <Table.Th>{t('txns.total')}</Table.Th>
                <Table.Th>{t('txns.profit')}</Table.Th>
                <Table.Th>{t('txns.note')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {historyData.items.map((txn) => (
                <Table.Tr key={txn.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(txn.id)}>
                  <Table.Td>{formatDate(txn.created_at, lang)}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={typeColor(txn.type)}>
                      {t(`txnType.${txn.type}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{formatNumber(txn.items?.length ?? 0, lang)}</Table.Td>
                  <Table.Td>{formatMoney(txn.total, lang)}</Table.Td>
                  <Table.Td>
                    {txn.type === 'purchase' ? '—' : formatMoney(txn.profit, lang)}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed" lineClamp={1}>
                      {txn.note || ''}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
              {historyData.items.length === 0 && (
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
        </ScrollArea>
      </Paper>

      <Group justify="flex-end">
        <Pagination total={totalPages} value={page} onChange={setPage} />
      </Group>

      <Modal opened={opened} onClose={handlers.close} title={t('txns.details')} size="lg">
        {detail && (
          <Stack>
            <Group>
              <Badge variant="light" color={typeColor(detail.type)}>
                {t(`txnType.${detail.type}`)}
              </Badge>
              <Text c="dimmed">{formatDate(detail.created_at, lang)}</Text>
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
              {detail.type !== 'purchase' && (
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
