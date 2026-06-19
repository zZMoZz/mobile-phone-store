import { useEffect, useMemo, useState } from 'react';
import {
  Title,
  Stack,
  Group,
  Paper,
  Table,
  Select,
  TextInput,
  Badge,
  Text,
  Pagination,
  Modal,
  Center,
  ScrollArea,
  Divider,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { listTransactions, getTransaction } from '../api/transactions.js';
import { formatMoney, formatDate, formatNumber } from '../lib/format.js';

const PAGE_SIZE = 20;

const typeColor = (type) => (type === 'sale' ? 'blue' : type === 'purchase' ? 'teal' : 'grape');

export default function Transactions() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [type, setType] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });

  const [detail, setDetail] = useState(null);
  const [opened, handlers] = useDisclosure(false);

  const query = useMemo(
    () => ({
      type: type || undefined,
      from: from || undefined,
      to: to ? `${to} 23:59:59` : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [type, from, to, page],
  );

  useEffect(() => {
    listTransactions(query).then(setData).catch(() => {});
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [type, from, to]);

  const openDetail = async (id) => {
    const txn = await getTransaction(id);
    setDetail(txn);
    handlers.open();
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <Stack>
      <Title order={2}>{t('txns.title')}</Title>

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
            value={type}
            onChange={setType}
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
              {data.items.map((txn) => (
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
              {data.items.length === 0 && (
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
