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
  Pagination,
  Modal,
  ScrollArea,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { listTransactions, getTransaction } from '../api/transactions.js';
import { listUsers } from '../api/users.js';
import { listServices } from '../api/services.js';
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

  const [filterType, setFilterType] = useState(null);
  const [filterUser, setFilterUser] = useState(null);
  const [filterServiceId, setFilterServiceId] = useState(null);
  const [filterDirection, setFilterDirection] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [quickPeriod, setQuickPeriod] = useState(null);
  const [page, setPage] = useState(1);
  const [historyData, setHistoryData] = useState({ items: [], total: 0 });
  const [users, setUsers] = useState([]);
  const [servicesList, setServicesList] = useState([]);

  const [detail, setDetail] = useState(null);
  const [opened, handlers] = useDisclosure(false);
  const detailPending = useRef(false);

  useEffect(() => {
    if (canSeeOthers) {
      listUsers().then(setUsers).catch(() => {});
    }
  }, [canSeeOthers]);

  useEffect(() => {
    listServices().then(setServicesList).catch(() => {});
  }, []);

  // Reset service sub-filters when switching away from service type
  useEffect(() => {
    if (filterType !== 'service') {
      setFilterServiceId(null);
      setFilterDirection(null);
    }
  }, [filterType]);

  const historyQuery = useMemo(
    () => ({
      type: filterType || undefined,
      username: filterUser || undefined,
      service_id: filterServiceId || undefined,
      direction: filterDirection || undefined,
      from: from || undefined,
      to: to ? `${to} 23:59:59` : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [filterType, filterUser, filterServiceId, filterDirection, from, to, page],
  );

  useEffect(() => {
    listTransactions(historyQuery).then(setHistoryData).catch(() => {});
  }, [historyQuery]);

  useEffect(() => {
    setPage(1);
  }, [filterType, filterUser, filterServiceId, filterDirection, from, to]);

  const applyQuickPeriod = (preset) => {
    const { from: f, to: tt } = quickRange(preset);
    setFrom(f);
    setTo(tt);
    setQuickPeriod(preset);
  };

  const clearFilters = () => {
    setFilterType(null);
    setFilterUser(null);
    setFilterServiceId(null);
    setFilterDirection(null);
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

  const userSelectData = users.map((u) => ({
    value: u.username,
    label: u.display_name ? `${u.display_name} (${u.username})` : u.username,
  }));

  const serviceSelectData = servicesList.map((s) => ({
    value: String(s.id),
    label: lang === 'ar' ? s.name_ar : s.name_en,
  }));

  return (
    <Stack>
      <Title order={2}>{t('txns.title')}</Title>

      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
        <SummaryCard
          label={t('txns.statTotal')}
          value={formatMoney(historyData.sumTotal ?? 0, lang, { noCents: true })}
        />
        <SummaryCard
          label={t('txns.statProfit')}
          value={formatMoney(historyData.sumProfit ?? 0, lang, { noCents: true })}
          color={historyData.sumProfit > 0 ? 'green' : historyData.sumProfit < 0 ? 'red' : undefined}
        />
        <SummaryCard
          label={t('txns.statCost')}
          value={formatMoney((historyData.sumTotal ?? 0) - (historyData.sumProfit ?? 0), lang, { noCents: true })}
        />
      </SimpleGrid>

      {/* Filter card — independent, above the table */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="xs">
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
          <Group gap="sm" align="flex-end" wrap="wrap">
            <Select
              size="xs"
              label={t('txns.filterType')}
              placeholder={t('common.all')}
              data={[
                { value: 'sale', label: t('txnType.sale') },
                { value: 'purchase', label: t('txnType.purchase') },
                { value: 'service', label: t('txnType.service') },
                { value: 'return', label: t('txnType.return') },
                { value: 'expense', label: t('txnType.expense') },
              ]}
              value={filterType}
              onChange={setFilterType}
              clearable
              w={120}
            />
            {filterType === 'service' && (
              <>
                <Select
                  size="xs"
                  label={t('txns.filterService')}
                  placeholder={t('common.all')}
                  data={serviceSelectData}
                  value={filterServiceId}
                  onChange={setFilterServiceId}
                  clearable
                  searchable
                  w={180}
                />
                <Select
                  size="xs"
                  label={t('txns.filterDirection')}
                  placeholder={t('common.all')}
                  data={[
                    { value: 'in', label: t('txns.directionIn') },
                    { value: 'out', label: t('txns.directionOut') },
                  ]}
                  value={filterDirection}
                  onChange={setFilterDirection}
                  clearable
                  w={130}
                />
              </>
            )}
            {canSeeOthers && (
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
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p={0}>
        {/* Table */}
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="xs" fz={15} miw={800}>
            <Table.Thead>
              <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
                <Table.Th w={60}>{t('txns.txnId')}</Table.Th>
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
                    <Table.Td c="dimmed">{txn.id}</Table.Td>
                    <Table.Td>{formatDate(txn.created_at, lang)}</Table.Td>
                    <Table.Td>
                      <Badge size="lg" variant="light" color={typeColor(txn.type)}>
                        {t(`txnType.${txn.type}`)}
                      </Badge>
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
                    <Table.Td>{formatNumber(txn.items?.length ?? 0, lang)}</Table.Td>
                    <Table.Td>{formatMoney(txn.total, lang)}</Table.Td>
                    <Table.Td>
                      {(txn.type === 'purchase' || txn.type === 'return' || txn.type === 'expense') ? '—' : formatMoney(txn.profit, lang)}
                    </Table.Td>
                    <Table.Td c="dimmed">{txn.username_snapshot || '—'}</Table.Td>
                  </Table.Tr>
                );
              })}
              {historyData.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={8}>
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
            {detail.type === 'expense' ? (
              <Text fw={600}>{expenseLabel(detail) || '—'}</Text>
            ) : detail.type === 'service' ? (() => {
              const svc = parseServiceData(detail);
              const name = lang === 'ar'
                ? (svc?.service_name_ar || svc?.service_name)
                : svc?.service_name;
              const dir = svc?.direction;
              return (
                <Stack gap="xs">
                  <Group gap="sm">
                    <Text fw={600}>{name || '—'}</Text>
                    {dir && (
                      <Badge color={dir === 'in' ? 'green' : 'red'} variant="light">
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
                            <Table.Td>{f.value}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  )}
                </Stack>
              );
            })() : (
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
            )}
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
