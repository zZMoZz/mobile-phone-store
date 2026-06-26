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
  SegmentedControl,
  Center,
  Divider,
  ColorInput,
  NumberInput,
  ColorSwatch,
  Checkbox,
  useMantineColorScheme,
  Pagination,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconEdit, IconTrash, IconSearch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { listServices, createService, updateService, deleteService } from '../api/services.js';
import { listOptionLists } from '../api/optionLists.js';
import { listServiceShortcuts, createServiceShortcut, updateServiceShortcut, deleteServiceShortcut } from '../api/serviceShortcuts.js';
import { apiErrorMessage } from '../lib/apiError.js';
import { ServiceFieldInput } from '../components/ServiceFieldInputs.jsx';
import OptionListSection from '../components/OptionListSection.jsx';
import BilingualOptionsEditor from '../components/BilingualOptionsEditor.jsx';

const BLANK_FIELD = () => ({
  _uid: crypto.randomUUID(),
  key: crypto.randomUUID(),
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
  const { colorScheme } = useMantineColorScheme();
  const [services, setServices] = useState([]);
  const [optionLists, setOptionLists] = useState([]);
  const [editing, setEditing] = useState(null);
  const [opened, handlers] = useDisclosure(false);
  const [saving, setSaving] = useState(false);

  // All shortcuts (loaded once, reloaded after mutations)
  const [shortcuts, setShortcuts] = useState([]);

  // Shortcut editor state
  const [shortcutsService, setShortcutsService] = useState(null);
  const [editingShortcut, setEditingShortcut] = useState(null);
  const [shortcutEditorOpened, shortcutEditorHandlers] = useDisclosure(false);
  const [shortcutSaving, setShortcutSaving] = useState(false);
  const [svcToDelete, setSvcToDelete] = useState(null);
  const [deleteSvcOpened, deleteSvcHandlers] = useDisclosure(false);
  const [selectedSvc, setSelectedSvc] = useState(new Set());
  const [bulkDeleteSvcOpened, bulkDeleteSvcHandlers] = useDisclosure(false);
  const [bulkDeletingSvc, setBulkDeletingSvc] = useState(false);

  const [scToDelete, setScToDelete] = useState(null);
  const [deleteScOpened, deleteScHandlers] = useDisclosure(false);
  const [selectedSc, setSelectedSc] = useState(new Set());
  const [bulkDeleteScOpened, bulkDeleteScHandlers] = useDisclosure(false);
  const [bulkDeletingSc, setBulkDeletingSc] = useState(false);

  // Services table pagination
  const SVC_PAGE_SIZE = 10;
  const [svcPage, setSvcPage] = useState(1);

  // Shortcuts table controls
  const SC_PAGE_SIZE = 10;
  const [scSearch, setScSearch] = useState('');
  const [scServiceFilter, setScServiceFilter] = useState(null);
  const [scPage, setScPage] = useState(1);

  const [fieldOptionsErrors, setFieldOptionsErrors] = useState([]);

  const [presetValues, setPresetValues] = useState({});
  const [presetCost, setPresetCost] = useState('');
  const [presetProfit, setPresetProfit] = useState('');

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
      direction: 'in',
    },
    validate: {
      name_en: (v) => (v.trim() ? null : t('lists.nameRequired')),
      name_ar: (v) => (v.trim() ? null : t('lists.nameRequired')),
    },
  });

  const reloadShortcuts = () => {
    listServiceShortcuts().then((data) => { setShortcuts(data); setSelectedSc(new Set()); }).catch(() => {});
  };

  const load = () => {
    listServices().then((data) => { setServices(data); setSelectedSvc(new Set()); }).catch(() => {});
    listOptionLists().then(setOptionLists).catch(() => {});
    reloadShortcuts();
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
    form.setValues({ name_en: svc.name_en, name_ar: svc.name_ar, fields, direction: svc.direction ?? 'in' });
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

  const validateInlineOptions = (options) => {
    const enNames = options.map((o) => (o.name_en || '').trim().toLowerCase()).filter(Boolean);
    if (new Set(enNames).size !== enNames.length) return t('lists.optionDupEn');
    const arNames = options.map((o) => (o.name_ar || '').trim()).filter(Boolean);
    if (new Set(arNames).size !== arNames.length) return t('lists.optionDupAr');
    return null;
  };

  const submit = async (values) => {
    const invalidSelect = values.fields.find(
      (f) => f.type === 'select' && !f.option_list_id && (!f.options || f.options.length === 0)
    );
    if (invalidSelect) {
      notifications.show({ message: t('manageServices.selectNeedsOptions'), color: 'red' });
      return;
    }

    const optErrors = values.fields.map((f) =>
      f.type === 'select' && f._source !== 'shared' ? validateInlineOptions(f.options || []) : null
    );
    if (optErrors.some(Boolean)) {
      setFieldOptionsErrors(optErrors);
      return;
    }
    setFieldOptionsErrors([]);
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

      const payload = { name_en: values.name_en, name_ar: values.name_ar, fields, direction: values.direction };

      if (editing) await updateService(editing.id, payload);
      else await createService(payload);

      notifications.show({ message: t('common.saved'), color: 'green' });
      handlers.close();
      load();
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'service_name_en_taken') {
        form.setFieldError('name_en', t('errors.service_name_en_taken'));
      } else if (code === 'service_name_ar_taken') {
        form.setFieldError('name_ar', t('errors.service_name_ar_taken'));
      } else {
        notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (svc) => {
    setSvcToDelete(svc);
    deleteSvcHandlers.open();
  };

  const confirmDeleteService = async () => {
    deleteSvcHandlers.close();
    try {
      await deleteService(svcToDelete.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      load();
      reloadShortcuts();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setSvcToDelete(null);
    }
  };

  const toggleSelectSvc = (id) => setSelectedSvc((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allSvcSelected = services.length > 0 && services.every((s) => selectedSvc.has(s.id));
  const toggleSelectAllSvc = () => setSelectedSvc(() => {
    if (allSvcSelected) return new Set();
    return new Set(services.map((s) => s.id));
  });
  const confirmBulkDeleteSvc = async () => {
    bulkDeleteSvcHandlers.close();
    setBulkDeletingSvc(true);
    try {
      await Promise.all([...selectedSvc].map((id) => deleteService(id)));
      notifications.show({ message: t('common.deleted'), color: 'green' });
      load();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setBulkDeletingSvc(false);
    }
  };

  // ── Shortcuts ──────────────────────────────────────────────────────────────

  const openNewShortcut = (svc) => {
    setShortcutsService(svc);
    setEditingShortcut(null);
    shortcutForm.setValues({ label_en: '', label_ar: '', color: '' });
    setPresetValues({});
    setPresetCost('');
    setPresetProfit('');
    shortcutEditorHandlers.open();
  };

  const openEditShortcut = (sc) => {
    const svc = services.find((s) => s.id === sc.service_id) || null;
    setShortcutsService(svc);
    setEditingShortcut(sc);
    const { cost, profit: presetProfitVal, ...fieldPresets } = sc.preset_values || {};
    shortcutForm.setValues({
      label_en: sc.label_en || '',
      label_ar: sc.label_ar || '',
      color: sc.color || '',
    });
    setPresetValues(fieldPresets);
    setPresetCost(cost != null ? cost : '');
    setPresetProfit(presetProfitVal != null ? presetProfitVal : '');
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
      if (presetProfit !== '' && presetProfit != null && !Number.isNaN(Number(presetProfit))) {
        pv.profit = Number(presetProfit);
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
      reloadShortcuts();
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'shortcut_label_en_taken') {
        shortcutForm.setFieldError('label_en', t('errors.shortcut_label_en_taken'));
      } else if (code === 'shortcut_label_ar_taken') {
        shortcutForm.setFieldError('label_ar', t('errors.shortcut_label_ar_taken'));
      } else {
        notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
      }
    } finally {
      setShortcutSaving(false);
    }
  };

  const handleDeleteShortcut = (sc) => {
    setScToDelete(sc);
    deleteScHandlers.open();
  };

  const confirmDeleteShortcut = async () => {
    deleteScHandlers.close();
    try {
      await deleteServiceShortcut(scToDelete.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      reloadShortcuts();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setScToDelete(null);
    }
  };

  const toggleSelectSc = (id) => setSelectedSc((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allScSelected = shortcuts.length > 0 && shortcuts.every((sc) => selectedSc.has(sc.id));
  const toggleSelectAllSc = () => setSelectedSc(() => {
    if (allScSelected) return new Set();
    return new Set(shortcuts.map((sc) => sc.id));
  });
  const confirmBulkDeleteSc = async () => {
    bulkDeleteScHandlers.close();
    setBulkDeletingSc(true);
    try {
      await Promise.all([...selectedSc].map((id) => deleteServiceShortcut(id)));
      notifications.show({ message: t('common.deleted'), color: 'green' });
      reloadShortcuts();
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setBulkDeletingSc(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const localizedName = (svc) => (lang === 'ar' ? svc.name_ar : svc.name_en);

  const filteredShortcuts = shortcuts.filter((sc) => {
    if (scServiceFilter && sc.service_id !== Number(scServiceFilter)) return false;
    if (scSearch.trim()) {
      const q = scSearch.toLowerCase();
      return sc.label_en.toLowerCase().includes(q) || sc.label_ar.toLowerCase().includes(q);
    }
    return true;
  });
  const svcTotalPages = Math.max(1, Math.ceil(services.length / SVC_PAGE_SIZE));
  const paginatedServices = services.slice((svcPage - 1) * SVC_PAGE_SIZE, svcPage * SVC_PAGE_SIZE);

  const scTotalPages = Math.max(1, Math.ceil(filteredShortcuts.length / SC_PAGE_SIZE));
  const paginatedShortcuts = filteredShortcuts.slice((scPage - 1) * SC_PAGE_SIZE, scPage * SC_PAGE_SIZE);

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
      <Title order={2}>{t('manageServices.title')}</Title>

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>{t('manageServices.servicesLabel')}</Title>
          <Group gap="xs">
            {selectedSvc.size > 0 && (
              <Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} loading={bulkDeletingSvc} onClick={bulkDeleteSvcHandlers.open}>
                {t('lists.bulkDelete')} ({selectedSvc.size})
              </Button>
            )}
            <Button size="xs" variant={allSvcSelected ? 'filled' : 'default'} onClick={toggleSelectAllSvc}>
              {allSvcSelected ? t('common.deselectAll') : t('common.selectAll')}
            </Button>
            <Button size="xs" leftSection={<IconPlus size={16} />} onClick={openNew}>
              {t('manageServices.addService')}
            </Button>
          </Group>
        </Group>
        <Table highlightOnHover verticalSpacing="sm" styles={{ td: { fontWeight: 500 } }}>
          <Table.Thead>
            <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
              <Table.Th w={40} />
              <Table.Th>{t('services.nameEn')}</Table.Th>
              <Table.Th>{t('services.nameAr')}</Table.Th>
              <Table.Th>{t('manageServices.fields')}</Table.Th>
              <Table.Th>{t('manageServices.shortcutsCol')}</Table.Th>
              <Table.Th>{t('common.actions')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paginatedServices.map((svc) => {
              const svcShortcutCount = shortcuts.filter((sc) => sc.service_id === svc.id).length;
              return (
                <Table.Tr key={svc.id} bg={selectedSvc.has(svc.id) ? 'var(--mantine-color-indigo-light)' : undefined}>
                  <Table.Td>
                    <Checkbox checked={selectedSvc.has(svc.id)} onChange={() => toggleSelectSvc(svc.id)} size="sm" />
                  </Table.Td>
                  <Table.Td>{svc.name_en}</Table.Td>
                  <Table.Td>{svc.name_ar}</Table.Td>
                  <Table.Td>
                    <Text size="sm" fw={700} c="dimmed">{(svc.fields || []).length}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <ActionIcon variant="light" size="sm" onClick={() => openNewShortcut(svc)}>
                        <IconPlus size={14} />
                      </ActionIcon>
                      {svcShortcutCount > 0 && (
                        <Text size="sm" fw={700} c="dimmed">{svcShortcutCount}</Text>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon variant="subtle" onClick={() => openEdit(svc)}>
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon variant="subtle" color="red" onClick={() => handleDelete(svc)}>
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {paginatedServices.length === 0 && (
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
        {svcTotalPages > 1 && (
          <Group justify="center" mt="md">
            <Pagination value={svcPage} onChange={setSvcPage} total={svcTotalPages} size="sm" />
          </Group>
        )}
      </Paper>

      {/* ── All shortcuts in one table ────────────────────────────────────── */}
      {shortcuts.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>{t('manageServices.shortcuts')}</Title>
            <Group gap="xs">
              {selectedSc.size > 0 && (
                <Button size="xs" color="red" variant="light" leftSection={<IconTrash size={14} />} loading={bulkDeletingSc} onClick={bulkDeleteScHandlers.open}>
                  {t('lists.bulkDelete')} ({selectedSc.size})
                </Button>
              )}
              <Button size="xs" variant={allScSelected ? 'filled' : 'default'} onClick={toggleSelectAllSc}>
                {allScSelected ? t('common.deselectAll') : t('common.selectAll')}
              </Button>
            </Group>
          </Group>
          <Group mb="sm" grow>
            <TextInput
              leftSection={<IconSearch size={16} />}
              placeholder={t('manageServices.searchShortcuts')}
              value={scSearch}
              onChange={(e) => { setScSearch(e.currentTarget.value); setScPage(1); }}
            />
            <Select
              placeholder={t('manageServices.allServices')}
              data={services.map((s) => ({ value: String(s.id), label: localizedName(s) }))}
              value={scServiceFilter}
              onChange={(v) => { setScServiceFilter(v); setScPage(1); }}
              clearable
            />
          </Group>
          <Table highlightOnHover verticalSpacing="sm" styles={{ td: { fontWeight: 500 } }}>
            <Table.Thead>
              <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
                <Table.Th w={40} />
                <Table.Th>{t('services.nameEn')}</Table.Th>
                <Table.Th>{t('services.nameAr')}</Table.Th>
                <Table.Th>{t('txnType.service')}</Table.Th>
                <Table.Th>{t('manageServices.color')}</Table.Th>
                <Table.Th>{t('common.actions')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {paginatedShortcuts.map((sc) => {
                const svc = services.find((s) => s.id === sc.service_id);
                return (
                  <Table.Tr key={sc.id} bg={selectedSc.has(sc.id) ? 'var(--mantine-color-indigo-light)' : undefined}>
                    <Table.Td>
                      <Checkbox checked={selectedSc.has(sc.id)} onChange={() => toggleSelectSc(sc.id)} size="sm" />
                    </Table.Td>
                    <Table.Td>{sc.label_en}</Table.Td>
                    <Table.Td>{sc.label_ar}</Table.Td>
                    <Table.Td>
                      {svc
                        ? localizedName(svc)
                        : <Text size="sm" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      {sc.color
                        ? <ColorSwatch color={sc.color} size={18} />
                        : <Text size="sm" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      <Group gap={4} wrap="nowrap">
                        <ActionIcon variant="subtle" onClick={() => openEditShortcut(sc)}>
                          <IconEdit size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" color="red" onClick={() => handleDeleteShortcut(sc)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
              {paginatedShortcuts.length === 0 && (
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
          {scTotalPages > 1 && (
            <Group justify="center" mt="md">
              <Pagination value={scPage} onChange={setScPage} total={scTotalPages} size="sm" />
            </Group>
          )}
        </Paper>
      )}

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
            mb="sm"
          />
          <Select
            label={t('manageServices.direction')}
            data={[
              { value: 'in', label: t('manageServices.directionIn') },
              { value: 'out', label: t('manageServices.directionOut') },
            ]}
            allowDeselect={false}
            {...form.getInputProps('direction')}
            mb="md"
          />

          <Divider label={t('manageServices.fields')} labelPosition="left" mb="sm" />

          <Stack gap="sm" mb="sm">
            {form.values.fields.map((field, index) => (
              <Paper key={field._uid} withBorder p="sm" radius="sm">
                <Group align="flex-start" wrap="wrap" gap="sm">
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
                      <BilingualOptionsEditor
                        value={field.options || []}
                        onChange={(v) => {
                          setFieldProp(index, 'options', v);
                          setFieldOptionsErrors((prev) => { const next = [...prev]; next[index] = null; return next; });
                        }}
                        error={fieldOptionsErrors[index]}
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

      {/* ── Option Lists ──────────────────────────────────────────────────── */}
      <OptionListSection onUpdate={() => listOptionLists().then(setOptionLists).catch(() => {})} />

      {/* ── Shortcut editor modal ──────────────────────────────────────────── */}
      <Modal
        opened={shortcutEditorOpened}
        onClose={shortcutEditorHandlers.close}
        title={editingShortcut ? t('manageServices.editShortcut') : t('manageServices.newShortcut')}
        size="md"
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
            mb="sm"
          />
          <NumberInput
            label={t('manageServices.presetProfit')}
            min={0}
            value={presetProfit === '' ? '' : presetProfit}
            onChange={(val) => setPresetProfit(val)}
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

      {/* ── Bulk delete services modal ─────────────────────────────────────── */}
      <Modal opened={bulkDeleteSvcOpened} onClose={bulkDeleteSvcHandlers.close} title={t('lists.bulkDeleteTitle')} size="sm">
        {(() => {
          const svcsWithSc = services.filter((s) => selectedSvc.has(s.id) && shortcuts.some((sc) => sc.service_id === s.id));
          const affectedScCount = shortcuts.filter((sc) => selectedSvc.has(sc.service_id)).length;
          return (
            <>
              <Text mb={svcsWithSc.length > 0 ? 'sm' : 'xl'}>{t('lists.bulkDeleteConfirm', { count: selectedSvc.size })}</Text>
              {svcsWithSc.length > 0 && (
                <>
                  <Text size="sm" c="orange" mb="xs">
                    {t('manageServices.bulkDeleteServiceShortcutsWarning', { count: affectedScCount })}
                  </Text>
                  <Stack gap={2} mb="xl">
                    {svcsWithSc.map((s) => {
                      const sc = shortcuts.filter((sc) => sc.service_id === s.id).length;
                      return (
                        <Text key={s.id} size="sm" c="orange">
                          {'• '}{lang === 'ar' ? s.name_ar : s.name_en}{' ('}{sc}{')'}
                        </Text>
                      );
                    })}
                  </Stack>
                </>
              )}
            </>
          );
        })()}
        <Group justify="flex-end">
          <Button variant="default" onClick={bulkDeleteSvcHandlers.close}>{t('common.cancel')}</Button>
          <Button color="red" loading={bulkDeletingSvc} onClick={confirmBulkDeleteSvc}>{t('common.delete')}</Button>
        </Group>
      </Modal>

      {/* ── Bulk delete shortcuts modal ─────────────────────────────────────── */}
      <Modal opened={bulkDeleteScOpened} onClose={bulkDeleteScHandlers.close} title={t('lists.bulkDeleteTitle')} size="sm">
        <Text mb="xl">{t('lists.bulkDeleteConfirm', { count: selectedSc.size })}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={bulkDeleteScHandlers.close}>{t('common.cancel')}</Button>
          <Button color="red" loading={bulkDeletingSc} onClick={confirmBulkDeleteSc}>{t('common.delete')}</Button>
        </Group>
      </Modal>

      {/* ── Delete service confirm modal ───────────────────────────────────── */}
      <Modal
        opened={deleteSvcOpened}
        onClose={deleteSvcHandlers.close}
        title={t('common.delete')}
        size="sm"
      >
        <Text mb="md">{t('manageServices.deleteConfirm')}</Text>
        {svcToDelete && (() => {
          const scCount = shortcuts.filter((sc) => sc.service_id === svcToDelete.id).length;
          return (
            <>
              <Text fw={600} mb={scCount > 0 ? 'sm' : 'xl'}>
                {lang === 'ar' ? svcToDelete.name_ar : svcToDelete.name_en}
              </Text>
              {scCount > 0 && (
                <Text size="sm" c="orange" mb="xl">
                  {t('manageServices.deleteServiceShortcutsWarning', { count: scCount })}
                </Text>
              )}
            </>
          );
        })()}
        <Group justify="flex-end">
          <Button variant="default" onClick={deleteSvcHandlers.close}>
            {t('common.cancel')}
          </Button>
          <Button color="red" onClick={confirmDeleteService}>
            {t('common.delete')}
          </Button>
        </Group>
      </Modal>

      {/* ── Delete shortcut confirm modal ──────────────────────────────────── */}
      <Modal
        opened={deleteScOpened}
        onClose={deleteScHandlers.close}
        title={t('common.delete')}
        size="sm"
      >
        <Text mb="md">{t('manageServices.deleteShortcutConfirm')}</Text>
        {scToDelete && (
          <Text fw={600} mb="xl">
            {lang === 'ar' ? scToDelete.label_ar : scToDelete.label_en}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={deleteScHandlers.close}>
            {t('common.cancel')}
          </Button>
          <Button color="red" onClick={confirmDeleteShortcut}>
            {t('common.delete')}
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
