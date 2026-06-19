import { useEffect, useState } from 'react';
import {
  Modal,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  FileInput,
  Button,
  Group,
  Stack,
  SimpleGrid,
  Popover,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { createProduct, updateProduct, uploadProductImage } from '../api/products.js';
import { createCategory, createBrand } from '../api/reference.js';
import { refName } from '../lib/display.js';
import { apiErrorMessage } from '../lib/apiError.js';

// Controlled inline "+ New" for a reference list (category/brand). Requires both
// English + Arabic names — still no free-text typo entry — and the backend rejects
// duplicates. On success the parent reloads the lists and selects the new item.
function QuickAddPopover({ createFn, onCreated, tooltip }) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!nameEn.trim() || !nameAr.trim()) return;
    setSaving(true);
    try {
      const created = await createFn({ name_en: nameEn.trim(), name_ar: nameAr.trim() });
      await onCreated(created);
      setNameEn('');
      setNameAr('');
      setOpened(false);
    } catch (err) {
      notifications.show({ message: apiErrorMessage(err, t), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" withArrow shadow="md" width={240} trapFocus>
      <Popover.Target>
        <Tooltip label={tooltip}>
          <ActionIcon variant="default" size={36} onClick={() => setOpened((o) => !o)}>
            <IconPlus size={18} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap="xs">
          <TextInput
            label={t('services.nameEn')}
            size="xs"
            value={nameEn}
            onChange={(e) => setNameEn(e.currentTarget.value)}
          />
          <TextInput
            label={t('services.nameAr')}
            size="xs"
            dir="auto"
            value={nameAr}
            onChange={(e) => setNameAr(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <Button size="xs" onClick={save} loading={saving}>
            {t('common.save')}
          </Button>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

const EMPTY = {
  name: '',
  description: '',
  buying_price: 0,
  selling_price: 0,
  category_id: null,
  brand_id: null,
  quantity: 0,
  barcode: '',
};

export default function ProductFormModal({
  opened,
  onClose,
  product,
  categories,
  brands,
  onSaved,
  initialBarcode = '',
  initialName = '',
  reloadReference,
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);

  // After inline-creating a category/brand, refresh the lists and select it.
  const handleRefCreated = (field) => async (created) => {
    await reloadReference?.();
    form.setFieldValue(field, String(created.id));
  };

  const form = useForm({
    initialValues: EMPTY,
    validate: {
      name: (v) => (v && v.trim() ? null : t('product.nameRequired')),
      buying_price: (v) => (Number(v) > 0 ? null : t('product.pricePositive')),
      selling_price: (v) => (Number(v) > 0 ? null : t('product.pricePositive')),
      category_id: (v) => (v ? null : t('product.categoryRequired')),
      brand_id: (v) => (v ? null : t('product.brandRequired')),
    },
  });

  useEffect(() => {
    if (opened) {
      setImageFile(null);
      form.setValues(
        product
          ? {
              name: product.name || '',
              description: product.description || '',
              buying_price: product.buying_price || 0,
              selling_price: product.selling_price || 0,
              category_id: product.category_id ? String(product.category_id) : null,
              brand_id: product.brand_id ? String(product.brand_id) : null,
              quantity: product.quantity || 0,
              barcode: product.barcode || '',
            }
          : { ...EMPTY, name: initialName || '', barcode: initialBarcode || '' },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, product, initialBarcode, initialName]);

  const submit = async (values) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        category_id: values.category_id ? Number(values.category_id) : null,
        brand_id: values.brand_id ? Number(values.brand_id) : null,
      };
      const saved = product
        ? await updateProduct(product.id, payload)
        : await createProduct(payload);
      if (imageFile) {
        await uploadProductImage(saved.id, imageFile);
      }
      notifications.show({ message: t('common.saved'), color: 'green' });
      onSaved?.();
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

  const toOptions = (rows) => rows.map((r) => ({ value: String(r.id), label: refName(r, lang) }));

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={product ? t('product.editProduct') : t('product.newProduct')}
      size="lg"
      returnFocus={false}
    >
      <form onSubmit={form.onSubmit(submit)}>
        <TextInput
          label={t('product.name')}
          required
          data-autofocus
          {...form.getInputProps('name')}
          mb="sm"
        />
        <Textarea
          label={t('product.description')}
          autosize
          minRows={2}
          dir="auto"
          {...form.getInputProps('description')}
          mb="sm"
        />
        <SimpleGrid cols={2} mb="sm">
          <NumberInput
            label={t('product.buyingPrice')}
            required
            min={0}
            {...form.getInputProps('buying_price')}
          />
          <NumberInput
            label={t('product.sellingPrice')}
            required
            min={0}
            {...form.getInputProps('selling_price')}
          />
        </SimpleGrid>
        <SimpleGrid cols={2} mb="sm">
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <Select
              style={{ flex: 1 }}
              label={t('product.category')}
              data={toOptions(categories)}
              required
              {...form.getInputProps('category_id')}
            />
            <QuickAddPopover
              createFn={createCategory}
              onCreated={handleRefCreated('category_id')}
              tooltip={t('lists.quickAddCategory')}
            />
          </Group>
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <Select
              style={{ flex: 1 }}
              label={t('product.brand')}
              data={toOptions(brands)}
              required
              {...form.getInputProps('brand_id')}
            />
            <QuickAddPopover
              createFn={createBrand}
              onCreated={handleRefCreated('brand_id')}
              tooltip={t('lists.quickAddBrand')}
            />
          </Group>
        </SimpleGrid>
        <SimpleGrid cols={2} mb="sm">
          <NumberInput
            label={product ? t('product.quantity') : t('product.initialStock')}
            min={0}
            readOnly={Boolean(product)}
            hideControls={Boolean(product)}
            description={product ? t('product.quantityReadOnlyHint') : undefined}
            {...form.getInputProps('quantity')}
          />
          <TextInput label={t('product.barcode')} {...form.getInputProps('barcode')} />
        </SimpleGrid>
        <FileInput
          label={t('product.uploadImage')}
          accept="image/*"
          value={imageFile}
          onChange={setImageFile}
          clearable
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={saving}>
            {t('common.save')}
          </Button>
        </Group>
      </form>
    </Modal>
  );
}
