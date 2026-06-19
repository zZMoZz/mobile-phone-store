import { getDb } from '../db/connection.js';

// Shared CRUD for the two bilingual lookup tables: categories and brands.
// Names are kept unique (case-insensitive, trimmed) to prevent duplicates, and a
// record can't be deleted while products still reference it.

function fail(status, message, code, params) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  if (params) err.params = params;
  throw err;
}

// Rejects a name that already exists on another row (case-insensitive, trimmed),
// matching either the English or Arabic name.
function assertUniqueName(table, { name_en, name_ar }, excludeId = null) {
  const dup = getDb()
    .prepare(
      `SELECT id FROM ${table}
       WHERE id != @id
         AND (lower(trim(name_en)) = lower(@name_en) OR lower(trim(name_ar)) = lower(@name_ar))`,
    )
    .get({ id: excludeId ?? -1, name_en, name_ar });
  if (dup) fail(409, 'A record with this name already exists', 'ref_name_taken');
}

// `usageColumn` is the products FK that references this table (category_id / brand_id).
function makeRepo(table, usageColumn) {
  const getById = (id) => getDb().prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);

  return {
    // Each row carries how many products reference it, so the UI can offer to
    // move them elsewhere before deleting.
    list: () =>
      getDb()
        .prepare(
          `SELECT t.*, (SELECT COUNT(*) FROM products p WHERE p.${usageColumn} = t.id) AS product_count
           FROM ${table} t ORDER BY t.name_en`,
        )
        .all(),

    create: (data) => {
      const name_en = (data.name_en || '').trim();
      const name_ar = (data.name_ar || '').trim();
      if (!name_en || !name_ar) fail(400, 'Both English and Arabic names are required', 'ref_name_required');
      assertUniqueName(table, { name_en, name_ar });
      const info = getDb()
        .prepare(`INSERT INTO ${table} (name_en, name_ar) VALUES (?, ?)`)
        .run(name_en, name_ar);
      return getById(info.lastInsertRowid);
    },

    update: (id, data) => {
      const existing = getById(id);
      if (!existing) return undefined;
      const name_en = (data.name_en ?? existing.name_en).trim();
      const name_ar = (data.name_ar ?? existing.name_ar).trim();
      if (!name_en || !name_ar) fail(400, 'Both English and Arabic names are required', 'ref_name_required');
      assertUniqueName(table, { name_en, name_ar }, id);
      getDb().prepare(`UPDATE ${table} SET name_en = ?, name_ar = ? WHERE id = ?`).run(name_en, name_ar, id);
      return getById(id);
    },

    // Deletes a record. If products still reference it, the caller may pass
    // `targetId` to move those products to another record first (atomically).
    // Protected default records (e.g. "Generic") can never be deleted.
    remove: (id, targetId = null) => {
      const existing = getById(id);
      if (!existing) return false; // → 404
      if (existing.is_protected) {
        fail(409, "This is a default item and can't be deleted", 'ref_protected');
      }
      const inUse = getDb()
        .prepare(`SELECT COUNT(*) AS c FROM products WHERE ${usageColumn} = ?`)
        .get(id).c;

      if (inUse > 0) {
        if (targetId == null) {
          fail(409, `Can't delete: still used by ${inUse} product(s)`, 'ref_in_use', { n: inUse });
        }
        const target = Number(targetId);
        if (target === id) fail(400, 'Choose a different target', 'ref_reassign_self');
        if (!getById(target)) fail(400, 'Target not found', 'ref_reassign_missing');
        const db = getDb();
        db.transaction(() => {
          db.prepare(`UPDATE products SET ${usageColumn} = ? WHERE ${usageColumn} = ?`).run(target, id);
          db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
        })();
        return true;
      }
      return getDb().prepare(`DELETE FROM ${table} WHERE id = ?`).run(id).changes > 0;
    },
  };
}

export const categories = makeRepo('categories', 'category_id');
export const brands = makeRepo('brands', 'brand_id');
