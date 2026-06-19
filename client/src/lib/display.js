// Display helpers for bilingual reference names and product images.

const DEFAULT_IMAGE = '/assets/default-product.svg';

/** Picks the localized name from a row that has name_en / name_ar. */
export function refName(row, lang) {
  if (!row) return '';
  return (lang === 'ar' ? row.name_ar : row.name_en) || row.name_en || row.name_ar || '';
}

/** A product's category/brand name in the current language (from joined columns). */
export function productCategoryName(p, lang) {
  return lang === 'ar' ? p.category_name_ar : p.category_name_en;
}
export function productBrandName(p, lang) {
  return lang === 'ar' ? p.brand_name_ar : p.brand_name_en;
}

/** Image URL for a product, falling back to the default placeholder. */
export function productImage(p) {
  return p?.image_path || DEFAULT_IMAGE;
}

export { DEFAULT_IMAGE };
