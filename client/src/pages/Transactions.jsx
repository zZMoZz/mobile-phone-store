import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Title,
  Stack,
  Group,
  Paper,
  SimpleGrid,
  Table,
  TextInput,
  Button,
  Text,
  Badge,
  Center,
  Divider,
  Select,
  MultiSelect,
  Pagination,
  Modal,
  ScrollArea,
  useMantineColorScheme,
  ActionIcon,
} from '@mantine/core';
import { IconBan } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { listTransactions, getTransaction, voidTransaction } from '../api/transactions.js';
import { listUsers } from '../api/users.js';
import { listServices } from '../api/services.js';
import { listOptionLists } from '../api/optionLists.js';
import { formatMoney, formatDate, formatNumber } from '../lib/format.js';
import { useAuth } from '../context/AuthContext.jsx';

const PAGE_SIZE = 20;
const MAX_SHOWN = 2;

function SummaryCard({ label, value, color }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text fz="1rem" c="dimmed" fw={600} mb={4}>{label}</Text>
      <Text fw={700} size="xl" c={color}>{value}</Text>
    </Paper>
  );
}

const typeColor = (type) => {
  if (type === 'sale') return 'blue';
  if (type === 'purchase') return 'teal';
  if (type === 'return') return 'orange';
  if (type === 'expense') return 'red';
  return 'grape';
};

