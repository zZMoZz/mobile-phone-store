import { useEffect, useState } from 'react';
import {
  Title,
  Stack,
  Group,
  Button,
  Paper,
  Table,
  ActionIcon,
  Text,
  Modal,
  TextInput,
  Select,
  Switch,
  TagsInput,
  SegmentedControl,
  Center,
  Divider,
  ColorInput,
  NumberInput,
  Badge,
  ColorSwatch,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconEdit, IconTrash, IconArrowLeft, IconBolt } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { listServices, createService, updateService, deleteService } from '../api/services.js';
import { listOptionLists } from '../api/optionLists.js';
import { listServiceShortcuts, createServiceShortcut, updateServiceShortcut, deleteServiceShortcut } from '../api/serviceShortcuts.js';
import { apiErrorMessage } from '../lib/apiError.js';
import { ServiceFieldInput } from '../components/ServiceFieldInputs.jsx';

const BLANK_FIELD = () => ({
  _uid: crypto.randomUUID(),
  key: '',
  label_en: '',
  label_ar: '',
  type: 'text',
  required: false,
  // source: 'inline' | 'shared' — only used in the builder UI, not sent to backend
  _source: 'inline',
  option_list_id: null,
  options: [],
});

const COLOR_SWATCHES = [
  '#2196f3', '#4caf50', '#f44336', '#ff9800', '#9c27b0',
  '#00bcd4', '#795548', '#607d8b', '#e91e63', '#ffeb3b',
];

