import { getDb } from '../db/connection.js';
import * as products from './products.js';
import * as services from './services.js';

/** Transaction history for a single product, most recent first. */
export function listByProduct(productId) {
  return getDb()
    .prepare(
      `SELECT t.id, t.type, t.created_at, t.note,
              ti.quantity, ti.unit_price, ti.unit_cost, ti.line_total
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       WHERE ti.product_id = ?
       ORDER BY t.created_at DESC, t.id DESC`,
    )
    .all(productId);
}

const PRODUCT_HISTORY_TYPES = new Set(['sale', 'purchase', 'return']);

/**
 * Paginated transaction history for a single product, with an optional type
 * filter. Returns { items, total, page, pageSize }. Each item carries the line's
 * quantity/prices plus the transaction's id, type, date, note and the user who
 * recorded it. Profit is derived per line on the client (qty * (price - cost)).
 */
export function historyByProduct(productId, query = {}) {
  const where = ['ti.product_id = @productId'];
  const params = { productId: Number(productId) };
  if (PRODUCT_HISTORY_TYPES.has(query.type)) {
    where.push('t.type = @type');
    params.type = query.type;
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 10));
  const offset = (page - 1) * pageSize;

  const total = getDb()
    .prepare(
      `SELECT COUNT(*) AS c
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       ${whereSql}`,
    )
    .get(params).c;

  const items = getDb()
    .prepare(
      `SELECT t.id, t.type, t.created_at, t.note, t.username_snapshot,
              ti.quantity, ti.unit_price, ti.unit_cost, ti.line_total
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       ${whereSql}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: pageSize, offset });

  return { items, total, page, pageSize };
}

export function getById(id) {
  const txn = getDb().prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!txn) return undefined;
  const items = getDb()
    .prepare(
      `SELECT ti.*, p.barcode, p.quantity AS current_stock
       FROM transaction_items ti
       LEFT JOIN products p ON p.id = ti.product_id
       WHERE ti.transaction_id = ? ORDER BY ti.id`,
    )
    .all(id);
  let serviceType = null;
  if (txn.service_type_id) {
    serviceType = getDb().prepare('SELECT * FROM service_types WHERE id = ?').get(txn.service_type_id);
  }
  const serviceData = txn.service_data ? JSON.parse(txn.service_data) : null;
  return { ...txn, items, service_type: serviceType, service_data: serviceData };
}

/**
 * Lists transactions with optional type/date filtering and pagination.
 * Returns { items, total, page, pageSize }. Each item includes its line items.
 */
export function list(query = {}) {
  const where = [];
  const params = {};
  if (query.type) {
    where.push('type = @type');
    params.type = query.type;
  }
  if (query.from) {
    where.push('created_at >= @from');
    params.from = query.from;
  }
  if (query.to) {
    where.push('created_at <= @to');
    params.to = query.to;
  }
  if (query.username) {
    where.push('username_snapshot = @username');
    params.username = query.username;
  }
  if (query.service_id) {
    where.push('service_id = @service_id');
    params.service_id = Number(query.service_id);
  }
  if (query.direction) {
    where.push("json_extract(service_data, '$.direction') = @direction");
    params.direction = query.direction;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const total = getDb().prepare(`SELECT COUNT(*) AS c FROM transactions ${whereSql}`).get(params).c;
  const agg = getDb()
    .prepare(`SELECT SUM(total) AS sum_total, SUM(profit) AS sum_profit FROM transactions ${whereSql}`)
    .get(params);
  const rows = getDb()
    .prepare(`SELECT * FROM transactions ${whereSql} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset });

  const itemsStmt = getDb().prepare('SELECT * FROM transaction_items WHERE transaction_id = ?');
  const items = rows.map((t) => ({ ...t, items: itemsStmt.all(t.id) }));

  return { items, total, page, pageSize, sumTotal: agg?.sum_total ?? 0, sumProfit: agg?.sum_profit ?? 0 };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Resolves a line item to a product. Order of preference:
 *  1. product_id
 *  2. existing product by barcode
 *  3. null — free-form line with no inventory record
 * Returns { product } where product may be null.
 */
