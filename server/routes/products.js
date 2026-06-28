import { Router } from 'express';
import { getDb } from '../db/connection.js';
import * as products from '../repositories/products.js';
import { listByProduct, historyByProduct, create as createTransaction } from '../repositories/transactions.js';
import { uploadProductImage, uploadedUrl } from '../lib/upload.js';
import { logActivity } from '../repositories/activityLogs.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { userHas } from '../lib/permissions.js';

// Strip buying_price from a product object when the caller lacks see.cost.
function hideCost(product, user) {
  if (!product || userHas(user, 'see.cost')) return product;
  const { buying_price, ...rest } = product;
  return rest;
}

// Apply hideCost to the paginated list shape { items, total, page, pageSize }.
function hideCostList({ items, ...rest }, user) {
  if (userHas(user, 'see.cost')) return { items, ...rest };
  return { ...rest, items: items.map((p) => hideCost(p, user)) };
}

// Strip inventory_cost_value from the summary object.
function hideSummaryCost(data, user) {
  if (userHas(user, 'see.cost')) return data;
  const { inventory_cost_value, ...rest } = data;
  return rest;
}

// Strip unit_cost from transaction history rows.
function hideHistoryCost(items, user) {
  if (userHas(user, 'see.cost')) return items;
  return items.map(({ unit_cost, ...rest }) => rest);
}

// Apply hideHistoryCost to the paginated history shape.
function hideCostHistoryPage({ items, ...rest }, user) {
  if (userHas(user, 'see.cost')) return { items, ...rest };
  return { ...rest, items: hideHistoryCost(items, user) };
}

const router = Router();

// Product reads stay open to any authenticated user (the sale flow needs lookup
// and search even for users who can't open the Inventory page). Writes require
// the inventory.edit capability.
const canEdit = requirePermission('inventory.edit');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// New product cost after a restock: the weighted average of existing stock and the
// incoming batch, so a single buying_price keeps inventory value accurate even when
// shipments arrive at different prices. Past sales keep their own snapshotted cost.
function weightedAverageCost(oldQty, oldCost, addQty, addCost) {
  const totalQty = oldQty + addQty;
  return totalQty > 0 ? round2((oldQty * oldCost + addQty * addCost) / totalQty) : addCost;
}

// Stock only ever enters through a purchase transaction, so every arrival is
// tracked (audit trail + spend analytics). The purchase line records the ACTUAL
// cost paid (`unitCost`, defaulting to the product's current cost) and atomically
// increments the product's quantity.
function recordStockIn(product, quantity, unitCost = product.buying_price, user) {
  createTransaction(
    {
      type: 'purchase',
      items: [
        {
          product_id: product.id,
          quantity,
          unit_price: unitCost,
          unit_cost: unitCost,
        },
      ],
    },
    user,
  );
  return products.getById(product.id);
}

// Resolves the cost actually paid for an incoming batch: an explicit positive
// `unit_cost` from the request, else the product's current buying price.
function paidUnitCost(body, product) {
  const c = Number(body.unit_cost);
  return Number.isFinite(c) && c > 0 ? c : product.buying_price;
}

router.get('/', (req, res) => {
  res.json(hideCostList(products.list(req.query), req.user));
});

// Specific routes before "/:id" so they aren't captured as ids.
router.get('/summary', (req, res) => {
  res.json(hideSummaryCost(products.summary(req.query), req.user));
});

// All product ids matching the current filters (for "select all matching").
router.get('/ids', (req, res) => {
  res.json(products.listIds(req.query));
});

router.get('/lookup', (req, res) => {
  const product = products.findByBarcode(req.query.barcode);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(hideCost(product, req.user));
});

router.get('/search', (req, res) => {
  res.json(products.searchByName(req.query.q || '').map((p) => hideCost(p, req.user)));
});

