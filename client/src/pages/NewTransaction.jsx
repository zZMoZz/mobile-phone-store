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
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTrash, IconPlus, IconDeviceFloppy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import BarcodeInput from '../components/BarcodeInput.jsx';
import { lookupByBarcode } from '../api/products.js';
import { createTransaction } from '../api/transactions.js';
import { formatMoney } from '../lib/format.js';

let lineCounter = 0;
const nextKey = () => `line-${lineCounter++}`;

export default function NewTransaction() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();

  const [type, setType] = useState('sale');
  const [lines, setLines] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

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
      navigate('/transactions');
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
        ]}
      />

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
                    <NumberInput
                      min={0}
                      value={l.unit_cost}
                      onChange={(v) => updateLine(l.key, { unit_cost: v })}
                      hideControls
                    />
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
    </Stack>
  );
}