function resolveProduct(item) {
  if (item.product_id) {
    const p = products.getById(item.product_id);
    if (!p) {
      const err = new Error(`Product ${item.product_id} not found`);
      err.status = 400;
      throw err;
    }
    return { product: p };
  }

  const barcode = item.barcode ? String(item.barcode).trim() : null;
  if (barcode) {
    const existing = products.findByBarcode(barcode);
    if (existing) return { product: existing };
  }

  return { product: null };
}

// Builds + inserts a service transaction. `payload.cost` is what the customer pays
// (stored as `total`); `payload.profit` is the profit entered directly by the user.
// cost_total is derived: total − profit.
function createServiceTransaction(payload, user) {
  const service = services.getById(Number(payload.service_id));
  if (!service) {
    const err = new Error('Service not found');
    err.status = 400;
    err.code = 'service_missing';
    throw err;
  }
  const total = round2(payload.cost);
  if (!(total > 0)) {
    const err = new Error('Cost must be greater than 0');
    err.status = 400;
    err.code = 'service_cost_positive';
    throw err;
  }
  const profit = round2(payload.profit ?? 0);
  const costTotal = round2(total - profit);
  // 'out' services (e.g. Withdraw) pay money to the customer; negate so they
  // reduce totals instead of inflating them. Profit stays positive — it's the fee.
  const sign = service.direction === 'out' ? -1 : 1;
  const signedTotal = round2(total * sign);
  const signedCostTotal = round2(costTotal * sign);

  const values = payload.field_values || {};
  const snapshotFields = service.fields.map((f) => {
    const raw = values[f.key];
    const value = raw == null ? '' : String(raw).trim();
    if (f.required && !value) {
      const err = new Error(`Field "${f.label_en}" is required`);
      err.status = 400;
      err.code = 'service_field_required';
      throw err;
    }
    return { label_en: f.label_en, label_ar: f.label_ar, value };
  });

  const serviceData = JSON.stringify({
    service_id: service.id,
    service_name: service.name_en,
    service_name_ar: service.name_ar,
    shortcut_id: payload.shortcut_id ? Number(payload.shortcut_id) : null,
    fields: snapshotFields,
    cost: total,
    profit,
    direction: service.direction ?? 'in',
  });

  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO transactions
         (type, service_id, service_data, note, subtotal, fee, cost_total, total, profit, user_id, username_snapshot)
       VALUES ('service', @service_id, @service_data, @note, 0, 0, @cost_total, @total, @profit, @user_id, @username_snapshot)`,
    )
    .run({
      service_id: service.id,
      service_data: serviceData,
      note: payload.note || null,
      total: signedTotal,
      cost_total: signedCostTotal,
      profit,
      user_id: user?.id ?? null,
      username_snapshot: user?.username ?? null,
    });
  return getById(info.lastInsertRowid);
}

// Builds + inserts an expense transaction: a money-out event that isn't inventory
// (e.g. shop rent). Productless — no line items, no stock change, no profit.
// `payload.amount` is what was paid (stored as `total`); `payload.label` is what it
// was for (stored in `service_data` as JSON so reports can group/display it).
function createExpenseTransaction(payload, user) {
  const total = round2(payload.amount);
  if (!(total > 0)) {
    const err = new Error('Amount must be greater than 0');
    err.status = 400;
    err.code = 'expense_amount_positive';
    throw err;
  }
  const label = payload.label ? String(payload.label).trim() : '';
  if (!label) {
    const err = new Error('Label is required');
    err.status = 400;
    err.code = 'expense_label_required';
    throw err;
  }

  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO transactions
         (type, service_data, note, subtotal, fee, cost_total, total, profit, user_id, username_snapshot)
       VALUES ('expense', @service_data, @note, 0, 0, 0, @total, 0, @user_id, @username_snapshot)`,
    )
    .run({
      service_data: JSON.stringify({ label }),
      note: payload.note || null,
      total,
      user_id: user?.id ?? null,
      username_snapshot: user?.username ?? null,
    });
  return getById(info.lastInsertRowid);
}

/**
 * Records a transaction atomically: inserts the transaction + line items,
 * adjusts product stock, and computes totals/profit.
 *
 * payload = {
 *   type: 'purchase' | 'sale' | 'service',
 *   note?, service_type_id?, fee?,
 *   items: [{ product_id?|barcode?|name?, quantity, unit_price, unit_cost? }]
 * }
 */