router.get('/:id', (req, res) => {
  const product = products.getById(Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json({ ...hideCost(product, req.user), history: hideHistoryCost(listByProduct(product.id), req.user) });
});

// Paginated, type-filterable transaction history for one product.
router.get('/:id/history', (req, res) => {
  res.json(hideCostHistoryPage(historyByProduct(Number(req.params.id), req.query), req.user));
});

router.post('/', canEdit, (req, res) => {
  products.assertValidProductInput(req.body);
  // Create the product with no stock, then record any initial stock as a purchase
  // so it's tracked. Both run in one DB transaction (better-sqlite3 nests the
  // inner transaction via a savepoint) so the product + its first purchase are atomic.
  const initialQty = Number(req.body.quantity) || 0;
  const result = getDb().transaction(() => {
    const product = products.create({ ...req.body, quantity: 0 });
    if (initialQty > 0) recordStockIn(product, initialQty, undefined, req.user);
    return products.getById(product.id);
  })();
  logActivity({ userId: req.user.id, username: req.user.username, action: 'create_product', entity: 'product', entityId: result.id, detail: { name: result.name } });
  res.status(201).json(hideCost(result, req.user));
});

// Inventory "add stock" by barcode: restock an existing product, or create one
// and record its initial stock. (Not used by the current UI, but kept consistent.)
router.post('/add-stock', canEdit, (req, res) => {
  const qty = Number.isFinite(Number(req.body.quantity)) ? Number(req.body.quantity) : 1;
  const barcode = req.body.barcode ? String(req.body.barcode).trim() : null;
  const existing = barcode ? products.findByBarcode(barcode) : null;
  const result = getDb().transaction(() => {
    const product = existing || products.create({ ...req.body, quantity: 0 });
    if (qty > 0) {
      const unitCost = paidUnitCost(req.body, product);
      recordStockIn(product, qty, unitCost, req.user);
      // Blend the new batch into the product's cost (only meaningful when restocking
      // existing stock; for a fresh product the average equals the entered cost).
      products.update(product.id, {
        buying_price: weightedAverageCost(product.quantity, product.buying_price, qty, unitCost),
      });
    }
    return products.getById(product.id);
  })();
  logActivity({ userId: req.user.id, username: req.user.username, action: 'record_transaction', entity: 'product', entityId: result.id, detail: { type: 'purchase', name: result.name, quantity: qty } });
  res.status(201).json(hideCost(result, req.user));
});

router.post('/:id/add-stock', canEdit, (req, res) => {
  const qty = Number(req.body.quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number' });
  }
  const product = products.getById(Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Not found' });
  // product.quantity / buying_price are the pre-restock values — exactly what the
  // weighted average needs. recordStockIn then increments the stored quantity.
  const unitCost = paidUnitCost(req.body, product);
  const result = getDb().transaction(() => {
    recordStockIn(product, qty, unitCost, req.user);
    products.update(product.id, {
      buying_price: weightedAverageCost(product.quantity, product.buying_price, qty, unitCost),
    });
    return products.getById(product.id);
  })();
  logActivity({ userId: req.user.id, username: req.user.username, action: 'record_transaction', entity: 'product', entityId: result.id, detail: { type: 'purchase', name: result.name, quantity: qty } });
  res.json(hideCost(result, req.user));
});

// How many of the given products still hold stock (to warn before deleting).
router.post('/stock-check', (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  res.json(products.stockStatus(ids));
});

// Bulk delete a set of products.
router.post('/bulk-delete', canEdit, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No products selected' });
  const deleted = products.removeMany(ids);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'bulk_delete_products', entity: 'product', detail: { count: deleted } });
  res.json({ deleted });
});

// Bulk reassign category and/or brand for a set of products.
router.post('/bulk-update', canEdit, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (ids.length === 0) return res.status(400).json({ error: 'No products selected' });
  const fields = {};
  if ('category_id' in req.body) fields.category_id = req.body.category_id || null;
  if ('brand_id' in req.body) fields.brand_id = req.body.brand_id || null;
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }
  const updated = products.setReferences(ids, fields);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'bulk_update_products', entity: 'product', detail: { count: updated, fields: Object.keys(fields) } });
  res.json({ updated });
});

router.put('/:id', canEdit, (req, res) => {
  const id = Number(req.params.id);
  products.assertValidProductInput(req.body, { id });
  const updated = products.update(id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_product', entity: 'product', entityId: id, detail: { name: updated.name } });
  res.json(hideCost(updated, req.user));
});

router.delete('/:id', canEdit, (req, res) => {
  const id = Number(req.params.id);
  const product = products.getById(id);
  if (!product) return res.status(404).json({ error: 'Not found' });
  products.remove(id);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_product', entity: 'product', entityId: id, detail: { name: product.name } });
  res.status(204).end();
});

router.post('/:id/image', canEdit, (req, res, next) => {
  uploadProductImage(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const updated = products.update(Number(req.params.id), {
      image_path: uploadedUrl(req.file.filename),
    });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    logActivity({ userId: req.user.id, username: req.user.username, action: 'update_product', entity: 'product', entityId: Number(req.params.id), detail: { name: updated.name } });
    res.json(updated);
  });
});

export default router;
