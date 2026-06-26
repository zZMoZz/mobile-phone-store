import { getDb } from '../db/connection.js';
import { get as getSettings } from './settings.js';

// Columns clients are allowed to sort by -> actual SQL expressions.
const SORT_COLUMNS = {
  name: 'p.name',
  quantity: 'p.quantity',
  selling_price: 'p.selling_price',
  buying_price: 'p.buying_price',
  updated_at: 'p.updated_at',
  created_at: 'p.created_at',
};

const SELECT_WITH_NAMES = `
  SELECT p.*, c.name_en AS category_name_en, c.name_ar AS category_name_ar,
         b.name_en AS brand_name_en, b.name_ar AS brand_name_ar
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id
`;

function touch(id) {
  getDb().prepare("UPDATE products SET updated_at = datetime('now') WHERE id = ?").run(id);
}

export function getById(id) {
  return getDb().prepare(`${SELECT_WITH_NAMES} WHERE p.id = ?`).get(id);
}

export function findByBarcode(barcode) {
  if (!barcode) return undefined;
  return getDb().prepare(`${SELECT_WITH_NAMES} WHERE p.barcode = ?`).get(barcode);
}

export function searchByName(query) {
  if (!query) return [];
  return getDb()
    .prepare(`${SELECT_WITH_NAMES} WHERE p.is_temporary = 0 AND p.name LIKE ? ORDER BY p.name LIMIT 10`)
    .all(`%${query}%`);
}

/**
 * Validates manual product input (the product form / API). Enforces a unique
 * name (case-insensitive, excluding temporary quick-add items), positive prices,
 * and a required category and brand. NOT applied to the transaction quick-add
 * path, so recording sales/purchases of unregistered items stays unaffected.
 * Throws an Error with `.status` (400/409).
 */
export function assertValidProductInput(data, { id = null } = {}) {
  const fail = (status, message, code) => {
    const err = new Error(message);
    err.status = status;
    err.code = code;
    throw err;
  };

  const name = (data.name || '').trim();
  if (!name) fail(400, 'Product name is required', 'product_name_required');

  const dup = getDb()
    .prepare(
      `SELECT id FROM products
       WHERE is_temporary = 0 AND lower(trim(name)) = lower(@name) AND id != @id`,
    )
    .get({ name, id: id ?? -1 });
  if (dup) fail(409, 'A product with this name already exists', 'product_name_taken');

  if (!(Number(data.buying_price) > 0)) fail(400, 'Buying price must be greater than 0', 'buying_price_positive');
  if (!(Number(data.selling_price) > 0)) fail(400, 'Selling price must be greater than 0', 'selling_price_positive');
  if (!data.category_id) fail(400, 'Category is required', 'category_required');
  if (!data.brand_id) fail(400, 'Brand is required', 'brand_required');
}

export function create(data) {
  const name = (data.name || '').trim();
  if (!name) {
    const err = new Error('Product name is required');
    err.status = 400;
    err.code = 'product_name_required';
    throw err;
  }
  const barcode = data.barcode ? String(data.barcode).trim() : null;
  if (barcode && findByBarcode(barcode)) {
    const err = new Error('A product with this barcode already exists');
    err.status = 409;
    err.code = 'barcode_taken';
    throw err;
  }
  const info = getDb()
    .prepare(
      `INSERT INTO products
       (name, description, buying_price, selling_price, image_path, category_id, brand_id, quantity, barcode, is_temporary)
       VALUES (@name, @description, @buying_price, @selling_price, @image_path, @category_id, @brand_id, @quantity, @barcode, @is_temporary)`,
    )
    .run({
      name,
      description: data.description || null,
      buying_price: Number(data.buying_price) || 0,
      selling_price: Number(data.selling_price) || 0,
      image_path: data.image_path || null,
      category_id: data.category_id || null,
      brand_id: data.brand_id || null,
      quantity: Number.isFinite(Number(data.quantity)) ? Number(data.quantity) : 0,
      barcode,
      is_temporary: data.is_temporary ? 1 : 0,
    });
  return getById(info.lastInsertRowid);
}

