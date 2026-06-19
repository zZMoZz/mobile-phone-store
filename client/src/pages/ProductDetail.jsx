import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Title,
  Stack,
  Group,
  Button,
  Paper,
  Image,
  Text,
  Badge,
  SimpleGrid,
  Table,
  Center,
  Loader,
  Divider,
} from '@mantine/core';
import { IconArrowLeft, IconEdit } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { getProduct } from '../api/products.js';
import { useReference } from '../hooks/useReference.js';
import { formatMoney, formatDate, formatNumber } from '../lib/format.js';
import { productImage, productCategoryName, productBrandName } from '../lib/display.js';
import ProductFormModal from '../components/ProductFormModal.jsx';

function Field({ label, value, size = 'md', fw = 500 }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size={size} fw={fw}>
        {value ?? '—'}
      </Text>
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { categories, brands, reload: reloadRef } = useReference();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpened, formHandlers] = useDisclosure(false);

  const load = async () => {
    setLoading(true);
    try {
      setProduct(await getProduct(id));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }
  if (!product) {
    return <Text c="dimmed">{t('common.noResults')}</Text>;
  }

  return (
    <Stack>
      <Group justify="space-between">
        <Button variant="subtle" leftSection={<IconArrowLeft size={18} />} onClick={() => navigate('/inventory')}>
          {t('common.back')}
        </Button>
        <Button leftSection={<IconEdit size={18} />} onClick={formHandlers.open}>
          {t('common.edit')}
        </Button>
      </Group>

      <Paper withBorder p="lg" radius="md">
        <Group align="flex-start" wrap="nowrap" gap="lg">
          <Image src={productImage(product)} w={140} h={140} radius="md" fit="contain" />
          <Stack gap="xs" style={{ flex: 1 }}>
            <Group gap="sm">
              <Title order={3}>{product.name}</Title>
              {product.is_temporary ? (
                <Badge color="orange" variant="light">
                  {t('product.temporary')}
                </Badge>
              ) : null}
            </Group>
            {product.description ? <Text c="dimmed">{product.description}</Text> : null}
            <SimpleGrid cols={{ base: 2, sm: 3 }} mt="sm">
              <Field
                label={t('product.quantity')}
                value={formatNumber(product.quantity, lang)}
                size="xl"
                fw={700}
              />
              <Field
                label={t('product.sellingPrice')}
                value={formatMoney(product.selling_price, lang)}
                size="xl"
                fw={700}
              />
              <Field
                label={t('product.buyingPrice')}
                value={formatMoney(product.buying_price, lang)}
                size="xl"
                fw={700}
              />
              <Field label={t('product.category')} value={productCategoryName(product, lang)} />
              <Field label={t('product.brand')} value={productBrandName(product, lang)} />
              <Field label={t('product.barcode')} value={product.barcode} />
            </SimpleGrid>
          </Stack>
        </Group>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Title order={4} mb="sm">
          {t('product.history')}
        </Title>
        <Divider mb="sm" />
        {product.history.length === 0 ? (
          <Text c="dimmed">{t('product.noHistory')}</Text>
        ) : (
          <Table fz="md" verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('inventory.columns.updatedAt')}</Table.Th>
                <Table.Th>{t('common.actions')}</Table.Th>
                <Table.Th>{t('product.quantity')}</Table.Th>
                <Table.Th>{t('product.sellingPrice')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {product.history.map((h, idx) => (
                <Table.Tr key={idx}>
                  <Table.Td>{formatDate(h.created_at, lang)}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={h.type === 'sale' ? 'blue' : h.type === 'purchase' ? 'teal' : 'grape'}
                    >
                      {t(`txnType.${h.type}`)}
                    </Badge>
                  </Table.Td>
                  <Table.Td fw={600}>{formatNumber(h.quantity, lang)}</Table.Td>
                  <Table.Td fw={600}>{formatMoney(h.unit_price, lang)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <ProductFormModal
        opened={formOpened}
        onClose={formHandlers.close}
        product={product}
        categories={categories}
        brands={brands}
        reloadReference={reloadRef}
        onSaved={load}
      />
    </Stack>
  );
}
