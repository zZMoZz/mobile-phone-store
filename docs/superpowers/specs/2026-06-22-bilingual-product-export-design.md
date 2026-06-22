# Bilingual Product Export — Design Spec

## Context

The "Export Products" button currently produces a single CSV with English headers and
English category/brand names. The store operates in both Arabic and English, so staff
need an Arabic-language CSV for sharing or archiving. Both files should download
automatically (no save dialog) to the Downloads folder.

---

## What Changes

### 1. Server — `server/routes/data.js`

Add `?lang=ar` support to `GET /export/products.csv`.

- Default (`lang` absent or `en`): current behaviour — `name_en` for category/brand,
  English column headers, filename `products.csv`.
- `lang=ar`: use `name_ar` for category/brand columns, Arabic column headers,
  filename `products-ar.csv`.

The SQL query gains both name columns and picks the right one based on `lang`:

```sql
SELECT p.id, p.name, p.barcode, p.quantity, p.buying_price, p.selling_price,
       c.name_en AS category_en, c.name_ar AS category_ar,
       b.name_en AS brand_en,    b.name_ar AS brand_ar,
       p.is_temporary, p.created_at, p.updated_at
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN brands b    ON b.id = p.brand_id
ORDER BY p.id
```

Then remap `category` and `brand` keys before calling `toCsv()`:

```js
const ar = req.query.lang === 'ar';
const mapped = rows.map(r => ({
  ...r,
  category: ar ? r.category_ar : r.category_en,
  brand:    ar ? r.brand_ar    : r.brand_en,
}));
```

**Arabic column headers:**

| Key | Arabic label |
|-----|-------------|
| id | المعرف |
| name | الاسم |
| barcode | الباركود |
| quantity | الكمية |
| buying_price | سعر الشراء |
| selling_price | سعر البيع |
| category | الفئة |
| brand | الماركة |
| is_temporary | مؤقت |
| created_at | تاريخ الإضافة |
| updated_at | تاريخ التعديل |

Both language paths share the same `sendCsv` helper; only the column definitions and
filename differ. Log action stays `export_products` for both.

---

### 2. Client — `client/src/pages/Settings.jsx`

**New helper — `downloadCsvAuto(blob, filename)`**

Always uses the blob URL approach (no `showSaveFilePicker`). Reuse the existing blob
URL logic already in `downloadCsv`. This is used for product exports where two files
must download silently back-to-back.

**Updated Export Products handler**

Replace the current single `downloadCsv` call with a new `exportProducts` async
function that:

1. Sets `exportingProducts` to `true`
2. Fetches both blobs in parallel:
   - `exportCsv('/export/products.csv')` → `products.csv`
   - `exportCsv('/export/products.csv?lang=ar')` → `products-ar.csv`
3. Triggers both automatic downloads via `downloadCsvAuto`
4. Sets `exportingProducts` to `false`

**New export info Alert**

Add a second `Alert` (same blue `variant="light"` style) between the backup Alert and
the `SimpleGrid` of buttons, with three bullet points:

- en: "Exports two files: English (products.csv) and Arabic (products-ar.csv)."
- en: "Category and brand names appear in the matching language in each file."
- en: "Both files download automatically to your Downloads folder."

Arabic equivalents added to `ar.json`.

---

### 3. i18n — `en.json` / `ar.json`

Add three new keys under `settings`:

```
exportInfo1  — "Exports two files: English (products.csv) and Arabic (products-ar.csv)."
exportInfo2  — "Category and brand names appear in the matching language in each file."
exportInfo3  — "Both files download automatically to your Downloads folder."
```

No changes needed for the Arabic column header strings — those live server-side only.

---

## Files to touch

| File | Change |
|------|--------|
| `server/routes/data.js` | Add `?lang=ar` to products export route |
| `client/src/pages/Settings.jsx` | `downloadCsvAuto` helper, `exportProducts` handler, export info Alert |
| `client/src/i18n/en.json` | Add `exportInfo1/2/3` keys |
| `client/src/i18n/ar.json` | Add `exportInfo1/2/3` keys |

---

## Verification

1. Click "Export Products" → two files appear in Downloads: `products.csv` and
   `products-ar.csv`. No save dialog opens.
2. Open `products.csv` — headers in English, category/brand names in English.
3. Open `products-ar.csv` — headers in Arabic, category/brand names in Arabic.
4. Products with no category/brand → blank cell in both files (same as before).
5. Settings info Alert shows the three export bullets.
