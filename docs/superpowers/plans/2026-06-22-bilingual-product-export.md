# Bilingual Product Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export Products now downloads two CSVs automatically — one with English headers/names and one with Arabic headers/names.

**Architecture:** Add `?lang=ar` to the existing products export route; the server picks `name_ar` for category/brand and swaps column labels. The client fetches both variants in parallel and triggers two silent blob downloads. A new info Alert in Settings explains the behaviour.

**Tech Stack:** Node.js + Express + better-sqlite3 (server); React + Mantine (client); Vitest + Supertest (tests).

## Global Constraints

- ESM everywhere — use `.js` extensions in imports.
- No new dependencies.
- i18n: all UI strings must be in both `en.json` and `ar.json`.
- Tests use `setupTestApp()` from `server/test/helpers.js` and must not touch the real DB.

---

### Task 1: Server — add `?lang=ar` support to the products export route

**Files:**
- Modify: `server/routes/data.js`
- Test: `server/test/analytics.test.js`

**Interfaces:**
- Produces: `GET /api/export/products.csv?lang=ar` → `text/csv`, Arabic headers, `Content-Disposition: attachment; filename="products-ar.csv"`

- [ ] **Step 1: Add the failing test**

Open `server/test/analytics.test.js`. Directly after the existing `it('exports products and transactions as CSV', ...)` block (after line 106), add:

```js
  it('exports products CSV in Arabic', async () => {
    const res = await api.get('/api/export/products.csv?lang=ar');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toContain('products-ar.csv');
    expect(res.text).toContain('الاسم');
    expect(res.text).toContain('الفئة');
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 4 "Arabic"
```

Expected: FAIL — `products-ar.csv` not in content-disposition, Arabic headers absent.

- [ ] **Step 3: Implement the route change**

Replace the entire `router.get('/export/products.csv', ...)` handler in `server/routes/data.js` with:

```js
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
        { key: 'id',           label: 'المعرف' },
        { key: 'name',         label: 'الاسم' },
        { key: 'barcode',      label: 'الباركود' },
        { key: 'quantity',     label: 'الكمية' },
        { key: 'buying_price', label: 'سعر الشراء' },
        { key: 'selling_price',label: 'سعر البيع' },
        { key: 'category',     label: 'الفئة' },
        { key: 'brand',        label: 'الماركة' },
        { key: 'is_temporary', label: 'مؤقت' },
        { key: 'created_at',   label: 'تاريخ الإضافة' },
        { key: 'updated_at',   label: 'تاريخ التعديل' },
      ]
    : [
        { key: 'id',           label: 'ID' },
        { key: 'name',         label: 'Name' },
        { key: 'barcode',      label: 'Barcode' },
        { key: 'quantity',     label: 'Quantity' },
        { key: 'buying_price', label: 'Buying Price' },
        { key: 'selling_price',label: 'Selling Price' },
        { key: 'category',     label: 'Category' },
        { key: 'brand',        label: 'Brand' },
        { key: 'is_temporary', label: 'Temporary' },
        { key: 'created_at',   label: 'Created' },
        { key: 'updated_at',   label: 'Updated' },
      ];

  const csv = toCsv(rows, columns);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'export_products' });
  sendCsv(res, ar ? 'products-ar.csv' : 'products.csv', csv);
});
```

- [ ] **Step 4: Run the test suite to confirm all tests pass**

```bash
npm test
```

Expected: all tests pass, including the new Arabic test.

- [ ] **Step 5: Commit**

```bash
git add server/routes/data.js server/test/analytics.test.js
git commit -m "feat(export): add lang=ar support to products CSV export"
```

---

### Task 2: i18n — add export info bullet keys

