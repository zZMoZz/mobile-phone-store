import { useEffect, useState } from 'react';
import {
  Title,
  Stack,
  Group,
  Button,
  Text,
  SimpleGrid,
  Card,
  Modal,
  NumberInput,
  Box,
  Divider,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { IconSettings } from '@tabler/icons-react';
import { listServices } from '../api/services.js';
import { listServiceShortcuts } from '../api/serviceShortcuts.js';
import { listOptionLists } from '../api/optionLists.js';
import { createTransaction } from '../api/transactions.js';
import { ServiceFieldInput } from '../components/ServiceFieldInputs.jsx';
import { apiErrorMessage } from '../lib/apiError.js';

export default function Services() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();

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
  const [saving, setSaving] = useState(false);

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

    // Pre-fill field values from shortcut preset_values (exclude cost)
    if (shortcut?.preset_values) {
      const { cost: presetCost, ...fieldPresets } = shortcut.preset_values;
      setFieldValues(fieldPresets);
      setCost(presetCost != null ? presetCost : '');
    } else {
      setFieldValues({});
      setCost('');
    }

    openModal();
  };

  const handleFieldChange = (key, value) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!activeService) return;

    // Validate required fields
    const missing = (activeService.fields || []).filter(
      (f) => f.required && (fieldValues[f.key] == null || fieldValues[f.key] === '')
    );
    if (missing.length > 0) {
      notifications.show({
        message: missing
          .map((f) => (lang === 'ar' ? f.label_ar : f.label_en))
          .join(', ') + ': ' + t('common.error'),
        color: 'red',
      });
      return;
    }

    const costNum = Number(cost);
    if (!costNum || costNum <= 0) {
      notifications.show({ message: t('services.cost') + ': ' + t('common.error'), color: 'red' });
      return;
    }

    setSaving(true);
    try {
      await createTransaction({
        type: 'service',
        service_id: activeService.id,
        shortcut_id: activeShortcut?.id,
        cost: costNum,
        field_values: fieldValues,
      });
      notifications.show({ message: t('services.recorded'), color: 'green' });
      closeModal();
      setActiveService(null);
      setActiveShortcut(null);
      setFieldValues({});
      setCost('');
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const serviceName = (svc) => (lang === 'ar' ? svc.name_ar : svc.name_en);
  const shortcutLabel = (sc) => (lang === 'ar' ? sc.label_ar : sc.label_en);

  return (
    <Stack gap="xl">
      <Group justify="space-between">
        <Title order={2}>{t('services.title')}</Title>
        <Button
          variant="default"
          leftSection={<IconSettings size={18} />}
          onClick={() => navigate('/services/manage')}
        >
          {t('services.manage')}
        </Button>
      </Group>

      {!loading && services.length === 0 && (
        <Text c="dimmed" ta="center" py="xl">
          {t('common.noResults')}
        </Text>
      )}

      {services.map((svc) => {
        const svcShortcuts = shortcuts.filter((sc) => sc.service_id === svc.id);

        return (
          <Box key={svc.id}>
            <Text fw={600} size="lg" mb="sm">
              {serviceName(svc)}
            </Text>
            <Divider mb="sm" />
            <SimpleGrid cols={{ base: 2, sm: 3, md: 4 }} spacing="sm">
              {svcShortcuts.map((sc) => (
                <Card
                  key={sc.id}
                  withBorder
                  radius="md"
                  padding="md"
                  style={{
                    cursor: 'pointer',
                    borderLeft: `4px solid var(--mantine-color-${sc.color || 'gray'}-5)`,
                    transition: 'box-shadow 0.15s',
                  }}
                  styles={{
                    root: {
                      '&:hover': { boxShadow: 'var(--mantine-shadow-sm)' },
                    },
                  }}
                  onClick={() => openRecord(svc, sc)}
                >
                  <Button
                    variant="light"
                    color={sc.color || 'gray'}
                    fullWidth
                    styles={{ root: { pointerEvents: 'none' } }}
                    size="sm"
                  >
                    {shortcutLabel(sc)}
                  </Button>
                </Card>
              ))}

              {/* "Record without shortcut" entry per service */}
              <Card
                withBorder
                radius="md"
                padding="md"
                style={{
                  cursor: 'pointer',
                  borderLeft: '4px solid var(--mantine-color-gray-4)',
                }}
                onClick={() => openRecord(svc, null)}
              >
                <Button
                  variant="subtle"
                  color="gray"
                  fullWidth
                  styles={{ root: { pointerEvents: 'none' } }}
                  size="sm"
                >
                  {t('services.recordWithoutShortcut')}
                </Button>
              </Card>
            </SimpleGrid>
          </Box>
        );
      })}

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
              label={t('services.cost')}
              required
              min={0}
              value={cost}
              onChange={setCost}
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
    </Stack>
  );
}
