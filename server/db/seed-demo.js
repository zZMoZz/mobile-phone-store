import { pathToFileURL } from 'node:url';
import { getDb } from './connection.js';
import { seed } from './seed.js';
import * as productsRepo from '../repositories/products.js';
import * as txnRepo from '../repositories/transactions.js';

// Returns a SQL datetime string `n` days ago (UTC, matches datetime('now')).
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 59), 0, 0);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

const PRODUCTS = [
  { name: 'Samsung Galaxy A54 (مستعمل)', cat: 'Used Phones', brand: 'Samsung', barcode: '6001', buying_price: 6500, selling_price: 7800, quantity: 3 },
  { name: 'iPhone 12 مستعمل', cat: 'Used Phones', brand: 'Apple', barcode: '6002', buying_price: 11000, selling_price: 13500, quantity: 2 },
  { name: 'Xiaomi Redmi Note 12', cat: 'Used Phones', brand: 'Xiaomi', barcode: '6003', buying_price: 4200, selling_price: 5300, quantity: 4 },
  { name: 'سماعة AirPods Pro', cat: 'Headphones', brand: 'Apple', barcode: '6004', buying_price: 1800, selling_price: 2500, quantity: 12 },
  { name: 'سماعة بلوتوث Samsung', cat: 'Headphones', brand: 'Samsung', barcode: '6005', buying_price: 600, selling_price: 950, quantity: 8 },
  { name: 'شاحن Anker سريع 25W', cat: 'Chargers & Cables', brand: 'Generic', barcode: '6006', buying_price: 250, selling_price: 420, quantity: 20 },
  { name: 'كابل Type-C', cat: 'Chargers & Cables', brand: 'Generic', barcode: '6007', buying_price: 40, selling_price: 90, quantity: 35 },
  { name: 'جراب iPhone 13', cat: 'Accessories', brand: 'Apple', barcode: '6008', buying_price: 60, selling_price: 150, quantity: 18 },
  { name: 'واقي شاشة زجاجي', cat: 'Accessories', brand: 'Generic', barcode: '6009', buying_price: 20, selling_price: 70, quantity: 40 },
  { name: 'مكبر صوت JBL Go', cat: 'Speakers', brand: 'Generic', barcode: '6010', buying_price: 700, selling_price: 1100, quantity: 6 },
  { name: 'شاشة Samsung A12', cat: 'Spare Parts', brand: 'Samsung', barcode: '6011', buying_price: 350, selling_price: 600, quantity: 5 },
  { name: 'بطارية iPhone 11', cat: 'Spare Parts', brand: 'Apple', barcode: '6012', buying_price: 280, selling_price: 500, quantity: 1 },
  { name: 'Power Bank 10000mAh', cat: 'Accessories', brand: 'Generic', barcode: '6013', buying_price: 320, selling_price: 550, quantity: 9 },
  { name: 'شاحن Oppo أصلي', cat: 'Chargers & Cables', brand: 'Oppo', barcode: '6014', buying_price: 180, selling_price: 300, quantity: 14 },
  { name: 'فلاشة USB 32GB', cat: 'Accessories', brand: 'Generic', barcode: '6015', buying_price: 90, selling_price: 160, quantity: 2 },
];

export function seedDemo() {
  seed(); // ensure schema + reference data (categories/brands/service types/settings)
  const db = getDb();

  // Clear transactional + product data, keep reference tables.
  db.exec('DELETE FROM transaction_items; DELETE FROM transactions; DELETE FROM products;');

  const cat = {};
  db.prepare('SELECT id, name_en FROM categories').all().forEach((c) => (cat[c.name_en] = c.id));
  const br = {};
  db.prepare('SELECT id, name_en FROM brands').all().forEach((b) => (br[b.name_en] = b.id));
  const svc = {};
  db.prepare('SELECT id, name_en FROM service_types').all().forEach((s) => (svc[s.name_en] = s.id));

  PRODUCTS.forEach((p) =>
    productsRepo.create({
      name: p.name,
      barcode: p.barcode,
      buying_price: p.buying_price,
      selling_price: p.selling_price,
      quantity: p.quantity,
      category_id: cat[p.cat],
      brand_id: br[p.brand],
    }),
  );

  // Record a transaction via the repository (correct stock/profit), then backdate it.
  const record = (payload, day) => {
    const txn = txnRepo.create(payload);
    db.prepare('UPDATE transactions SET created_at = ? WHERE id = ?').run(daysAgo(day), txn.id);
  };

  // Supplier restocks (purchases).
  record({ type: 'purchase', note: 'مورد - شحنة سماعات وكابلات', items: [
    { barcode: '6004', quantity: 10, unit_price: 1750 },
    { barcode: '6007', quantity: 50, unit_price: 38 },
  ] }, 25);
  record({ type: 'purchase', note: 'شراء هواتف مستعملة', items: [
    { barcode: '6001', quantity: 2, unit_price: 6400 },
    { barcode: '6003', quantity: 3, unit_price: 4100 },
  ] }, 18);

  // Sales spread across the last few weeks.
  const sales = [
    [{ barcode: '6006', quantity: 1 }, 20],
    [{ barcode: '6009', quantity: 3 }, 17],
    [{ barcode: '6004', quantity: 1 }, 15],
    [{ barcode: '6002', quantity: 1, unit_price: 13200 }, 13],
    [{ barcode: '6008', quantity: 2 }, 12],
    [{ barcode: '6007', quantity: 4 }, 10],
    [{ barcode: '6010', quantity: 1 }, 8],
    [{ barcode: '6013', quantity: 1 }, 6],
    [{ barcode: '6005', quantity: 2 }, 5],
    [{ barcode: '6014', quantity: 1 }, 3],
    [{ barcode: '6006', quantity: 2 }, 2],
    [{ barcode: '6009', quantity: 5 }, 1],
  ];
  sales.forEach(([item, day]) => record({ type: 'sale', items: [item] }, day));

  // A walk-in sale of an unregistered used phone (quick-add).
  record({ type: 'sale', note: 'هاتف مستعمل غير مسجّل', items: [
    { name: 'Nokia 5310 مستعمل', quantity: 1, unit_price: 900, unit_cost: 600 },
  ] }, 9);

  // Services.
  record({ type: 'service', service_type_id: svc['Phone Repair'], fee: 150, note: 'تغيير شاشة', items: [
    { barcode: '6011', quantity: 1 },
  ] }, 7);
  record({ type: 'service', service_type_id: svc['Phone Repair'], fee: 120, note: 'تغيير بطارية', items: [
    { barcode: '6012', quantity: 1 },
  ] }, 4);
  record({ type: 'service', service_type_id: svc['Bill Payment'], fee: 10, note: 'دفع فاتورة كهرباء', items: [] }, 2);
  record({ type: 'service', service_type_id: svc['Mobile Recharge'], fee: 5, note: 'شحن رصيد', items: [] }, 1);

  const counts = {
    products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    transactions: db.prepare('SELECT COUNT(*) c FROM transactions').get().c,
  };
  return counts;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const counts = seedDemo();
  console.log(`Demo data inserted: ${counts.products} products, ${counts.transactions} transactions.`);
}