**Files:**
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/ar.json`

**Interfaces:**
- Produces: `settings.exportInfo1`, `settings.exportInfo2`, `settings.exportInfo3` in both locales.

- [ ] **Step 1: Add English keys**

In `client/src/i18n/en.json`, inside the `"settings"` object, after the `"exportTransactions"` key, add:

```json
"exportInfo1": "Exports two files: English (products.csv) and Arabic (products-ar.csv).",
"exportInfo2": "Category and brand names appear in the matching language in each file.",
"exportInfo3": "Both files download automatically to your Downloads folder."
```

- [ ] **Step 2: Add Arabic keys**

In `client/src/i18n/ar.json`, inside the `"settings"` object, after the `"exportTransactions"` key, add:

```json
"exportInfo1": "يُصدَّر ملفان: إنجليزي (products.csv) وعربي (products-ar.csv).",
"exportInfo2": "تظهر أسماء الفئات والماركات باللغة المناسبة في كل ملف.",
"exportInfo3": "يُنزَّل كلا الملفين تلقائياً إلى مجلد التنزيلات."
```

- [ ] **Step 3: Commit**

```bash
git add client/src/i18n/en.json client/src/i18n/ar.json
git commit -m "feat(i18n): add export info bullet keys for bilingual product export"
```

---

### Task 3: Client — dual auto-download and export info Alert

**Files:**
- Modify: `client/src/pages/Settings.jsx`

**Interfaces:**
- Consumes: `exportCsv(path)` from `../api/settings.js` (already imported), `settings.exportInfo1/2/3` keys from Task 2.
- Consumes: `List` from `@mantine/core` (already imported from Task — check import block).

- [ ] **Step 1: Add `downloadCsvAuto` helper and `exportProducts` handler**

In `Settings.jsx`, directly after the `downloadCsv` function (after line 131), add:

```js
  const downloadCsvAuto = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportProducts = async () => {
    setExportingProducts(true);
    try {
      const [enBlob, arBlob] = await Promise.all([
        exportCsv('/export/products.csv'),
        exportCsv('/export/products.csv?lang=ar'),
      ]);
      downloadCsvAuto(enBlob, 'products.csv');
      downloadCsvAuto(arBlob, 'products-ar.csv');
    } catch {
      notifications.show({ message: t('common.error'), color: 'red' });
    } finally {
      setExportingProducts(false);
    }
  };
```

- [ ] **Step 2: Add export info Alert and update the button**

Find this block in the JSX (around line 292):

```jsx
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light" mb="md">
            <List size="sm" spacing={4}>
              <List.Item>{t('settings.backupInfo1', { hours: values.backup_interval_hours ?? 12 })}</List.Item>
              <List.Item>{t('settings.backupInfo2')}</List.Item>
              <List.Item>{t('settings.backupInfo3')}</List.Item>
            </List>
          </Alert>
          <SimpleGrid cols={{ base: 1, xs: 3 }}>
```

Replace with:

```jsx
          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light" mb="md">
            <List size="sm" spacing={4}>
              <List.Item>{t('settings.backupInfo1', { hours: values.backup_interval_hours ?? 12 })}</List.Item>
              <List.Item>{t('settings.backupInfo2')}</List.Item>
              <List.Item>{t('settings.backupInfo3')}</List.Item>
            </List>
          </Alert>
          <Alert icon={<IconInfoCircle size={16} />} color="teal" variant="light" mb="md">
            <List size="sm" spacing={4}>
              <List.Item>{t('settings.exportInfo1')}</List.Item>
              <List.Item>{t('settings.exportInfo2')}</List.Item>
              <List.Item>{t('settings.exportInfo3')}</List.Item>
            </List>
          </Alert>
          <SimpleGrid cols={{ base: 1, xs: 3 }}>
```

Then find the Export Products button onClick:

```jsx
              onClick={() => downloadCsv('/export/products.csv', 'products.csv', setExportingProducts)}
```

Replace with:

```jsx
              onClick={exportProducts}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Settings.jsx
git commit -m "feat(settings): dual auto-download for bilingual product export with info Alert"
```
