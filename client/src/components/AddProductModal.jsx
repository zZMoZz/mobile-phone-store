import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  TextInput,
  NumberInput,
  Button,
  Group,
  Stack,
  Text,
  Image,
  Paper,
  Badge,
  Loader,
  Center,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconSearch, IconArrowLeft } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { listProducts, lookupByBarcode, restock } from '../api/products.js';
import { productImage } from '../lib/display.js';
import { formatMoney, formatNumber } from '../lib/format.js';
import { apiErrorMessage } from '../lib/apiError.js';
import { useStickyFocus } from '../hooks/useStickyFocus.js';

// Unified "add product" flow. Step 1 (identify): scan a barcode or type a name —
// existing products surface in a live list; an unknown barcode (Enter) or the
// "create new" action hands off to ProductFormModal via onCreateNew. Step 2
// (restock): pick how many units to add to the matched product.
export default function AddProductModal({ opened, onClose, onCreateNew, onRestocked }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [step, setStep] = useState('identify');
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebouncedValue(query, 300);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(0);
  const [qtyError, setQtyError] = useState(null);
  const [saving, setSaving] = useState(false);

  const identifyRef = useRef(null);
  const qtyRef = useRef(null);
  const saveRef = useRef(null);

  // Keep the scan/search field focused in the identify step so a scanner always
  // works, even after clicking a non-interactive area inside the modal.
  useStickyFocus(identifyRef, opened && step === 'identify');

  // Reset to a clean identify step every time the modal opens.
  useEffect(() => {
    if (opened) {
      setStep('identify');
      setQuery('');
      setResults([]);
      setSelected(null);
      setQty(1);
      setQtyError(null);
    }
  }, [opened]);

  // Live search of existing products as the user types (name OR barcode).
  useEffect(() => {
    if (!opened || step !== 'identify') return;
    const term = debouncedQuery.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let active = true;
    setSearching(true);
    listProducts({ search: term, pageSize: 8, sort: 'name', order: 'asc' })
      .then((data) => {
        if (active) setResults(data.items);
      })
      .catch(() => {
        if (active) setResults([]);
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [opened, step, debouncedQuery]);

  // Focus the Save button when entering the restock step, so a quick scan-then-
  // Enter confirms the default quantity without first tabbing through the fields.
  useEffect(() => {
    if (step === 'restock') {
      setTimeout(() => saveRef.current?.focus(), 0);
    }
  }, [step]);

  const startRestock = (product) => {
    setSelected(product);
    setQty(1);
    setQtyError(null);
    // Default the cost to the product's current buying price; the user changes it
    // only when this shipment cost differs. Backend blends it into a weighted average.
    setCost(product.buying_price ?? 0);
    setStep('restock');
  };

  // Enter = barcode scan: jump to restock if it matches, else create new.
  const handleIdentifyKeyDown = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const code = query.trim();
    if (!code) return;
    const found = await lookupByBarcode(code).catch(() => null);
    if (found) {
      startRestock(found);
    } else {
      onCreateNew({ barcode: code });
    }
  };

  const handleSave = async () => {
    const amount = Number(qty);
    if (!Number.isFinite(amount) || amount <= 0) {
      setQtyError(t('inventory.addModal.quantityRequired'));
      qtyRef.current?.focus();
      return;
    }
    setQtyError(null);
    setSaving(true);
    try {
      const updated = await restock(selected.id, amount, Number(cost) || undefined);
      notifications.show({
        message: `${t('inventory.stockAdded')}: ${updated.name} (${formatNumber(updated.quantity, lang)})`,
        color: 'green',
      });
      onRestocked?.();
      onClose();
    } catch (err) {
      notifications.show({
        message: apiErrorMessage(err, t),
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const title =
    step === 'restock' ? t('inventory.addModal.restockTitle') : t('inventory.addModal.title');

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg" returnFocus={false}>
      {step === 'identify' ? (
        <Stack gap="sm">
          <TextInput
            ref={identifyRef}
            data-autofocus
            placeholder={t('inventory.addModal.identifyPlaceholder')}
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={handleIdentifyKeyDown}
          />

          {searching ? (
            <Center py="md">
              <Loader size="sm" />
            </Center>
          ) : results.length > 0 ? (
            <Stack gap={4}>
              {results.map((p) => (
                <UnstyledButton key={p.id} onClick={() => startRestock(p)}>
                  <Paper withBorder p="xs" radius="md">
                    <Group wrap="nowrap" gap="sm">
                      <Image src={productImage(p)} w={36} h={36} radius="sm" fit="contain" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text fw={500} truncate>
                          {p.name}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {p.barcode || '—'} · {formatMoney(p.selling_price, lang)}
                        </Text>
                      </div>
                      <Badge color={p.quantity > 0 ? 'teal' : 'red'} variant="light">
                        {formatNumber(p.quantity, lang)}
                      </Badge>
                    </Group>
                  </Paper>
                </UnstyledButton>
              ))}
            </Stack>
          ) : query.trim() ? (
            <Text size="sm" c="dimmed" ta="center" py="sm">
              {t('common.noResults')}
            </Text>
          ) : null}
        </Stack>
      ) : (
        <Stack gap="md">
          <Paper withBorder p="sm" radius="md">
            <Group wrap="nowrap" gap="sm">
              <Image src={productImage(selected)} w={48} h={48} radius="sm" fit="contain" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} truncate>
                  {selected?.name}
                </Text>
                <Text size="sm" c="dimmed">
                  {t('inventory.addModal.currentStock')}:{' '}
                  {formatNumber(selected?.quantity ?? 0, lang)} · {formatMoney(selected?.selling_price, lang)}
                </Text>
              </div>
            </Group>
          </Paper>

          <NumberInput
            ref={qtyRef}
            label={t('inventory.addModal.quantityToAdd')}
            min={1}
            allowNegative={false}
            error={qtyError}
            value={qty}
            onChange={(v) => {
              setQty(v);
              if (qtyError) setQtyError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
          />

          <NumberInput
            label={t('inventory.addModal.costPerUnit')}
            description={t('inventory.addModal.costPerUnitHint')}
            min={0}
            allowNegative={false}
            value={cost}
            onChange={setCost}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
          />

          <Group justify="space-between">
            <Button
              variant="default"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => setStep('identify')}
            >
              {t('common.back')}
            </Button>
            <Button ref={saveRef} onClick={handleSave} loading={saving}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
