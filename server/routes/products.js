import { Router } from 'express';
import { getDb } from '../db/connection.js';
import * as products from '../repositories/products.js';
import { listByProduct, create as createTransaction } from '../repositories/transactions.js';
import { uploadProductImage, uploadedUrl } from '../lib/upload.js';
import { logActivity } from '../repositories/activityLogs.js';

const router = Router();

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
function recordStockIn(product, quantity, unitCost = product.buying_price) {
  createTransaction({
    type: 'purchase',
    items: [
      {
        product_id: product.id,
        quantity,
        unit_price: unitCost,
        unit_cost: unitCost,
      },
    ],
  });
  return products.getById(product.id);
}

// Resolves the cost actually paid for an incoming batch: an explicit positive
// `unit_cost` from the request, else the product's current buying price.
function paidUnitCost(body, product) {
  const c = Number(body.unit_cost);
  return Number.isFinite(c) && c > 0 ? c : product.buying_price;
}

router.get('/', (req, res) => {
  res.json(products.list(req.query));
});

// Specific routes before "/:id" so they aren't captured as ids.
router.get('/summary', (req, res) => {
  res.json(products.summary(req.query));
});

router.get('/lookup', (req, res) => {
  const product = products.findByBarcode(req.query.barcode);
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json(product);
});

router.get('/search', (req, res) => {
  res.json(products.searchByName(req.query.q || ''));
});

router.get('/:id', (req, res) => {
  const product = products.getById(Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Not found' });
  res.json({ ...product, history: listByProduct(product.id) });
});

router.post('/', (req, res) => {
  products.assertValidProductInput(req.body);
  // Create the product with no stock, then record any initial stock as a purchase
  // so it's tracked. Both run in one DB transaction (better-sqlite3 nests the
  // inner transaction via a savepoint) so the product + its first purchase are atomic.
  const initialQty = Number(req.body.quantity) || 0;
  const result = getDb().transaction(() => {
    const product = products.create({ ...req.body, quantity: 0 });
    if (initialQty > 0) recordStockIn(product, initialQty);
    return products.getById(product.id);
  })();
  logActivity({ userId: req.user.id, username: req.user.username, action: 'create_product', entity: 'product', entityId: result.id, detail: { name: result.name } });
  res.status(201).json(result);
});

// Inventory "add stock" by barcode: restock an existing product, or create one
// and record its initial stock. (Not used by the current UI, but kept consistent.)
router.post('/add-stock', (req, res) => {
  const qty = Number.isFinite(Number(req.body.quantity)) ? Number(req.body.quantity) : 1;
  const barcode = req.body.barcode ? String(req.body.barcode).trim() : null;
  const existing = barcode ? products.findByBarcode(barcode) : null;
  const result = getDb().transaction(() => {
    const product = existing || products.create({ ...req.body, quantity: 0 });
    if (qty > 0) {
      const unitCost = paidUnitCost(req.body, product);
      recordStockIn(product, qty, unitCost);
      // Blend the new batch into the product's cost (only meaningful when restocking
      // existing stock; for a fresh product the average equals the entered cost).
      products.update(product.id, {
        buying_price: weightedAverageCost(product.quantity, product.buying_price, qty, unitCost),
      });
    }
    return products.getById(product.id);
  })();
  logActivity({ userId: req.user.id, username: req.user.username, action: 'restock_product', entity: 'product', entityId: result.id, detail: { name: result.name, quantity: qty } });
  res.status(201).json(result);
});

router.post('/:id/add-stock', (req, res) => {
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
    recordStockIn(product, qty, unitCost);
    products.update(product.id, {
      buying_price: weightedAverageCost(product.quantity, product.buying_price, qty, unitCost),
    });
    return products.getById(product.id);
  })();
  logActivity({ userId: req.user.id, username: req.user.username, action: 'restock_product', entity: 'product', entityId: result.id, detail: { name: result.name, quantity: qty } });
  res.json(result);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  products.assertValidProductInput(req.body, { id });
  const updated = products.update(id, req.body);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'update_product', entity: 'product', entityId: id, detail: { name: updated.name } });
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const ok = products.remove(id);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  logActivity({ userId: req.user.id, username: req.user.username, action: 'delete_product', entity: 'product', entityId: id });
  res.status(204).end();
});

router.post('/:id/image', (req, res, next) => {
  uploadProductImage(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const updated = products.update(Number(req.params.id), {
      image_path: uploadedUrl(req.file.filename),
    });
    if (!updated) return res.status(404).json({ error: 'Not found' });
    logActivity({ userId: req.user.id, username: req.user.username, action: 'update_product', entity: 'product', entityId: Number(req.params.id) });
    res.json(updated);
  });
});

export default router;
