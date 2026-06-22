import { Router } from 'express';
import { getDb } from '../db/connection.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { logActivity } from '../repositories/activityLogs.js';
import { createBackup } from '../lib/backup.js';
import { toCsv } from '../lib/csv.js';

const router = Router();

// Trigger a database backup (copy of the SQLite file).
router.post('/backup', requireAdmin, async (req, res, next) => {
  try {
    const result = await createBackup(req.body?.dir || undefined);
    logActivity({ userId: req.user.id, username: req.user.username, action: 'create_backup' });
    res.json({ ok: true, file: result.fileName });
  } catch (err) {
    next(err);
  }
});

function sendCsv(res, name, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(csv);
}

router.get('/export/products.csv', requireAdmin, (req, res) => {
  const ar = req.query.lang === 'ar';
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.name, p.barcode, p.quantity, p.buying_price, p.selling_price,
              c.name_en AS category_en, c.name_ar AS category_ar,
              b.name_en AS brand_en,    b.name_ar AS brand_ar,
              p.is_temporary, p.created_at, p.updated_at
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b    ON b.id = p.brand_id
       ORDER BY p.id`,
    )
    .all()
    .map(r => ({
      ...r,
      category: ar ? r.category_ar : r.category_en,
      brand:    ar ? r.brand_ar    : r.brand_en,
    }));
  const columns = ar
    ? [
        { key: 'id',            label: 'المعرف' },
        { key: 'name',          label: 'الاسم' },
        { key: 'barcode',       label: 'الباركود' },
        { key: 'quantity',      label: 'الكمية' },
        { key: 'buying_price',  label: 'سعر الشراء' },
        { key: 'selling_price', label: 'سعر البيع' },
        { key: 'category',      label: 'الفئة' },
        { key: 'brand',         label: 'الماركة' },
        { key: 'is_temporary',  label: 'مؤقت' },
        { key: 'created_at',    label: 'تاريخ الإضافة' },
        { key: 'updated_at',    label: 'تاريخ التعديل' },
      ]
    : [
        { key: 'id',            label: 'ID' },
        { key: 'name',          label: 'Name' },
        { key: 'barcode',       label: 'Barcode' },
        { key: 'quantity',      label: 'Quantity' },
        { key: 'buying_price',  label: 'Buying Price' },
        { key: 'selling_price', label: 'Selling Price' },
        { key: 'category',      label: 'Category' },
        { key: 'brand',         label: 'Brand' },
        { key: 'is_temporary',  label: 'Temporary' },
        { key: 'created_at',    label: 'Created' },
        { key: 'updated_at',    label: 'Updated' },
      ];
  const csv = toCsv(rows, columns);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'export_products' });
  sendCsv(res, ar ? 'products-ar.csv' : 'products.csv', csv);
});

router.get('/export/transactions.csv', requireAdmin, (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT t.id, t.type, t.created_at, t.subtotal, t.fee, t.cost_total, t.total, t.profit,
              ti.name_snapshot AS item, ti.quantity, ti.unit_price, ti.line_total
       FROM transactions t
       LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
       ORDER BY t.id, ti.id`,
    )
    .all();
  const csv = toCsv(rows, [
    { key: 'id', label: 'Txn ID' },
    { key: 'type', label: 'Type' },
    { key: 'created_at', label: 'Date' },
    { key: 'item', label: 'Item' },
    { key: 'quantity', label: 'Qty' },
    { key: 'unit_price', label: 'Unit Price' },
    { key: 'line_total', label: 'Line Total' },
    { key: 'fee', label: 'Fee' },
    { key: 'total', label: 'Total' },
    { key: 'profit', label: 'Profit' },
  ]);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'export_transactions' });
  sendCsv(res, 'transactions.csv', csv);
});

export default router;