export function create(payload, user) {
  const type = payload.type;
  if (!['purchase', 'sale', 'service', 'return', 'expense'].includes(type)) {
    const err = new Error('Invalid transaction type');
    err.status = 400;
    throw err;
  }
  if (type === 'service') return createServiceTransaction(payload, user);
  if (type === 'expense') return createExpenseTransaction(payload, user);
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const fee = type === 'service' ? round2(payload.fee) : 0;

  if (rawItems.length === 0 && type !== 'service') {
    const err = new Error('Transaction must have at least one item');
    err.status = 400;
    throw err;
  }

  const db = getDb();
  const run = db.transaction(() => {
    const txnInfo = db
      .prepare(
        `INSERT INTO transactions
           (type, service_type_id, note, subtotal, fee, cost_total, total, profit, user_id, username_snapshot)
         VALUES (@type, @service_type_id, @note, 0, @fee, 0, 0, 0, @user_id, @username_snapshot)`,
      )
      .run({
        type,
        service_type_id: payload.service_type_id || null,
        note: payload.note || null,
        fee,
        user_id: user?.id ?? null,
        username_snapshot: user?.username ?? null,
      });
    const transactionId = txnInfo.lastInsertRowid;

    const itemStmt = db.prepare(
      `INSERT INTO transaction_items
       (transaction_id, product_id, name_snapshot, quantity, unit_price, unit_cost, line_total)
       VALUES (@transaction_id, @product_id, @name_snapshot, @quantity, @unit_price, @unit_cost, @line_total)`,
    );

    let subtotal = 0;
    let costTotal = 0;

    for (const item of rawItems) {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const { product } = resolveProduct(item);

      const unitPrice = round2(item.unit_price ?? product?.selling_price ?? 0);
      // Cost basis (COGS). For a sale/return of a KNOWN product it must be the
      // product's CURRENT average buying price at record time — never a stale
      // client snapshot (a restock between adding the line and recording can move
      // the average). Purchases carry the batch cost the user entered; unregistered/
      // manual lines carry their typed cost.
      let unitCost;
      if (type === 'purchase') {
        unitCost = item.unit_cost != null ? round2(item.unit_cost) : unitPrice;
      } else if (product) {
        unitCost = round2(product.buying_price ?? 0);
      } else {
        unitCost = round2(item.unit_cost ?? 0);
      }
      const lineTotal = round2(unitPrice * quantity);

      itemStmt.run({
        transaction_id: transactionId,
        product_id: product?.id ?? null,
        name_snapshot: product?.name ?? item.name ?? 'Unregistered item',
        quantity,
        unit_price: unitPrice,
        unit_cost: unitCost,
        line_total: lineTotal,
      });

      subtotal += lineTotal;
      costTotal += round2(unitCost * quantity);

      if (product) {
        if (type === 'purchase' || type === 'return') {
          products.adjustQuantity(product.id, quantity);
        } else {
          // Live stock guard: re-check the product's CURRENT quantity at record
          // time (the cart's stock figure may be stale) and block a sale that
          // would oversell a real, in-stock product. Temporary/quick-add items
          // are "never really in stock" and are left untouched.
          if (!product.is_temporary && product.quantity < quantity) {
            const err = new Error(
              `Not enough stock for "${product.name}": ${product.quantity} available, ${quantity} requested`,
            );
            err.status = 400;
            err.code = 'insufficient_stock';
            err.params = { name: product.name, available: product.quantity, requested: quantity };
            throw err;
          }
          products.adjustQuantity(product.id, -quantity);
        }
      }
    }

    subtotal = round2(subtotal);
    costTotal = round2(costTotal);

    // Totals & profit by type.
    let total;
    let profit;
    if (type === 'purchase') {
      total = subtotal;
      profit = 0;
    } else if (type === 'return') {
      total = subtotal;
      profit = round2(costTotal - total); // negative: inventory cost restored minus refund paid
    } else if (type === 'service') {
      total = round2(subtotal + fee);
      profit = round2(total - costTotal);
    } else {
      total = subtotal;
      profit = round2(total - costTotal);
    }

    db.prepare(
      `UPDATE transactions SET subtotal = ?, cost_total = ?, total = ?, profit = ? WHERE id = ?`,
    ).run(subtotal, costTotal, total, profit, transactionId);

    return transactionId;
  });

  const id = run();
  return getById(id);
}