// `quantity` is intentionally NOT updatable here: stock only changes through
// tracked flows (purchase/sale transactions via adjustQuantity), never a direct
// overwrite, so the audit trail stays complete.
const UPDATABLE = [
  'name',
  'description',
  'buying_price',
  'selling_price',
  'image_path',
  'category_id',
  'brand_id',
  'barcode',
  'is_temporary',
];

export function update(id, data) {
  const existing = getById(id);
  if (!existing) return undefined;

  if (data.barcode) {
    const other = findByBarcode(String(data.barcode).trim());
    if (other && other.id !== id) {
      const err = new Error('A product with this barcode already exists');
      err.status = 409;
      err.code = 'barcode_taken';
      throw err;
    }
  }

  const fields = [];
  const params = { id };
  for (const key of UPDATABLE) {
    if (key in data) {
      fields.push(`${key} = @${key}`);
      if (['buying_price', 'selling_price'].includes(key)) {
        params[key] = Number(data[key]) || 0;
      } else if (key === 'is_temporary') {
        params[key] = data[key] ? 1 : 0;
      } else if (key === 'barcode') {
        params[key] = data[key] ? String(data[key]).trim() : null;
      } else {
        params[key] = data[key] ?? null;
      }
    }
  }
  if (fields.length) {
    fields.push("updated_at = datetime('now')");
    getDb().prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = @id`).run(params);
  }
  return getById(id);
}

export function remove(id) {
  return getDb().prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
}

/**
 * Deletes many products at once (atomic). transaction_items.product_id is
 * ON DELETE SET NULL, so historical lines keep their snapshots. Returns the
 * number of rows actually deleted.
 */
export function removeMany(ids) {
  const list = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (list.length === 0) return 0;
  const stmt = getDb().prepare('DELETE FROM products WHERE id = ?');
  const run = getDb().transaction((rows) => {
    let n = 0;
    for (const id of rows) n += stmt.run(id).changes;
    return n;
  });
  return run(list);
}

/**
 * Of the given product ids, how many still hold stock and how many total units.
 * Used to warn before deleting products that still have inventory.
 */
export function stockStatus(ids) {
  const list = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (list.length === 0) return { inStock: 0, units: 0 };
  const placeholders = list.map(() => '?').join(',');
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS inStock, COALESCE(SUM(quantity), 0) AS units
         FROM products WHERE id IN (${placeholders}) AND quantity > 0`,
    )
    .get(...list);
  return { inStock: row.inStock, units: row.units };
}

/**
 * Reassigns category and/or brand for many products at once (atomic). Only the
 * provided fields are changed; omitted fields are left as-is. Returns the count
 * of products updated.
 */