function parseServiceData(txn) {
  const raw = txn.service_data;
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

function expenseLabel(txn) {
  return parseServiceData(txn)?.label || '';
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

export default function Transactions() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { can } = useAuth();
  const canSeeOthers = can('see.others_transactions');
  const { colorScheme } = useMantineColorScheme();

  const [filterTypes, setFilterTypes] = useState([]);
  const [filterUser, setFilterUser] = useState(null);
  const [filterServiceId, setFilterServiceId] = useState(null);
  const [filterDirection, setFilterDirection] = useState(null);
  const [filterProduct, setFilterProduct] = useState('');
  const [filterId, setFilterId] = useState('');
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [quickPeriod, setQuickPeriod] = useState(null);
  const [page, setPage] = useState(1);
  const [historyData, setHistoryData] = useState({ items: [], total: 0 });
  const [users, setUsers] = useState([]);
  const [servicesList, setServicesList] = useState([]);
  const [optionListsData, setOptionListsData] = useState([]);

  const [detail, setDetail] = useState(null);
  const [opened, handlers] = useDisclosure(false);
  const detailPending = useRef(false);

  const [voidTarget, setVoidTarget] = useState(null); // { id, type }
  const [voidOpened, { open: openVoid, close: closeVoid }] = useDisclosure(false);
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (canSeeOthers) {
      listUsers().then(setUsers).catch(() => {});
    }
  }, [canSeeOthers]);

  useEffect(() => {
    listServices().then(setServicesList).catch(() => {});
    listOptionLists().then(setOptionListsData).catch(() => {});
  }, []);

  const historyQuery = useMemo(
    () => ({
      types: filterTypes.length > 0 ? filterTypes.join(',') : undefined,
      username: filterUser || undefined,
      service_id: filterServiceId || undefined,
      direction: filterDirection || undefined,
      product: filterProduct || undefined,
      txn_id: filterId || undefined,
      sort: sortField,
      order: sortDir,
      from: from || undefined,
      to: to ? `${to} 23:59:59` : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [filterTypes, filterUser, filterServiceId, filterDirection, filterProduct, filterId, sortField, sortDir, from, to, page, refreshKey],
  );

  useEffect(() => {
    listTransactions(historyQuery).then(setHistoryData).catch(() => {});
  }, [historyQuery]);

  useEffect(() => {
    setPage(1);
  }, [filterTypes, filterUser, filterServiceId, filterDirection, filterProduct, filterId, sortField, sortDir, from, to]);

  const applyQuickPeriod = (preset) => {
    const { from: f, to: tt } = quickRange(preset);
    setFrom(f);
    setTo(tt);
    setQuickPeriod(preset);
  };

  const clearFilters = () => {
    setFilterTypes([]);
    setFilterUser(null);
    setFilterServiceId(null);
    setFilterDirection(null);
    setFilterProduct('');
    setFilterId('');
    setSortField('date');
    setSortDir('desc');
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

  const isVoidable = (txn) =>
    Date.now() - new Date(txn.created_at + 'Z').getTime() < 5 * 60 * 1000;

  const handleVoidClick = (e, txn) => {
    e.stopPropagation(); // prevent row click from opening detail modal
    setVoidTarget({ id: txn.id, type: txn.type });
    setVoidError(null);
    openVoid();
  };

  const handleVoidConfirm = async () => {
    if (!voidTarget) return;
    setVoidLoading(true);
    try {
      await voidTransaction(voidTarget.id);
      const removedId = voidTarget.id;
      closeVoid();
      setVoidTarget(null);
      // Optimistic removal — spec requirement
      setHistoryData((prev) => ({
        ...prev,
        items: prev.items.filter((t) => t.id !== removedId),
        total: Math.max(0, prev.total - 1),
      }));
      setRefreshKey((k) => k + 1); // background refetch
    } catch (err) {
      const code = err.response?.data?.code;
      const params = err.response?.data?.params;
      if (code === 'window_expired') {
        setVoidError(t('txns.void.errorExpired'));
      } else if (code === 'insufficient_stock_to_void') {
        setVoidError(t('txns.void.errorStock', { products: (params?.products ?? []).join(', ') }));
      } else {
        setVoidError(err.response?.data?.error || 'Error');
      }
    } finally {
      setVoidLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(historyData.total / PAGE_SIZE));

  const userSelectData = users.map((u) => ({
    value: u.username,
    label: u.display_name ? `${u.display_name} (${u.username})` : u.username,
  }));

  const serviceSelectData = servicesList.map((s) => ({
    value: String(s.id),
    label: lang === 'ar' ? s.name_ar : s.name_en,
  }));

  const typeSelectData = [
    { value: 'sale', label: t('txnType.sale') },
    { value: 'purchase', label: t('txnType.purchase') },
    { value: 'service', label: t('txnType.service') },
    { value: 'return', label: t('txnType.return') },
    { value: 'expense', label: t('txnType.expense') },
  ];

  const sortFieldData = [
    { value: 'date', label: t('txns.date') },
    { value: 'id', label: t('txns.txnId') },
    { value: 'count', label: t('txns.itemCount') },
    { value: 'total', label: t('txns.total') },
    { value: 'profit', label: t('txns.profit') },
  ];

  const mkCards = (total, profit) => (
    <Stack gap="xs">
      <SummaryCard label={t('txns.statTotal')} value={formatMoney(total, lang, { noCents: true })} />
      <SummaryCard
        label={t('txns.statProfit')}
        value={formatMoney(profit, lang, { noCents: true })}
        color={profit < 0 ? 'red' : undefined}
      />
      <SummaryCard label={t('txns.statCost')} value={formatMoney(total - profit, lang, { noCents: true })} />
    </Stack>
  );

  return (
    <Stack>
      <Title order={2}>{t('txns.title')}</Title>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed">{t('txns.sectionGeneral')}</Text>
          {mkCards(historyData.sumTotal ?? 0, historyData.sumProfit ?? 0)}
        </Stack>
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed">{t('txns.sectionServices')}</Text>
          {mkCards(historyData.sumTotalSvc ?? 0, historyData.sumProfitSvc ?? 0)}
        </Stack>
        <Stack gap="xs">
          <Text size="sm" fw={600} c="dimmed">{t('txns.sectionProducts')}</Text>
          {mkCards(historyData.sumTotalProd ?? 0, historyData.sumProfitProd ?? 0)}
        </Stack>
      </SimpleGrid>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          {/* Row 1: quick periods + date range */}
          <Group gap="xs" align="flex-end">
            {['today', 'week', 'month', 'year'].map((preset) => (
              <Button
                key={preset}
                size="sm"
                variant={quickPeriod === preset ? 'filled' : 'default'}
                onClick={() => applyQuickPeriod(preset)}
              >
                {t(`txns.quick${preset.charAt(0).toUpperCase()}${preset.slice(1)}`)}
              </Button>
            ))}
            <TextInput
              size="sm"
              label={t('txns.from')}
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.currentTarget.value); setQuickPeriod(null); }}
              style={{ flex: 1 }}
            />
            <TextInput
              size="sm"
              label={t('txns.to')}
              type="date"
              value={to}
              onChange={(e) => { setTo(e.currentTarget.value); setQuickPeriod(null); }}
              style={{ flex: 1 }}
            />
          </Group>

          {/* Row 2: Type, User, Txn#, Product */}
          <SimpleGrid cols={{ base: 2, sm: canSeeOthers ? 4 : 3 }}>
            <MultiSelect
              size="sm"
              label={t('txns.filterType')}
              placeholder={t('common.all')}
              data={typeSelectData}
              value={filterTypes}
              onChange={setFilterTypes}
              clearable
            />
            {canSeeOthers && (
              <Select
                size="sm"
                label={t('txns.filterUser')}
                placeholder={t('common.all')}
                data={userSelectData}
                value={filterUser}
                onChange={setFilterUser}
                clearable
                searchable
              />
            )}
            <TextInput
              size="sm"
              label={t('txns.filterId')}
              placeholder="#"
              value={filterId}
              onChange={(e) => setFilterId(e.currentTarget.value.replace(/\D/g, ''))}
            />
            <TextInput
              size="sm"
              label={t('txns.filterProduct')}
              placeholder={t('common.search')}
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.currentTarget.value)}
            />
          </SimpleGrid>

          {/* Row 3: Service, Direction, Sort + direction toggle, Clear */}
          <SimpleGrid cols={{ base: 2, sm: 4 }}>
            <Select
              size="sm"
              label={t('txns.filterService')}
              placeholder={t('common.all')}
              data={serviceSelectData}
              value={filterServiceId}
              onChange={setFilterServiceId}
              clearable
              searchable
            />
            <Select
              size="sm"
              label={t('txns.filterDirection')}
              placeholder={t('common.all')}
              data={[
                { value: 'in', label: t('txns.directionIn') },
                { value: 'out', label: t('txns.directionOut') },
              ]}
              value={filterDirection}
              onChange={setFilterDirection}
              clearable
            />
            <Group gap="xs" align="flex-end">
              <Select
                size="sm"
                label={t('txns.sortBy')}
                data={sortFieldData}
                value={sortField}
                onChange={(v) => setSortField(v || 'date')}
                style={{ flex: 1 }}
              />
              <Button
                size="sm"
                variant="default"
                onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
              >
                {sortDir === 'desc' ? '↓' : '↑'}
              </Button>
            </Group>
            <Button
              size="sm"
              variant="default"
              onClick={clearFilters}
              style={{ alignSelf: 'flex-end', width: '100%' }}
            >
              {t('txns.clearFilters')}
            </Button>
          </SimpleGrid>
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p={0}>
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="xs" fz={15} miw={800}>
            <Table.Thead>
              <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
                <Table.Th w={60} style={{ whiteSpace: 'nowrap' }}>{t('txns.txnId')}</Table.Th>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>{t('txns.date')}</Table.Th>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>{t('newTxn.type')}</Table.Th>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>{t('txns.items')}</Table.Th>
                <Table.Th w={40} style={{ whiteSpace: 'nowrap' }}>{t('txns.itemCount')}</Table.Th>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>{t('txns.total')}</Table.Th>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>{t('txns.statCost')}</Table.Th>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>{t('txns.profit')}</Table.Th>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>{t('txns.user')}</Table.Th>
                <Table.Th style={{ whiteSpace: 'nowrap' }}>{t('txns.note')}</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {historyData.items.map((txn) => {
                const svc = txn.type === 'service' ? parseServiceData(txn) : null;
                const svcName = svc
                  ? (lang === 'ar' ? (svc.service_name_ar || svc.service_name) : svc.service_name) || '—'
                  : null;
                const svcDir = svc?.direction;
                return (
                  <Table.Tr
                    key={txn.id}
                    style={{ cursor: 'pointer' }}
                    onMouseDown={() => { detailPending.current = true; }}
                    onClick={() => openDetail(txn.id)}
                  >
                    <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap' }}>{txn.id}</Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDate(txn.created_at, lang)}</Table.Td>
                    <Table.Td>
                      <Text fw={600} c={typeColor(txn.type)} fz={15}>
                        {t(`txnType.${txn.type}`)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {txn.type === 'service' ? (
                        <Group gap={6} wrap="nowrap">
                          <Text lineClamp={1}>{svcName}</Text>
                          {svcDir && (
                            <Text c={svcDir === 'in' ? 'green' : 'red'} fw={500} style={{ whiteSpace: 'nowrap' }}>
                              {t(`txns.direction${svcDir === 'in' ? 'In' : 'Out'}`)}
                            </Text>
                          )}
                        </Group>
                      ) : (
                        <Text lineClamp={1}>
                          {txn.type === 'expense' ? (expenseLabel(txn) || '—') : itemSummary(txn.items)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td fz={17}>{formatNumber(txn.items?.reduce((s, i) => s + (i.quantity || 0), 0) ?? 0, lang)}</Table.Td>
                    <Table.Td fz={17} c={txn.type === 'return' || txn.type === 'purchase' || txn.type === 'expense' || txn.total < 0 ? 'red' : undefined} style={{ whiteSpace: 'nowrap' }}>
                      {formatMoney(txn.type === 'return' || txn.type === 'purchase' || txn.type === 'expense' ? -txn.total : txn.total, lang)}
                    </Table.Td>
                    <Table.Td fz={17} c={txn.type === 'purchase' || txn.cost_total < 0 ? 'red' : undefined} style={{ whiteSpace: 'nowrap' }}>
                      {txn.type === 'expense' || txn.type === 'return'
                        ? '—'
                        : formatMoney(txn.type === 'purchase' ? -txn.cost_total : txn.cost_total, lang)}
                    </Table.Td>
                    <Table.Td fz={17} style={{ whiteSpace: 'nowrap' }}>
                      {(txn.type === 'purchase' || txn.type === 'return' || txn.type === 'expense') ? '—' : formatMoney(txn.profit, lang)}
                    </Table.Td>
                    <Table.Td c="dimmed" style={{ whiteSpace: 'nowrap' }}>{txn.username_snapshot || '—'}</Table.Td>
                    <Table.Td c="dimmed">{txn.note || '—'}</Table.Td>
                    <Table.Td onClick={(e) => e.stopPropagation()}>
                      {can('txn.void') && isVoidable(txn) && (
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          size="sm"
                          title={t('txns.void.button')}
                          onClick={(e) => handleVoidClick(e, txn)}
                        >
                          <IconBan size={16} />
                        </ActionIcon>
                      )}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {historyData.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={11}>
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
        <Text size="sm" c="dimmed">{formatNumber(historyData.total, lang)}</Text>
        <Pagination total={totalPages} value={page} onChange={setPage} size="sm" />
      </Group>

      {/* Void confirmation modal */}
      <Modal
        opened={voidOpened}
        onClose={() => { closeVoid(); setVoidError(null); }}
        title={t('txns.void.confirmTitle', { type: voidTarget ? t(`txnType.${voidTarget.type}`) : '' })}
        size="sm"
      >
        <Stack gap="md">
          <Text>{t('txns.void.confirmBody')}</Text>
          {voidError && <Text c="red" size="sm">{voidError}</Text>}
          <Group justify="flex-end">
            <Button variant="default" onClick={closeVoid} disabled={voidLoading}>
              {t('common.cancel')}
            </Button>
            <Button color="red" onClick={handleVoidConfirm} loading={voidLoading}>
              {t('txns.void.confirmAction')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Transaction detail modal */}
      <Modal opened={opened} onClose={handlers.close} title={t('txns.details')} size="lg">
        {detail && (
          <Stack>
            <Group>
              <Text fw={600} c={typeColor(detail.type)} fz={17}>
                {t(`txnType.${detail.type}`)}
              </Text>
              <Text c="dimmed" fz={17}>{formatDate(detail.created_at, lang)}</Text>
              {detail.username_snapshot && (
                <Text fz={17} c="dimmed">{detail.username_snapshot}</Text>
              )}
            </Group>
            {detail.type === 'expense' ? (
              <Text fw={600}>{expenseLabel(detail) || '—'}</Text>
            ) : detail.type === 'service' ? (() => {
              const svc = parseServiceData(detail);
              const name = lang === 'ar'
                ? (svc?.service_name_ar || svc?.service_name)
                : svc?.service_name;
              const dir = svc?.direction;
              const svcDef = servicesList.find((s) => s.id === svc?.service_id);
              const resolveValue = (f) => {
                if (lang !== 'ar') return f.value;
                if (f.value_ar) return f.value_ar;
                const fieldDef = svcDef?.fields?.find((fd) => fd.label_en === f.label_en);
                if (!fieldDef) return f.value;
                if (fieldDef.options?.length) {
                  const opt = fieldDef.options.find((o) => o.name_en === f.value);
                  return opt?.name_ar || f.value;
                }
                if (fieldDef.option_list_id != null) {
                  const list = optionListsData.find((l) => l.id === fieldDef.option_list_id);
                  const opt = list?.options?.find((o) => o.name_en === f.value);
                  return opt?.name_ar || f.value;
                }
                return f.value;
              };
              return (
                <Stack gap="xs">
                  <Group gap="sm">
                    <Text fw={600}>{name || '—'}</Text>
                    {dir && (
                      <Badge color={dir === 'in' ? 'green' : 'red'} variant="light" fz={15}>
                        {t(`txns.direction${dir === 'in' ? 'In' : 'Out'}`)}
                      </Badge>
                    )}
                  </Group>
                  {svc?.fields?.length > 0 && (
                    <Table fz="sm">
                      <Table.Tbody>
                        {svc.fields.map((f, i) => (
                          <Table.Tr key={i}>
                            <Table.Td c="dimmed" w="40%">
                              {lang === 'ar' ? f.label_ar : f.label_en}
                            </Table.Td>
                            <Table.Td>{resolveValue(f)}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </Stack>
              );
            })() : detail.type === 'sale' ? (
              <Table>
                <Table.Thead>
                  <Table.Tr style={{ whiteSpace: 'nowrap' }}>
                    <Table.Th>{t('newTxn.item')}</Table.Th>
                    <Table.Th>{t('newTxn.barcode')}</Table.Th>
                    <Table.Th>{t('newTxn.quantity')}</Table.Th>
                    <Table.Th>{t('newTxn.unitPrice')}</Table.Th>
                    <Table.Th>{t('newTxn.unitCost')}</Table.Th>
                    <Table.Th>{t('newTxn.profit')}</Table.Th>
                    <Table.Th>{t('newTxn.lineTotal')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {detail.items.map((it) => (
                    <Table.Tr key={it.id}>
                      <Table.Td>{it.name_snapshot}</Table.Td>
                      <Table.Td c="dimmed">{it.barcode || '—'}</Table.Td>
                      <Table.Td>{formatNumber(it.quantity, lang)}</Table.Td>
                      <Table.Td>{formatMoney(it.unit_price, lang)}</Table.Td>
                      <Table.Td>{formatMoney(it.unit_cost, lang)}</Table.Td>
                      <Table.Td>{formatMoney((it.unit_price - it.unit_cost) * it.quantity, lang)}</Table.Td>
                      <Table.Td>{formatMoney(it.line_total, lang)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : detail.type === 'return' ? (
              <Table>
                <Table.Thead>
                  <Table.Tr style={{ whiteSpace: 'nowrap' }}>
                    <Table.Th>{t('newTxn.item')}</Table.Th>
                    <Table.Th>{t('newTxn.barcode')}</Table.Th>
                    <Table.Th>{t('newTxn.quantity')}</Table.Th>
                    <Table.Th>{t('newTxn.refundPerUnit')}</Table.Th>
                    <Table.Th>{t('inventory.columns.buyingPrice')}</Table.Th>
                    <Table.Th>{t('newTxn.refundTotal')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {detail.items.map((it) => (
                    <Table.Tr key={it.id}>
                      <Table.Td>{it.name_snapshot}</Table.Td>
                      <Table.Td c="dimmed">{it.barcode || '—'}</Table.Td>
                      <Table.Td>{formatNumber(it.quantity, lang)}</Table.Td>
                      <Table.Td>{formatMoney(it.unit_price, lang)}</Table.Td>
                      <Table.Td>{formatMoney(it.unit_cost, lang)}</Table.Td>
                      <Table.Td c="red">{formatMoney(it.line_total, lang)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr style={{ whiteSpace: 'nowrap' }}>
                    <Table.Th>{t('newTxn.item')}</Table.Th>
                    <Table.Th>{t('newTxn.barcode')}</Table.Th>
                    <Table.Th>{t('newTxn.quantity')}</Table.Th>
                    <Table.Th>{t('txns.unitBuyingPrice')}</Table.Th>
                    <Table.Th>{t('newTxn.lineTotal')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {detail.items.map((it) => (
                    <Table.Tr key={it.id}>
                      <Table.Td>{it.name_snapshot}</Table.Td>
                      <Table.Td c="dimmed">{it.barcode || '—'}</Table.Td>
                      <Table.Td>{formatNumber(it.quantity, lang)}</Table.Td>
                      <Table.Td>{formatMoney(it.unit_price, lang)}</Table.Td>
                      <Table.Td>{formatMoney(it.line_total, lang)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            <Divider />
            <Group justify="space-between">
              <Stack gap={2}>
                <Text fw={700} c={detail.type === 'return' ? 'red' : undefined}>
                  {detail.type === 'return' ? t('newTxn.refundTotal') : t('newTxn.total')}: {formatMoney(detail.total, lang)}
                </Text>
                {detail.type !== 'expense' && detail.type !== 'return' && detail.profit !== 0 && (
                  <Text size="sm" c={detail.cost_total < 0 ? 'red' : 'dimmed'}>
                    {t('txns.statCost')}: {formatMoney(detail.type === 'purchase' ? -detail.cost_total : detail.cost_total, lang)}
                  </Text>
                )}
              </Stack>
              {detail.type !== 'purchase' && detail.type !== 'return' && detail.type !== 'expense' && (
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