export default function ManageServices() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();

  const [services, setServices] = useState([]);
  const [optionLists, setOptionLists] = useState([]);
  const [editing, setEditing] = useState(null);
  const [opened, handlers] = useDisclosure(false);
  const [saving, setSaving] = useState(false);

  // Shortcuts modal state
  const [shortcutsService, setShortcutsService] = useState(null);
  const [shortcuts, setShortcuts] = useState([]);
  const [shortcutsOpened, shortcutsHandlers] = useDisclosure(false);
  const [shortcutsLoading, setShortcutsLoading] = useState(false);

  // Shortcut editor state (nested modal)
  const [editingShortcut, setEditingShortcut] = useState(null);
  const [shortcutEditorOpened, shortcutEditorHandlers] = useDisclosure(false);
  const [shortcutSaving, setShortcutSaving] = useState(false);
  const [presetValues, setPresetValues] = useState({});
  const [presetCost, setPresetCost] = useState('');

  const shortcutForm = useForm({
    initialValues: {
      label_en: '',
      label_ar: '',
      color: '',
    },
    validate: {
      label_en: (v) => (v.trim() ? null : t('lists.nameRequired')),
      label_ar: (v) => (v.trim() ? null : t('lists.nameRequired')),
    },
  });

  const form = useForm({
    initialValues: {
      name_en: '',
      name_ar: '',
      fields: [],
    },
    validate: {
      name_en: (v) => (v.trim() ? null : t('lists.nameRequired')),
      name_ar: (v) => (v.trim() ? null : t('lists.nameRequired')),
    },
  });

  const load = () => {
    listServices().then(setServices).catch(() => {});
    listOptionLists().then(setOptionLists).catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setEditing(null);
    form.setValues({ name_en: '', name_ar: '', fields: [] });
    handlers.open();
  };

  const openEdit = (svc) => {
    setEditing(svc);
    // Reconstruct _source for each field so the UI knows which toggle to show
    const fields = (svc.fields || []).map((f) => ({
      ...f,
      _uid: crypto.randomUUID(),
      _source: f.option_list_id != null ? 'shared' : 'inline',
      option_list_id: f.option_list_id ?? null,
      options: f.options ?? [],
    }));
    form.setValues({ name_en: svc.name_en, name_ar: svc.name_ar, fields });
    handlers.open();
  };

  const addField = () => {
    form.insertListItem('fields', BLANK_FIELD());
  };

  const removeField = (index) => {
    form.removeListItem('fields', index);
  };

  const setFieldProp = (index, prop, value) => {
    form.setFieldValue(`fields.${index}.${prop}`, value);
  };

  const submit = async (values) => {
    const invalidSelect = values.fields.find(
      (f) => f.type === 'select' && !f.option_list_id && (!f.options || f.options.length === 0)
    );
    if (invalidSelect) {
      notifications.show({ message: t('manageServices.selectNeedsOptions'), color: 'red' });
      return;
    }
    setSaving(true);
    try {
      // Normalize fields: strip _source and _uid, resolve option_list_id vs options
      const fields = values.fields.map(({ _source, _uid, ...f }) => {
        if (f.type !== 'select') {
          // Drop select-only props
          const { option_list_id, options, ...rest } = f;
          return rest;
        }
        if (_source === 'shared' && f.option_list_id != null) {
          const { options, ...rest } = f;
          return { ...rest, option_list_id: Number(f.option_list_id) };
        }
        // inline
        const { option_list_id, ...rest } = f;
        return { ...rest, options: f.options || [] };
      });

      const payload = { name_en: values.name_en, name_ar: values.name_ar, fields };

      if (editing) await updateService(editing.id, payload);
      else await createService(payload);

      notifications.show({ message: t('common.saved'), color: 'green' });
      handlers.close();
      load();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (svc) => {
    if (!window.confirm(t('manageServices.deleteConfirm'))) return;
    try {
      await deleteService(svc.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      load();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    }
  };

  // ── Shortcuts ──────────────────────────────────────────────────────────────

  const loadShortcuts = async (serviceId) => {
    setShortcutsLoading(true);
    try {
      const data = await listServiceShortcuts(serviceId);
      setShortcuts(data);
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setShortcutsLoading(false);
    }
  };

  const openShortcuts = (svc) => {
    setShortcutsService(svc);
    setShortcuts([]);
    shortcutsHandlers.open();
    loadShortcuts(svc.id);
  };

  const openNewShortcut = () => {
    setEditingShortcut(null);
    shortcutForm.setValues({ label_en: '', label_ar: '', color: '' });
    setPresetValues({});
    setPresetCost('');
    shortcutEditorHandlers.open();
  };

  const openEditShortcut = (sc) => {
    setEditingShortcut(sc);
    const { cost, ...fieldPresets } = sc.preset_values || {};
    shortcutForm.setValues({
      label_en: sc.label_en || '',
      label_ar: sc.label_ar || '',
      color: sc.color || '',
    });
    setPresetValues(fieldPresets);
    setPresetCost(cost != null ? cost : '');
    shortcutEditorHandlers.open();
  };

  const submitShortcut = async (values) => {
    setShortcutSaving(true);
    try {
      // Build preset_values: only include non-empty field values + cost if set
      const pv = {};
      for (const [key, val] of Object.entries(presetValues)) {
        if (val !== '' && val != null) pv[key] = val;
      }
      if (presetCost !== '' && presetCost != null && !Number.isNaN(Number(presetCost))) {
        pv.cost = Number(presetCost);
      }

      const payload = {
        service_id: shortcutsService.id,
        label_en: values.label_en,
        label_ar: values.label_ar,
        color: values.color || null,
        preset_values: pv,
      };

      if (editingShortcut) {
        await updateServiceShortcut(editingShortcut.id, payload);
      } else {
        await createServiceShortcut(payload);
      }

      notifications.show({ message: t('common.saved'), color: 'green' });
      shortcutEditorHandlers.close();
      loadShortcuts(shortcutsService.id);
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setShortcutSaving(false);
    }
  };

  const handleDeleteShortcut = async (sc) => {
    if (!window.confirm(t('manageServices.deleteShortcutConfirm'))) return;
    try {
      await deleteServiceShortcut(sc.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      loadShortcuts(shortcutsService.id);
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const localizedName = (svc) => (lang === 'ar' ? svc.name_ar : svc.name_en);

  const optionListData = optionLists.map((ol) => ({
    value: String(ol.id),
    label: lang === 'ar' ? ol.name_ar : ol.name_en,
  }));

  const typeData = [
    { value: 'text', label: t('manageServices.typeText') },
    { value: 'number', label: t('manageServices.typeNumber') },
    { value: 'select', label: t('manageServices.typeSelect') },
  ];

  const sourceData = [
    { value: 'shared', label: t('manageServices.sharedList') },
    { value: 'inline', label: t('manageServices.inlineOptions') },
  ];

  const serviceFields = shortcutsService ? (shortcutsService.fields || []) : [];

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('manageServices.title')}</Title>
        <Group>
          <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigate('/services')}>
            {t('manageServices.backToServices')}
          </Button>
          <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
            {t('manageServices.addService')}
          </Button>
        </Group>
      </Group>

      <Paper withBorder radius="md">
        <Table highlightOnHover verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('services.nameEn')}</Table.Th>
              <Table.Th>{t('services.nameAr')}</Table.Th>
              <Table.Th>{t('manageServices.fields')}</Table.Th>
              <Table.Th>{t('common.actions')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {services.map((svc) => (
              <Table.Tr key={svc.id}>
                <Table.Td>{svc.name_en}</Table.Td>
                <Table.Td>{svc.name_ar}</Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {(svc.fields || []).length} {t('manageServices.fieldCount')}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Button
                      variant="subtle"
                      size="xs"
                      leftSection={<IconBolt size={14} />}
                      onClick={() => openShortcuts(svc)}
                    >
                      {t('manageServices.shortcuts')}
                    </Button>
                    <ActionIcon variant="subtle" onClick={() => openEdit(svc)}>
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(svc)}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
            {services.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={4}>
                  <Center p="lg">
                    <Text c="dimmed">{t('common.noResults')}</Text>
                  </Center>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* ── Service edit modal ─────────────────────────────────────────────── */}
      <Modal
        opened={opened}
        onClose={handlers.close}
        title={editing ? t('manageServices.editService') : t('manageServices.newService')}
        size="xl"
      >
        <form onSubmit={form.onSubmit(submit)}>
          <TextInput
            label={t('services.nameEn')}
            required
            {...form.getInputProps('name_en')}
            mb="sm"
          />
          <TextInput
            label={t('services.nameAr')}
            required
            dir="auto"
            {...form.getInputProps('name_ar')}
            mb="md"
          />

          <Divider label={t('manageServices.fields')} labelPosition="left" mb="sm" />

          <Stack gap="sm" mb="sm">
            {form.values.fields.map((field, index) => (
              <Paper key={field._uid} withBorder p="sm" radius="sm">
                <Group align="flex-start" wrap="wrap" gap="sm">
                  <TextInput
                    label={t('manageServices.fieldKey')}
                    value={field.key}
                    onChange={(e) => setFieldProp(index, 'key', e.currentTarget.value)}
                    style={{ flex: '1 1 120px', minWidth: 100 }}
                  />
                  <TextInput
                    label={t('services.nameEn')}
                    value={field.label_en}
                    onChange={(e) => setFieldProp(index, 'label_en', e.currentTarget.value)}
                    style={{ flex: '1 1 140px', minWidth: 100 }}
                  />
                  <TextInput
                    label={t('services.nameAr')}
                    value={field.label_ar}
                    onChange={(e) => setFieldProp(index, 'label_ar', e.currentTarget.value)}
                    dir="auto"
                    style={{ flex: '1 1 140px', minWidth: 100 }}
                  />
                  <Select
                    label={t('manageServices.fieldType')}
                    data={typeData}
                    value={field.type}
                    onChange={(v) => setFieldProp(index, 'type', v)}
                    allowDeselect={false}
                    style={{ flex: '1 1 120px', minWidth: 100 }}
                  />
                  <Stack gap={4} justify="flex-end" style={{ paddingTop: 24 }}>
                    <Switch
                      label={t('manageServices.required')}
                      checked={field.required}
                      onChange={(e) => setFieldProp(index, 'required', e.currentTarget.checked)}
                    />
                  </Stack>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => removeField(index)}
                    style={{ alignSelf: 'flex-end', marginBottom: 2 }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>

                {field.type === 'select' && (
                  <Stack gap="xs" mt="sm">
                    <Text size="xs" c="dimmed" fw={500}>
                      {t('manageServices.optionSource')}
                    </Text>
                    <SegmentedControl
                      data={sourceData}
                      value={field._source}
                      onChange={(v) => {
                        setFieldProp(index, '_source', v);
                        // Clear the other source when switching
                        if (v === 'shared') {
                          setFieldProp(index, 'options', []);
                        } else {
                          setFieldProp(index, 'option_list_id', null);
                        }
                      }}
                      size="xs"
                    />
                    {field._source === 'shared' ? (
                      <Select
                        placeholder={t('manageServices.sharedList')}
                        data={optionListData}
                        value={field.option_list_id != null ? String(field.option_list_id) : null}
                        onChange={(v) =>
                          setFieldProp(index, 'option_list_id', v != null ? Number(v) : null)
                        }
                        clearable
                      />
                    ) : (
                      <TagsInput
                        placeholder={t('lists.optionsHint')}
                        description={t('lists.optionsHint')}
                        value={field.options || []}
                        onChange={(v) => setFieldProp(index, 'options', v)}
                      />
                    )}
                  </Stack>
                )}
              </Paper>
            ))}
          </Stack>

          <Button
            variant="light"
            size="xs"
            leftSection={<IconPlus size={14} />}
            onClick={addField}
            mb="md"
          >
            {t('manageServices.addField')}
          </Button>

          <Group justify="flex-end">
            <Button variant="default" onClick={handlers.close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {t('common.save')}
            </Button>
          </Group>
        </form>
      </Modal>

      {/* ── Shortcuts list modal ───────────────────────────────────────────── */}
      <Modal
        opened={shortcutsOpened}
        onClose={shortcutsHandlers.close}
        title={
          shortcutsService
            ? `${t('manageServices.shortcuts')} — ${localizedName(shortcutsService)}`
            : t('manageServices.shortcuts')
        }
        size="lg"
      >
        <Stack>
          <Group justify="flex-end">
            <Button
              size="xs"
              leftSection={<IconPlus size={14} />}
              onClick={openNewShortcut}
            >
              {t('manageServices.addShortcut')}
            </Button>
          </Group>

          {shortcutsLoading && (
            <Center p="md">
              <Text c="dimmed">{t('common.loading')}</Text>
            </Center>
          )}

          {!shortcutsLoading && shortcuts.length === 0 && (
            <Center p="md">
              <Text c="dimmed">{t('manageServices.noShortcuts')}</Text>
            </Center>
          )}

          {!shortcutsLoading && shortcuts.length > 0 && (
            <Stack gap="xs">
              {shortcuts.map((sc) => (
                <Paper key={sc.id} withBorder p="sm" radius="sm">
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      {sc.color && (
                        <ColorSwatch color={sc.color} size={18} />
                      )}
                      <div>
                        <Text size="sm" fw={500}>
                          {lang === 'ar' ? sc.label_ar : sc.label_en}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {lang === 'ar' ? sc.label_en : sc.label_ar}
                        </Text>
                      </div>
                      {sc.preset_values && Object.keys(sc.preset_values).length > 0 && (
                        <Badge variant="light" size="xs">
                          {t('manageServices.presetsCount', { count: Object.keys(sc.preset_values).length })}
                        </Badge>
                      )}
                    </Group>
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon variant="subtle" onClick={() => openEditShortcut(sc)}>
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => handleDeleteShortcut(sc)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Modal>

      {/* ── Shortcut editor modal ──────────────────────────────────────────── */}
      <Modal
        opened={shortcutEditorOpened}
        onClose={shortcutEditorHandlers.close}
        title={editingShortcut ? t('manageServices.editShortcut') : t('manageServices.newShortcut')}
        size="md"
        zIndex={300}
      >
        <form onSubmit={shortcutForm.onSubmit(submitShortcut)}>
          <TextInput
            label={t('services.nameEn')}
            required
            {...shortcutForm.getInputProps('label_en')}
            mb="sm"
          />
          <TextInput
            label={t('services.nameAr')}
            required
            dir="auto"
            {...shortcutForm.getInputProps('label_ar')}
            mb="sm"
          />
          <ColorInput
            label={t('manageServices.color')}
            format="hex"
            swatches={COLOR_SWATCHES}
            {...shortcutForm.getInputProps('color')}
            mb="md"
          />

          {serviceFields.length > 0 && (
            <>
              <Divider label={t('manageServices.presetValues')} labelPosition="left" mb="sm" />
              <Stack gap="sm" mb="sm">
                {serviceFields.map((field) => (
                  <ServiceFieldInput
                    key={field.key}
                    field={{ ...field, required: false }}
                    value={presetValues[field.key]}
                    onChange={(val) =>
                      setPresetValues((prev) => ({ ...prev, [field.key]: val }))
                    }
                    optionLists={optionLists}
                    lang={lang}
                  />
                ))}
              </Stack>
            </>
          )}

          <Divider mb="sm" />
          <NumberInput
            label={t('manageServices.presetCost')}
            min={0}
            value={presetCost === '' ? '' : presetCost}
            onChange={(val) => setPresetCost(val)}
            mb="md"
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={shortcutEditorHandlers.close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={shortcutSaving}>
              {t('common.save')}
            </Button>
          </Group>
        </form>
      </Modal>
    </Stack>
  );
}
