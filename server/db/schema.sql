-- Mobile Phone Store — SQLite schema
-- Idempotent: safe to run repeatedly (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS categories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en   TEXT NOT NULL,
  name_ar   TEXT NOT NULL,
  is_protected INTEGER NOT NULL DEFAULT 0   -- 1 = default item (e.g. Generic), can't be deleted
);

CREATE TABLE IF NOT EXISTS brands (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en   TEXT NOT NULL,
  name_ar   TEXT NOT NULL,
  is_protected INTEGER NOT NULL DEFAULT 0   -- 1 = default item (e.g. Generic), can't be deleted
);

CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,                 -- Arabic or English, free-form
  description   TEXT,
  buying_price  REAL NOT NULL DEFAULT 0,       -- reference cost
  selling_price REAL NOT NULL DEFAULT 0,
  image_path    TEXT,                          -- relative URL; NULL => default image
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  brand_id      INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  quantity      INTEGER NOT NULL DEFAULT 0,
  barcode       TEXT UNIQUE,                   -- nullable; unique when present
  is_temporary  INTEGER NOT NULL DEFAULT 0,    -- 1 = quick-added during a sale
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);

CREATE TABLE IF NOT EXISTS service_types (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name_en        TEXT NOT NULL,
  name_ar        TEXT NOT NULL,
  default_fee    REAL NOT NULL DEFAULT 0,
  consumes_parts INTEGER NOT NULL DEFAULT 0    -- 1 = repair that may pull spare parts
);

CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  type            TEXT NOT NULL CHECK (type IN ('purchase','sale','service')),
  service_type_id INTEGER REFERENCES service_types(id) ON DELETE SET NULL,
  note            TEXT,
  subtotal        REAL NOT NULL DEFAULT 0,     -- sum of item line totals
  fee             REAL NOT NULL DEFAULT 0,     -- service fee (service transactions)
  cost_total      REAL NOT NULL DEFAULT 0,     -- total cost of goods involved
  total           REAL NOT NULL DEFAULT 0,     -- amount charged/paid
  profit          REAL NOT NULL DEFAULT 0,     -- total - cost_total (sale/service)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);

CREATE TABLE IF NOT EXISTS transaction_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name_snapshot  TEXT NOT NULL,                -- product name at time of transaction
  quantity       INTEGER NOT NULL DEFAULT 1,
  unit_price     REAL NOT NULL DEFAULT 0,      -- actual price for this line
  unit_cost      REAL NOT NULL DEFAULT 0,      -- actual cost for this line
  line_total     REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_txn_items_txn ON transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_txn_items_product ON transaction_items(product_id);

CREATE TABLE IF NOT EXISTS settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  currency         TEXT NOT NULL DEFAULT 'EGP',
  default_language TEXT NOT NULL DEFAULT 'ar',
  default_theme    TEXT NOT NULL DEFAULT 'light',
  store_name_en    TEXT NOT NULL DEFAULT 'My Store',
  store_name_ar    TEXT NOT NULL DEFAULT 'متجري',
  backup_dir       TEXT NOT NULL DEFAULT '',
  low_stock_threshold INTEGER NOT NULL DEFAULT 3
);
