import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Title,
  Stack,
  Group,
  SegmentedControl,
  SimpleGrid,
  Paper,
  Text,
  Badge,
  Table,
  Center,
  Loader,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { getAnalytics } from '../api/analytics.js';
import { formatMoney, formatNumber, periodStart } from '../lib/format.js';

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => {
    if (period === 'week') return { from: periodStart('week'), granularity: 'day' };
    if (period === 'month') return { from: periodStart('month'), granularity: 'day' };
    if (period === 'year') {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return { from: d.toISOString().slice(0, 19).replace('T', ' '), granularity: 'month' };
    }
    return { granularity: 'month' };
  }, [period]);

  useEffect(() => {
    setLoading(true);
    getAnalytics(params)
      .then(setData)
      .finally(() => setLoading(false));
  }, [params]);

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('dashboard.title')}</Title>
        <SegmentedControl
          value={period}
          onChange={setPeriod}
          data={[
            { value: 'week', label: t('dashboard.period.week') },
            { value: 'month', label: t('dashboard.period.month') },
            { value: 'year', label: t('dashboard.period.year') },
            { value: 'all', label: t('dashboard.period.all') },
          ]}
        />
      </Group>

      {loading || !data ? (
        <Center p="xl">
          <Loader />
        </Center>
      ) : (
        <>
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" mb="sm">
                <Text fw={600}>{t('dashboard.lowStock')}</Text>
                <Badge color="red" variant="light">
                  ≤ {data.lowStockThreshold}
                </Badge>
              </Group>
              {data.lowStock.length === 0 ? (
                <Text c="dimmed">{t('dashboard.lowStockEmpty')}</Text>
              ) : (
                <Table>
                  <Table.Tbody>
                    {data.lowStock.map((p) => (
                      <Table.Tr
                        key={p.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/inventory/${p.id}`)}
                      >
                        <Table.Td>{p.name}</Table.Td>
                        <Table.Td style={{ textAlign: 'end' }}>
                          <Badge color={p.quantity > 0 ? 'orange' : 'red'} variant="light" size="lg">
                            {formatNumber(p.quantity, lang)}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Text fw={600} mb="sm">
                {t('dashboard.topProducts')}
              </Text>
              {data.topProducts.length === 0 ? (
                <Text c="dimmed">{t('dashboard.noData')}</Text>
              ) : (
                <Table>
                  <Table.Tbody>
                    {data.topProducts.map((p, idx) => (
                      <Table.Tr key={idx}>
                        <Table.Td>{p.name}</Table.Td>
                        <Table.Td style={{ textAlign: 'end' }}>{formatNumber(p.qty, lang)}</Table.Td>
                        <Table.Td style={{ textAlign: 'end' }}>{formatMoney(p.revenue, lang)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Paper>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <Paper withBorder p="md" radius="md">
              <Text fw={600} mb="sm">
                {t('dashboard.topBuyingProducts')}
              </Text>
              {data.topBuyingProducts.length === 0 ? (
                <Text c="dimmed">{t('dashboard.noData')}</Text>
              ) : (
                <Table>
                  <Table.Tbody>
                    {data.topBuyingProducts.map((p, idx) => (
                      <Table.Tr key={idx}>
                        <Table.Td>{p.name}</Table.Td>
                        <Table.Td style={{ textAlign: 'end' }}>{formatNumber(p.qty, lang)}</Table.Td>
                        <Table.Td style={{ textAlign: 'end' }}>{formatMoney(p.total, lang)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Text fw={600} mb="sm">
                {t('dashboard.topReturningProducts')}
              </Text>
              {data.topReturningProducts.length === 0 ? (
                <Text c="dimmed">{t('dashboard.noData')}</Text>
              ) : (
                <Table>
                  <Table.Tbody>
                    {data.topReturningProducts.map((p, idx) => (
                      <Table.Tr key={idx}>
                        <Table.Td>{p.name}</Table.Td>
                        <Table.Td style={{ textAlign: 'end' }}>{formatNumber(p.qty, lang)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Paper>

            <Paper withBorder p="md" radius="md">
              <Text fw={600} mb="sm">
                {t('dashboard.topServices')}
              </Text>
              {data.topServices.length === 0 ? (
                <Text c="dimmed">{t('dashboard.noData')}</Text>
              ) : (
                <Table>
                  <Table.Tbody>
                    {data.topServices.map((s, idx) => (
                      <Table.Tr key={idx}>
                        <Table.Td>{lang === 'ar' ? s.name_ar : s.name_en}</Table.Td>
                        <Table.Td style={{ textAlign: 'end' }}>{formatNumber(s.count, lang)}</Table.Td>
                        <Table.Td style={{ textAlign: 'end' }}>{formatMoney(s.revenue, lang)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Paper>
          </SimpleGrid>
        </>
      )}
    </Stack>
  );
}
