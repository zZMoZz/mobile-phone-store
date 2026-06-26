import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Stack,
  Group,
  Button,
  Card,
  Modal,
  NumberInput,
  Autocomplete,
  Textarea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconCoin } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { listTransactions, createTransaction } from '../api/transactions.js';
import { apiErrorMessage } from '../lib/apiError.js';

// Records an "expense": money out that isn't inventory (e.g. shop rent). Productless —
// just a label + amount + optional note. Sibling to ServiceRecorder; both are simple
// productless recorders shown above the items-based transaction form.
// `hideButton` renders only the modal; the parent triggers it via the imperative
// `open()` handle (used so an "expense" segment can sit inside the type toggle).
const ExpenseRecorder = forwardRef(function ExpenseRecorder({ hideButton = false, onClosed } = {}, ref) {
  const { t } = useTranslation();

  const [opened, { open, close }] = useDisclosure(false);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Past labels, offered as autocomplete suggestions for quick reuse.
  const [labelSuggestions, setLabelSuggestions] = useState([]);

  const loadSuggestions = () => {
    listTransactions({ type: 'expense', pageSize: 200 })
      .then((data) => {
        const labels = (data.items || [])
          .map((txn) => {
            try {
              return JSON.parse(txn.service_data || '{}').label || '';
            } catch {
              return '';
            }
          })
          .filter(Boolean);
        setLabelSuggestions([...new Set(labels)]);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadSuggestions();
  }, []);

  const openModal = () => {
    setLabel('');
    setAmount('');
    setNote('');
    open();
  };

  useImperativeHandle(ref, () => ({ open: openModal }), []);

  // Notify the parent whenever the modal closes (save, cancel, Escape, overlay)
  // so it can restore scanner focus.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !opened) onClosed?.();
    wasOpen.current = opened;
  }, [opened, onClosed]);

  const handleSave = async () => {
    const labelTrimmed = label.trim();
    if (!labelTrimmed) {
      notifications.show({ message: t('expense.labelRequired'), color: 'red' });
      return;
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      notifications.show({ message: t('expense.amountRequired'), color: 'red' });
      return;
    }

    setSaving(true);
    try {
      await createTransaction({
        type: 'expense',
        label: labelTrimmed,
        amount: amountNum,
        note: note.trim() || undefined,
      });
      notifications.show({ message: t('expense.recorded'), color: 'green' });
      close();
      setLabel('');
      setAmount('');
      setNote('');
      loadSuggestions();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {!hideButton && (
      <Group gap="sm" wrap="wrap">
        <Card
          withBorder
          radius="md"
          p={0}
          style={{ cursor: 'pointer', borderLeft: '4px solid var(--mantine-color-red-5)' }}
          onClick={openModal}
        >
          <Button
            variant="light"
            color="red"
            leftSection={<IconCoin size={16} />}
            styles={{ root: { pointerEvents: 'none' } }}
            size="sm"
          >
            {t('expense.record')}
          </Button>
        </Card>
      </Group>
      )}

      {/* returnFocus off: the parent refocuses the barcode scanner on close, so we
          must not restore focus to the segmented-control trigger and fight it. */}
      <Modal opened={opened} onClose={close} title={t('expense.recordTitle')} size="md" returnFocus={false}>
        <Stack gap="md">
          <Autocomplete
            label={t('expense.label')}
            placeholder={t('expense.labelPlaceholder')}
            data={labelSuggestions}
            value={label}
            onChange={setLabel}
            required
          />

          <NumberInput
            label={t('expense.amount')}
            required
            min={0}
            value={amount}
            onChange={setAmount}
          />

          <Textarea
            label={t('expense.note')}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
            autosize
            minRows={1}
          />

          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
});

export default ExpenseRecorder;
