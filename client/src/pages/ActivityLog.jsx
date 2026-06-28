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
import { listUserNames } from '../api/users.js';
import { formatDate } from '../lib/format.js';

const PAGE_SIZE = 50;

const ALL_ACTIONS = [
  'login', 'logout', 'change_password',
  'create_product', 'update_product', 'delete_product', 'bulk_delete_products', 'bulk_update_products',
  'record_transaction', 'void_transaction',
  'create_service', 'update_service', 'delete_service',
  'create_shortcut', 'update_shortcut', 'delete_shortcut',
  'create_category', 'update_category', 'delete_category',
  'create_brand', 'update_brand', 'delete_brand',
  'create_option_list', 'update_option_list', 'delete_option_list',
  'create_user', 'update_user',
  'update_settings', 'create_backup', 'export_products', 'export_transactions',
];

function actionColor(action) {
  if (action === 'login' || action === 'logout') return 'gray';
  if (action.startsWith('delete_')) return 'red';
  if (action.startsWith('update_')) return 'blue';
  return 'teal';
}

function formatDetail(detail, lang) {
  if (!detail) return '—';
  try {
    const obj = typeof detail === 'string' ? JSON.parse(detail) : detail;
    const ar = lang === 'ar';

    const KEY_LABELS = {
      name:                ar ? 'الاسم'                    : 'Name',
      type:                ar ? 'النوع'                    : 'Type',
      quantity:            ar ? 'الكمية'                   : 'Quantity',
      count:               ar ? 'العدد'                    : 'Count',
      fields:              ar ? 'الحقول'                   : 'Fields',
      username:            ar ? 'اسم المستخدم'             : 'Username',
      role:                ar ? 'الدور'                    : 'Role',
      status:              ar ? 'الحالة'                   : 'Status',
      password_reset:      ar ? 'إعادة تعيين كلمة المرور' : 'Password Reset',
      permissions_updated: ar ? 'تحديث الصلاحيات'         : 'Permissions Updated',
    };

    const TYPE_VALUES = {
      purchase: ar ? 'شراء'      : 'Purchase',
      sale:     ar ? 'بيع'       : 'Sale',
      service:  ar ? 'خدمة'      : 'Service',
      return:   ar ? 'مرتجع'     : 'Return',
      expense:  ar ? 'مصروفات'   : 'Expense',
      admin:    ar ? 'مسؤول'     : 'Admin',
      staff:    ar ? 'موظف'      : 'Staff',
      ACTIVE:   ar ? 'نشط'       : 'Active',
      DISABLED: ar ? 'معطل'      : 'Disabled',
      true:     ar ? 'نعم'       : 'Yes',
    };

    const parts = [];

    // Bilingual name pair → single translated label
    if ('name_en' in obj || 'name_ar' in obj) {
      const val = ar ? (obj.name_ar || obj.name_en) : (obj.name_en || obj.name_ar);
      parts.push(`${ar ? 'الاسم' : 'Name'}: ${val}`);
    }

    // Bilingual label pair (shortcuts) → single translated label
    if ('label_en' in obj || 'label_ar' in obj) {
      const val = ar ? (obj.label_ar || obj.label_en) : (obj.label_en || obj.label_ar);
      parts.push(`${ar ? 'التسمية' : 'Label'}: ${val}`);
    }

    for (const [k, v] of Object.entries(obj)) {
      if (k === 'name_en' || k === 'name_ar' || k === 'label_en' || k === 'label_ar') continue;
      const label = KEY_LABELS[k] ?? k;
      const value = Array.isArray(v) ? v.join(', ') : (TYPE_VALUES[String(v)] ?? v);
      parts.push(`${label}: ${value}`);
    }

    return parts.join('، ') || '—';
  } catch {
    return String(detail);
  }
}

export default function ActivityLog() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [action, setAction] = useState(null);
  const [userId, setUserId] = useState(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0 });
  const [users, setUsers] = useState([]);

  useEffect(() => {
    listUserNames().then(setUsers).catch(() => {});
  }, []);

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
          <Select
            label={t('activityLog.filterUser')}
            placeholder={t('activityLog.allUsers')}
            value={userId}
            onChange={(v) => { setUserId(v); setPage(1); }}
            data={users.map((u) => ({ value: String(u.id), label: u.username }))}
            clearable
            size="sm"
          />
        </Group>
      </Paper>

      <Paper withBorder radius="md">
        <ScrollArea>
          <Table highlightOnHover verticalSpacing="xs" miw={700} styles={{ th: { whiteSpace: 'nowrap' }, td: { whiteSpace: 'nowrap' } }}>
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
                    <Badge color={actionColor(log.action)} variant="light" fz={15} w="max-content">
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
                    <Text size="sm" c="dimmed">{formatDetail(log.detail, lang)}</Text>
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
