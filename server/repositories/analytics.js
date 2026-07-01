import { getDb } from '../db/connection.js';
import { get as getSettings } from './settings.js';

/**
 * Aggregated analytics for the dashboard, scoped to an optional date range.
 * granularity: 'day' (default) or 'month' for the trend buckets.
 */
export function overview(query = {}) {
  const db = getDb();
  const where = ['voided_at IS NULL'];
  const params = {};
  if (query.from) {
    where.push('created_at >= @from');
    params.from = query.from;
  }
  if (query.to) {
    where.push('created_at <= @to');
    params.to = query.to;
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  // Totals by type.
  const totalsRows = db
    .prepare(
      `SELECT type,
              COALESCE(SUM(total), 0) AS total,
              COALESCE(SUM(profit), 0) AS profit,
              COUNT(*) AS count
       FROM transactions ${whereSql} GROUP BY type`,
    )
    .all(params);

  const totals = { sales: 0, profit: 0, purchases: 0, services: 0, expenses: 0, count: 0 };
  for (const r of totalsRows) {
    totals.count += r.count;
    if (r.type === 'sale') {
      totals.sales += r.total;
      totals.profit += r.profit;
    } else if (r.type === 'purchase') {
      totals.purchases += r.total;
    } else if (r.type === 'service') {
      totals.services += r.total;
    } else if (r.type === 'expense') {
      totals.expenses += r.total;
    }
  }

  // Trend buckets (sales + profit from product sales only).
  const fmt = query.granularity === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const trend = db
    .prepare(
      `SELECT strftime('${fmt}', created_at) AS bucket,
              COALESCE(SUM(CASE WHEN type = 'sale' THEN total ELSE 0 END), 0) AS sales,
              COALESCE(SUM(CASE WHEN type = 'sale' THEN profit ELSE 0 END), 0) AS profit
       FROM transactions ${whereSql}
       GROUP BY bucket ORDER BY bucket`,
    )
    .all(params);

  // Top selling products by units sold within the range.
  const topProducts = db
    .prepare(
      `SELECT ti.name_snapshot AS name,
              SUM(ti.quantity) AS qty,
              SUM(ti.line_total) AS revenue
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       WHERE t.voided_at IS NULL AND t.type IN ('sale','service') ${query.from ? 'AND t.created_at >= @from' : ''} ${query.to ? 'AND t.created_at <= @to' : ''}
       GROUP BY ti.name_snapshot
       ORDER BY qty DESC
       LIMIT 5`,
    )
    .all(params);

  // Top purchased products (from purchase transactions).
  const topBuyingProducts = db
    .prepare(
      `SELECT ti.name_snapshot AS name,
              SUM(ti.quantity) AS qty,
              SUM(ti.line_total) AS total
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       WHERE t.voided_at IS NULL AND t.type = 'purchase' ${query.from ? 'AND t.created_at >= @from' : ''} ${query.to ? 'AND t.created_at <= @to' : ''}
       GROUP BY ti.name_snapshot
       ORDER BY qty DESC
       LIMIT 5`,
    )
    .all(params);

  // Top returned products (from return transactions).
  const topReturningProducts = db
    .prepare(
      `SELECT ti.name_snapshot AS name,
              SUM(ti.quantity) AS qty
       FROM transaction_items ti
       JOIN transactions t ON t.id = ti.transaction_id
       WHERE t.voided_at IS NULL AND t.type = 'return' ${query.from ? 'AND t.created_at >= @from' : ''} ${query.to ? 'AND t.created_at <= @to' : ''}
       GROUP BY ti.name_snapshot
       ORDER BY qty DESC
       LIMIT 5`,
    )
    .all(params);

  // Top selling services by transaction count.
  const topServices = db
    .prepare(
      `SELECT s.name_en, s.name_ar,
              COUNT(*) AS count,
              SUM(t.total) AS revenue
       FROM transactions t
       JOIN services s ON s.id = t.service_id
       WHERE t.voided_at IS NULL AND t.type = 'service' ${query.from ? 'AND t.created_at >= @from' : ''} ${query.to ? 'AND t.created_at <= @to' : ''}
       GROUP BY s.id
       ORDER BY count DESC
       LIMIT 5`,
    )
    .all(params);

  const threshold = getSettings()?.low_stock_threshold ?? 3;
  const lowStockTotal = db
    .prepare(`SELECT COUNT(*) AS c FROM products WHERE quantity <= ? AND is_temporary = 0`)
    .get(threshold).c;

  return { totals, trend, topProducts, topBuyingProducts, topReturningProducts, topServices, lowStockTotal, lowStockThreshold: threshold };
}

export function lowStockList({ page = 1, pageSize = 10 } = {}) {
  const db = getDb();
  const threshold = getSettings()?.low_stock_threshold ?? 3;
  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM products WHERE quantity <= ? AND is_temporary = 0`)
    .get(threshold).c;
  const items = db
    .prepare(
      `SELECT id, name, quantity FROM products
       WHERE quantity <= ? AND is_temporary = 0
       ORDER BY quantity ASC LIMIT ? OFFSET ?`,
    )
    .all(threshold, pageSize, (page - 1) * pageSize);
  return { items, total, threshold };
}