export function setReferences(ids, { category_id, brand_id } = {}) {
  const list = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  const sets = [];
  const base = {};
  if (category_id !== undefined) {
    sets.push('category_id = @category_id');
    base.category_id = category_id ?? null;
  }
  if (brand_id !== undefined) {
    sets.push('brand_id = @brand_id');
    base.brand_id = brand_id ?? null;
  }
  if (list.length === 0 || sets.length === 0) return 0;
  sets.push("updated_at = datetime('now')");
  const stmt = getDb().prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = @id`);
  const run = getDb().transaction((rows) => {
    let n = 0;
    for (const id of rows) n += stmt.run({ ...base, id }).changes;
    return n;
  });
  return run(list);
}

/**
 * Adjusts a product's quantity by `delta` (can be negative). The single place
 * stock changes — driven only by purchase/sale transactions. Returns the product.
 */
export function adjustQuantity(id, delta) {
  getDb()
    .prepare('UPDATE products SET quantity = quantity + ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(delta, id);
  return getById(id);
}

/**
 * Lists products with search, filtering, sorting, and pagination.
 * Returns { items, total, page, pageSize }.
 */
/**
 * Builds the shared WHERE conditions for product filtering. Used by both list()
 * and summary() so the stats always reflect the same filtered set shown in the
 * table. All conditions use the `p` table alias.
 */
function buildProductFilters(query = {}) {
  const where = [];
  const params = {};

  if (query.search) {
    where.push('(p.name LIKE @search OR p.barcode LIKE @search)');
    params.search = `%${query.search}%`;
  }
  if (query.category) {
    where.push('p.category_id = @category');
    params.category = Number(query.category);
  }
  if (query.brand) {
    where.push('p.brand_id = @brand');
    params.brand = Number(query.brand);
  }
  if (query.minPrice != null && query.minPrice !== '') {
    where.push('p.selling_price >= @minPrice');
    params.minPrice = Number(query.minPrice);
  }
  if (query.maxPrice != null && query.maxPrice !== '') {
    where.push('p.selling_price <= @maxPrice');
    params.maxPrice = Number(query.maxPrice);
  }
  if (query.inStock === 'true' || query.inStock === true) {
    where.push('p.quantity > 0');
  }
  if (query.minQty != null && query.minQty !== '') {
    where.push('p.quantity >= @minQty');
    params.minQty = Number(query.minQty);
  }
  if (query.maxQty != null && query.maxQty !== '') {
    where.push('p.quantity <= @maxQty');
    params.maxQty = Number(query.maxQty);
  }
  if (query.lowStock === 'true' || query.lowStock === true) {
    // Mirrors the low-stock count in summary(): real products at or below the
    // configured threshold.
    where.push('p.quantity <= @lowStockThreshold AND p.is_temporary = 0');
    params.lowStockThreshold = getSettings()?.low_stock_threshold ?? 3;
  }
  if (query.from) {
    where.push('p.created_at >= @from');
    params.from = query.from;
  }
  if (query.to) {
    where.push('p.created_at <= @to');
    params.to = query.to;
  }

  return { where, params };
}

export function list(query = {}) {
  const { where, params } = buildProductFilters(query);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const sortCol = SORT_COLUMNS[query.sort] || SORT_COLUMNS.updated_at;
  const order = String(query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  const total = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM products p ${whereSql}`)
    .get(params).c;

  const items = getDb()
    .prepare(
      `${SELECT_WITH_NAMES} ${whereSql} ORDER BY ${sortCol} ${order} LIMIT @limit OFFSET @offset`,
    )
    .all({ ...params, limit: pageSize, offset });

  return { items, total, page, pageSize };
}

/**
 * Returns the ids of ALL products matching the given filters (no pagination).
 * Used by the inventory "select all matching" action across pages.
 */
export function listIds(query = {}) {
  const { where, params } = buildProductFilters(query);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return getDb()
    .prepare(`SELECT id FROM products p ${whereSql}`)
    .all(params)
    .map((r) => r.id);
}

/**
 * Inventory summary: total stock units, unique product count, total inventory
 * value (by buying and selling price). Optionally scoped to a created_at range.
 */
export function summary(query = {}) {
  const { where, params } = buildProductFilters(query);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*) AS unique_products,
         COALESCE(SUM(p.quantity), 0) AS total_units,
         COALESCE(SUM(p.quantity * p.buying_price), 0) AS inventory_cost_value,
         COALESCE(SUM(p.quantity * p.selling_price), 0) AS inventory_sell_value
       FROM products p ${whereSql}`,
    )
    .get(params);

  // Low-stock count within the same filtered set (real products at or below the
  // configured threshold).
  const threshold = getSettings()?.low_stock_threshold ?? 3;
  const lowWhere = [...where, 'p.quantity <= @lowThreshold', 'p.is_temporary = 0'];
  row.low_stock_count = getDb()
    .prepare(`SELECT COUNT(*) AS c FROM products p WHERE ${lowWhere.join(' AND ')}`)
    .get({ ...params, lowThreshold: threshold }).c;
  row.low_stock_threshold = threshold;
  return row;
}
