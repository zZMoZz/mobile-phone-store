import { useEffect, useState, Fragment } from 'react';
import {
  Stack,
  Group,
  Button,
  Text,
  Card,
  Modal,
  NumberInput,
  Box,
  Paper,
  ScrollArea,
  Divider,
} from '@mantine/core';
import { useDisclosure, useElementSize } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { listServices } from '../api/services.js';
import { listServiceShortcuts } from '../api/serviceShortcuts.js';
import { listOptionLists } from '../api/optionLists.js';
import { createTransaction } from '../api/transactions.js';
import { ServiceFieldInput } from './ServiceFieldInputs.jsx';
import { apiErrorMessage } from '../lib/apiError.js';

// Fixed service-column width, the gap between shortcut cards, and the gutter
// around the divider line. COL_GUTTER is twice SHORTCUT_GAP so that, with the
// line at its midpoint, the whitespace from the line to the nearest shortcut
// equals the gap between shortcut cards (and the line stays centered).
const SERVICE_COL_W = 180;
const SHORTCUT_GAP = 12;
const COL_GUTTER = SHORTCUT_GAP * 2;

// Below this paper width, switch to the compact horizontal-headers layout.
const COMPACT_BREAKPOINT = 560;

export default function ServiceRecorder() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [services, setServices] = useState([]);
  const [shortcuts, setShortcuts] = useState([]);
  const [optionLists, setOptionLists] = useState([]);
  const [loading, setLoading] = useState(true);

  // Record modal state
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [activeService, setActiveService] = useState(null);
  const [activeShortcut, setActiveShortcut] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [cost, setCost] = useState('');
  const [profit, setProfit] = useState('');
  const [saving, setSaving] = useState(false);

  const { ref: paperRef, width: paperWidth } = useElementSize();
  const isCompact = paperWidth > 0 && paperWidth < COMPACT_BREAKPOINT;

  useEffect(() => {
    Promise.all([listServices(), listServiceShortcuts(), listOptionLists()])
      .then(([svcs, scs, opts]) => {
        setServices(svcs);
        setShortcuts(scs);
        setOptionLists(opts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openRecord = (service, shortcut) => {
    setActiveService(service);
    setActiveShortcut(shortcut || null);

    if (shortcut?.preset_values) {
      const { cost: presetCost, profit: presetProfit, ...fieldPresets } = shortcut.preset_values;
      setFieldValues(fieldPresets);
      setCost(presetCost != null ? presetCost : '');
      setProfit(presetProfit != null ? presetProfit : '');
    } else {
      setFieldValues({});
      setCost('');
      setProfit('');
    }

    openModal();
  };

  const handleFieldChange = (key, value) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!activeService) return;

    const missing = (activeService.fields || []).filter(
      (f) => f.required && (fieldValues[f.key] == null || fieldValues[f.key] === '')
    );
    if (missing.length > 0) {
      notifications.show({ message: t('services.fieldRequired'), color: 'red' });
      return;
    }

    const costNum = Number(cost);
    if (!costNum || costNum <= 0) {
      notifications.show({ message: t('services.costRequired'), color: 'red' });
      return;
    }

    setSaving(true);
    try {
      await createTransaction({
        type: 'service',
        service_id: activeService.id,
        shortcut_id: activeShortcut?.id,
        cost: costNum,
        profit: Number(profit) || 0,
        field_values: fieldValues,
      });
      notifications.show({ message: t('services.recorded'), color: 'green' });
      closeModal();
      setActiveService(null);
      setActiveShortcut(null);
      setFieldValues({});
      setCost('');
      setProfit('');
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const serviceName = (svc) => (lang === 'ar' ? svc.name_ar : svc.name_en);
  const shortcutLabel = (sc) => (lang === 'ar' ? sc.label_ar : sc.label_en);

  // Shared card renderers — variant="default" for service buttons gives a visible
  // gray fill in light mode (no more invisible white-on-white). Shortcut buttons
  // use variant="filled" when they have a color so they read clearly in light mode,
  // and variant="default" when they don't.
  const ServiceCard = ({ svc, fullWidth }) => (
    <Card
      withBorder
      radius="md"
      p={0}
      style={{ cursor: 'pointer', width: fullWidth ? '100%' : undefined }}
      onClick={() => openRecord(svc, null)}
    >
      <Button
        variant="default"
        styles={{ root: { pointerEvents: 'none', width: '100%' } }}
        size="sm"
      >
        {serviceName(svc)}
      </Button>
    </Card>
  );

  const ShortcutCard = ({ svc, sc, fullWidth }) => (
    <Card
      withBorder
      radius="md"
      p={0}
      style={{ cursor: 'pointer', width: fullWidth ? '100%' : undefined }}
      onClick={() => openRecord(svc, sc)}
    >
      <Button
        variant={sc.color ? 'filled' : 'default'}
        color={sc.color || undefined}
        styles={{ root: { pointerEvents: 'none', width: '100%' } }}
        size="sm"
      >
        {shortcutLabel(sc)}
      </Button>
    </Card>
  );

  if (!loading && services.length === 0) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        {t('common.noResults')}
      </Text>
    );
  }

  return (
    <>
      <Paper ref={paperRef} withBorder p="md" radius="md">
        {/* Show at most ~6 rows; scroll inside the box beyond that. A row is a
            36px button + 2px card border + 12px Stack gap ≈ 50px. */}
        <ScrollArea.Autosize mah={6 * 50} type="auto" offsetScrollbars>
          {isCompact ? (
            // Compact layout: services as a horizontal header row, shortcuts in columns below
            <Stack gap={0}>
              {/* Header row — one cell per service */}
              <Box style={{ display: 'flex', alignItems: 'stretch' }}>
                {services.map((svc, i) => (
                  <Fragment key={svc.id}>
                    {i > 0 && (
                      <Box
                        style={{
                          width: 1,
                          flexShrink: 0,
                          background: 'var(--mantine-color-default-border)',
                          margin: `0 ${SHORTCUT_GAP / 2}px`,
                        }}
                      />
                    )}
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <ServiceCard svc={svc} fullWidth />
                    </Box>
                  </Fragment>
                ))}
              </Box>

              <Divider my="sm" />

              {/* Shortcuts row — one column per service */}
              <Box style={{ display: 'flex', alignItems: 'flex-start' }}>
                {services.map((svc, i) => {
                  const svcShortcuts = shortcuts.filter((sc) => sc.service_id === svc.id);
                  return (
                    <Fragment key={svc.id}>
                      {i > 0 && (
                        <Box
                          style={{
                            width: 1,
                            flexShrink: 0,
                            alignSelf: 'stretch',
                            background: 'var(--mantine-color-default-border)',
                            margin: `0 ${SHORTCUT_GAP / 2}px`,
                          }}
                        />
                      )}
                      <Stack gap={SHORTCUT_GAP} style={{ flex: 1, minWidth: 0 }}>
                        {svcShortcuts.map((sc) => (
                          <ShortcutCard key={sc.id} svc={svc} sc={sc} fullWidth />
                        ))}
                      </Stack>
                    </Fragment>
                  );
                })}
              </Box>
            </Stack>
          ) : (
            // Normal layout: services in a fixed left column, shortcuts to the right
            <Stack gap="sm" pos="relative">
              {/* One continuous vertical line at the service/shortcuts boundary.
                  The 180px service column and the 16px row gutter are the single
                  source of truth (see SERVICE_COL_W / COL_GUTTER); the line sits at
                  their midpoint so the whitespace is identical on both sides.
                  insetInlineStart (not left) keeps it on the correct side in RTL. */}
              <Box
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  insetInlineStart: SERVICE_COL_W + COL_GUTTER / 2,
                  width: 1,
                  background: 'var(--mantine-color-default-border)',
                }}
              />
              {services.map((svc) => {
                const svcShortcuts = shortcuts.filter((sc) => sc.service_id === svc.id);
                return (
                  <Group key={svc.id} gap={COL_GUTTER} wrap="nowrap" align="flex-start">
                    {/* Fixed-width service column so the line stays aligned across rows */}
                    <Box style={{ width: SERVICE_COL_W, flexShrink: 0, display: 'flex' }}>
                      <ServiceCard svc={svc} fullWidth />
                    </Box>

                    {/* Shortcuts column */}
                    <Group gap={SHORTCUT_GAP} wrap="wrap" style={{ flex: 1 }}>
                      {svcShortcuts.map((sc) => (
                        <ShortcutCard key={sc.id} svc={svc} sc={sc} />
                      ))}
                    </Group>
                  </Group>
                );
              })}
            </Stack>
          )}
        </ScrollArea.Autosize>
      </Paper>

      {/* Record modal */}
      <Modal
        opened={modalOpened}
        onClose={closeModal}
        title={t('services.recordTitle')}
        size="md"
      >
        {activeService && (
          <Stack gap="md">
            <Box>
              <Text fw={600} size="md">
                {serviceName(activeService)}
              </Text>
              {activeShortcut && (
                <Text size="sm" c="dimmed">
                  {shortcutLabel(activeShortcut)}
                </Text>
              )}
            </Box>

            {(activeService.fields || []).map((field) => (
              <ServiceFieldInput
                key={field.key}
                field={field}
                value={fieldValues[field.key]}
                onChange={(val) => handleFieldChange(field.key, val)}
                optionLists={optionLists}
                lang={lang}
              />
            ))}

            <NumberInput
              label={activeService?.direction === 'out' ? t('services.costOut') : t('services.costIn')}
              required
              min={0}
              value={cost}
              onChange={setCost}
            />

            <NumberInput
              label={t('services.profit')}
              min={0}
              value={profit}
              onChange={setProfit}
            />

            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={closeModal}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} loading={saving}>
                {t('common.save')}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
