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
  Modal,
  Alert,
  Select,
  Pagination,
  ScrollArea,
  useMantineColorScheme,
} from '@mantine/core';
import { IconArrowLeft, IconEdit, IconTrash, IconShoppingCartPlus, IconAlertTriangle } from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useTranslation } from 'react-i18next';
import { getProduct, getProductHistory, deleteProduct } from '../api/products.js';
import { useReference } from '../hooks/useReference.js';
import { formatMoney, formatDate, formatNumber } from '../lib/format.js';
import { productImage, productCategoryName, productBrandName } from '../lib/display.js';
import ProductFormModal from '../components/ProductFormModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const HISTORY_PAGE_SIZE = 10;

const txnColor = (type) =>
  type === 'sale' ? 'blue' : type === 'purchase' ? 'teal' : type === 'return' ? 'orange' : 'grape';

function Field({ label, value, size = 'md', fw = 500, blurred = false }) {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={700}>
        {label}
      </Text>
      <Text size={size} fw={fw} style={blurred ? { filter: 'blur(4px)', userSelect: 'none' } : undefined}>
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
  const { colorScheme } = useMantineColorScheme();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formOpened, formHandlers] = useDisclosure(false);
  const [deleteOpened, deleteHandlers] = useDisclosure(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const { can } = useAuth();
  const canEdit = can('inventory.edit');
  const canSell = can('txn.sale');
  const canSeeCost = can('see.cost');
  const canSeeUsers = can('see.others_transactions');

  // Transaction history: paged + optional type filter, loaded from its own endpoint.
  const [historyData, setHistoryData] = useState({ items: [], total: 0 });
  const [historyType, setHistoryType] = useState(null);
  const [historyPage, setHistoryPage] = useState(1);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyType]);

  useEffect(() => {
    getProductHistory(id, {
      type: historyType || undefined,
      page: historyPage,
      pageSize: HISTORY_PAGE_SIZE,
    })
      .then(setHistoryData)
      .catch(() => setHistoryData({ items: [], total: 0 }));
  }, [id, historyType, historyPage]);

  // Sell this product: jump to New Transaction with it pre-added (quantity 1).
  // Passed via router state so any in-progress transaction draft is preserved.
  const sellProduct = () => navigate('/new-transaction', { state: { addProduct: product } });

  const confirmDelete = async () => {
    setDeleteBusy(true);
    try {
      await deleteProduct(product.id);
      notifications.show({ message: t('common.deleted'), color: 'green' });
      reloadRef();
      navigate('/inventory');
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setDeleteBusy(false);
    }
  };

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
        <Group gap="xs">
          {canSell && (
            <Button color="teal" leftSection={<IconShoppingCartPlus size={18} />} onClick={sellProduct}>
              {t('product.sell')}
            </Button>
          )}
          {canEdit && (
            <Button variant="default" leftSection={<IconEdit size={18} />} onClick={formHandlers.open}>
              {t('common.edit')}
            </Button>
          )}
          {canEdit && (
            <Button color="red" variant="light" leftSection={<IconTrash size={18} />} onClick={deleteHandlers.open}>
              {t('common.delete')}
            </Button>
          )}
        </Group>
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
                blurred={!can('see.cost')}
              />
              <Field label={t('product.category')} value={productCategoryName(product, lang)} />
              <Field label={t('product.brand')} value={productBrandName(product, lang)} />
              <Field label={t('product.barcode')} value={product.barcode} />
            </SimpleGrid>
          </Stack>
        </Group>
      </Paper>

      <Paper withBorder p="lg" radius="md">
        <Group justify="space-between" align="center" mb="sm">
          <Title order={4}>{t('product.history')}</Title>
          <Select
            placeholder={t('common.all')}
            value={historyType}
            onChange={setHistoryType}
            clearable
            w={180}
            data={[
              { value: 'sale', label: t('txnType.sale') },
              { value: 'purchase', label: t('txnType.purchase') },
              { value: 'return', label: t('txnType.return') },
            ]}
          />
        </Group>
        {historyData.items.length === 0 ? (
          <Text c="dimmed">{t('product.noHistory')}</Text>
        ) : (
          <>
            <ScrollArea type="auto">
            <Table fz="md" verticalSpacing="sm" styles={{ th: { whiteSpace: 'nowrap' }, td: { whiteSpace: 'nowrap' } }}>
              <Table.Thead>
                <Table.Tr bg={colorScheme === 'dark' ? 'var(--mantine-color-dark-6)' : 'gray.2'}>
                  <Table.Th>{t('product.txnId')}</Table.Th>
                  <Table.Th>{t('product.date')}</Table.Th>
                  <Table.Th>{t('product.action')}</Table.Th>
                  <Table.Th>{t('product.quantity')}</Table.Th>
                  <Table.Th>{t('product.unitPrice')}</Table.Th>
                  {canSeeCost && <Table.Th>{t('product.buyingPrice')}</Table.Th>}
                  {canSeeCost && <Table.Th>{t('product.profit')}</Table.Th>}
                  {canSeeUsers && <Table.Th>{t('product.user')}</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {historyData.items.map((h, idx) => {
                  // Unit price & profit don't apply to a purchase (inbound cost). For a return,
                  // profit & buying price are blanked too — a return reverses a sale and the
                  // product comes back into stock, so it isn't a standalone gain or loss.
                  const isPurchase = h.type === 'purchase';
                  const isReturn = h.type === 'return';
                  const profit =
                    (Number(h.unit_price) - Number(h.unit_cost)) * Number(h.quantity);
                  return (
                    <Table.Tr key={idx}>
                      <Table.Td c="dimmed">#{h.id}</Table.Td>
                      <Table.Td>{formatDate(h.created_at, lang)}</Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={txnColor(h.type)}>
                          {t(`txnType.${h.type}`)}
                        </Badge>
                      </Table.Td>
                      <Table.Td fw={600}>{formatNumber(h.quantity, lang)}</Table.Td>
                      <Table.Td fw={600}>{isPurchase ? '—' : formatMoney(h.unit_price, lang)}</Table.Td>
                      {canSeeCost && (
                        <Table.Td fw={600}>{isReturn ? '—' : formatMoney(h.unit_cost, lang)}</Table.Td>
                      )}
                      {canSeeCost && (
                        <Table.Td
                          fw={600}
                          c={isPurchase || isReturn ? undefined : profit > 0 ? 'teal' : profit < 0 ? 'red' : undefined}
                        >
                          {isPurchase || isReturn ? '—' : formatMoney(profit, lang)}
                        </Table.Td>
                      )}
                      {canSeeUsers && <Table.Td>{h.username_snapshot || '—'}</Table.Td>}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
            </ScrollArea>
            {historyData.total > HISTORY_PAGE_SIZE && (
              <Group justify="flex-end" mt="sm">
                <Pagination
                  total={Math.ceil(historyData.total / HISTORY_PAGE_SIZE)}
                  value={historyPage}
                  onChange={setHistoryPage}
                />
              </Group>
            )}
          </>
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

      <Modal
        opened={deleteOpened}
        onClose={deleteHandlers.close}
        title={t('inventory.deleteTitle')}
        centered
      >
        <Stack>
          <Text>{t('inventory.deleteConfirm')}</Text>
          {(product.quantity ?? 0) > 0 && (
            <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
              {t('inventory.bulk.hasStockWarning', {
                count: 1,
                units: formatNumber(product.quantity, lang),
              })}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={deleteHandlers.close} disabled={deleteBusy}>
              {t('common.cancel')}
            </Button>
            <Button color="red" loading={deleteBusy} onClick={confirmDelete}>
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
