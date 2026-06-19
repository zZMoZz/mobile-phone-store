import { getDb } from '../db/connection.js';
import * as products from './products.js';

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

export function getById(id) {
  const txn = getDb().prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!txn) return undefined;
  const items = getDb()
    .prepare('SELECT * FROM transaction_items WHERE transaction_id = ? ORDER BY id')
    .all(id);
  let serviceType = null;
  if (txn.service_type_id) {
    serviceType = getDb().prepare('SELECT * FROM service_types WHERE id = ?').get(txn.service_type_id);
  }
  return { ...txn, items, service_type: serviceType };
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
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const total = getDb().prepare(`SELECT COUNT(*) AS c FROM transactions ${whereSql}`).get(params).c;
  const rows = getDb()
    .prepare(`SELECT * FROM transactions ${whereSql} ORDER BY created_at DESC, id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: pageSize, offset });

  const itemsStmt = getDb().prepare('SELECT * FROM transaction_items WHERE transaction_id = ?');
  const items = rows.map((t) => ({ ...t, items: itemsStmt.all(t.id) }));

  return { items, total, page, pageSize };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Resolves a line item to a product. Order of preference:
 *  1. product_id
 *  2. existing product by barcode
 *  3. create a new product (temporary for sales/services, normal for purchases)
 * Returns { product, created, isTemporary }.
 */
function resolveProduct(item, type) {
  if (item.product_id) {
    const p = products.getById(item.product_id);
    if (!p) {
      const err = new Error(`Product ${item.product_id} not found`);
      err.status = 400;
      throw err;
    }
    return { product: p, created: false };
  }

  const barcode = item.barcode ? String(item.barcode).trim() : null;
  if (barcode) {
    const existing = products.findByBarcode(barcode);
    if (existing) return { product: existing, created: false };
  }

  // No matching product: create one. Quick-add temp record for sales/services
  // (e.g. a used phone never stocked); a real product for purchases.
  const isTemporary = type !== 'purchase';
  const created = products.create({
    name: item.name || 'Unregistered item',
    barcode,
    selling_price: item.unit_price || 0,
    buying_price: item.unit_cost || 0,
    quantity: 0,
    is_temporary: isTemporary,
  });
  return { product: created, created: true, isTemporary };
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
export function create(payload) {
  const type = payload.type;
  if (!['purchase', 'sale', 'service'].includes(type)) {
    const err = new Error('Invalid transaction type');
    err.status = 400;
    throw err;
  }
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
        `INSERT INTO transactions (type, service_type_id, note, subtotal, fee, cost_total, total, profit)
         VALUES (@type, @service_type_id, @note, 0, @fee, 0, 0, 0)`,
      )
      .run({
        type,
        service_type_id: payload.service_type_id || null,
        note: payload.note || null,
        fee,
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
      const { product, created, isTemporary } = resolveProduct(item, type);

      const unitPrice = round2(item.unit_price ?? product.selling_price);
      const unitCost =
        item.unit_cost != null
          ? round2(item.unit_cost)
          : type === 'purchase'
            ? unitPrice
            : round2(product.buying_price);
      const lineTotal = round2(unitPrice * quantity);

      itemStmt.run({
        transaction_id: transactionId,
        product_id: product.id,
        name_snapshot: product.name,
        quantity,
        unit_price: unitPrice,
        unit_cost: unitCost,
        line_total: lineTotal,
      });

      subtotal += lineTotal;
      costTotal += round2(unitCost * quantity);

      // Stock movement. Newly quick-added temp products were created with qty 0
      // and were never really in stock, so don't drive them negative.
      if (type === 'purchase') {
        products.adjustQuantity(product.id, quantity);
      } else if (!(created && isTemporary)) {
        products.adjustQuantity(product.id, -quantity);
      }
    }

    subtotal = round2(subtotal);
    costTotal = round2(costTotal);

    // Totals & profit by type.
    let total;
    let profit;
    if (type === 'purchase') {
      total = subtotal;
      profit = 0; // purchases are an expense, not profit
    } else if (type === 'service') {
      total = round2(subtotal + fee);
      profit = round2(total - costTotal); // fee + parts margin
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
