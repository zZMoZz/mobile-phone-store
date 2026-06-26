import { useEffect, useState } from 'react';
import {
  Title,
  Stack,
  Paper,
  Table,
  Group,
  Select,
  TextInput,
  Badge,
  Text,
  Center,
  Pagination,
  ScrollArea,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { listActivityLogs } from '../api/activityLogs.js';
import { listUsers } from '../api/users.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDate } from '../lib/format.js';

const PAGE_SIZE = 50;

const ALL_ACTIONS = [
  'login', 'logout',
  'create_product', 'update_product', 'delete_product', 'restock_product',
  'record_transaction',
  'create_service', 'update_service', 'delete_service',
  'create_service_type', 'update_service_type', 'delete_service_type',
  'create_shortcut', 'update_shortcut', 'delete_shortcut',
  'create_category', 'update_category', 'delete_category',
  'create_brand', 'update_brand', 'delete_brand',
  'create_option_list', 'update_option_list', 'delete_option_list',
  'create_user', 'update_user', 'delete_user',
  'update_settings', 'create_backup', 'export_products', 'export_transactions',
];

function actionColor(action) {
  if (action === 'login' || action === 'logout') return 'gray';
  if (action.startsWith('delete_')) return 'red';
  if (action.startsWith('update_')) return 'blue';
  return 'teal';
}

function formatDetail(detail) {
  if (!detail) return '—';
  try {
    const obj = typeof detail === 'string' ? JSON.parse(detail) : detail;
    return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(', ');
  } catch {
    return String(detail);
  }
}

export default function ActivityLog() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { can } = useAuth();
  const canSeeOthers = can('see.others_transactions');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState(null);
  const [userId, setUserId] = useState(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (canSeeOthers) {
      listUsers().then(setUsers).catch(() => {});
    }
  }, [canSeeOthers]);

  useEffect(() => {
    const params = { page, pageSize: PAGE_SIZE };
    if (from) params.from = from;
    if (to) params.to = to;
    if (action) params.action = action;
    if (userId) params.userId = userId;
    listActivityLogs(params).then(setData).catch(() => {});
  }, [from, to, action, userId, page]);

  const totalPages = Math.ceil(data.total / PAGE_SIZE) || 1;

  return (
    <Stack>
      <Title order={2}>{t('activityLog.title')}</Title>

      <Paper withBorder p="sm" radius="md">
        <Group gap="sm" wrap="wrap">
          <TextInput
            type="date"
            label={`${t('activityLog.date')} (from)`}
            value={from}
            onChange={(e) => { setFrom(e.currentTarget.value); setPage(1); }}
            size="sm"
          />
          <TextInput
            type="date"
            label={`${t('activityLog.date')} (to)`}
            value={to}
            onChange={(e) => { setTo(e.currentTarget.value); setPage(1); }}
            size="sm"
          />
          <Select
            label={t('activityLog.filterAction')}
            placeholder={t('activityLog.allActions')}
            value={action}
            onChange={(v) => { setAction(v); setPage(1); }}
            data={ALL_ACTIONS.map((a) => ({ value: a, label: t(`activityLog.actions.${a}`, { defaultValue: a }) }))}
            clearable
            searchable
            size="sm"
          />
          {canSeeOthers && (
            <Select
              label={t('activityLog.filterUser')}
              placeholder={t('activityLog.allUsers')}
              value={userId}
              onChange={(v) => { setUserId(v); setPage(1); }}
              data={users.map((u) => ({ value: String(u.id), label: u.username }))}
              clearable
              size="sm"
            />
          )}
        </Group>
      </Paper>

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('activityLog.date')}</Table.Th>
                <Table.Th>{t('activityLog.user')}</Table.Th>
                <Table.Th>{t('activityLog.action')}</Table.Th>
                <Table.Th>{t('activityLog.entity')}</Table.Th>
                <Table.Th>{t('activityLog.detail')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.items.map((log) => (
                <Table.Tr key={log.id}>
                  <Table.Td>
                    <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(log.created_at, lang)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={500}>{log.username}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={actionColor(log.action)} variant="light" size="sm">
                      {t(`activityLog.actions.${log.action}`, { defaultValue: log.action })}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {log.entity
                        ? `${log.entity}${log.entity_id ? ` #${log.entity_id}` : ''}`
                        : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">{formatDetail(log.detail)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
              {data.items.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
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

      {totalPages > 1 && (
        <Center>
          <Pagination total={totalPages} value={page} onChange={setPage} />
        </Center>
      )}
    </Stack>
  );
}
