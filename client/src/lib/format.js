// Currency + date formatting helpers. Currency comes from server settings
// (default EGP). Kept in one place so formatting stays consistent everywhere.

const CURRENCY_LABELS = {
  EGP: { en: 'EGP', ar: 'ج.م' },
  USD: { en: '$', ar: '$' },
};

let currentCurrency = 'EGP';

export function setCurrency(code) {
  if (code) currentCurrency = code;
}

export function getCurrency() {
  return currentCurrency;
}

/** Formats a plain number with locale digits (Arabic-Indic in Arabic mode). */
export function formatNumber(value, lang = 'ar') {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

/**
 * Formats a numeric amount with grouping and the active currency label.
 * Pass `{ noCents: true }` to round to whole units and hide the fractional part.
 */
export function formatMoney(amount, lang = 'ar', { noCents = false } = {}) {
  const value = Number(amount || 0);
  const label = (CURRENCY_LABELS[currentCurrency] || { en: currentCurrency, ar: currentCurrency })[
    lang === 'ar' ? 'ar' : 'en'
  ];
  // For whole-unit amounts, skip thousands grouping until the millions — a 6-digit
  // figure like 462010 reads fine without a separator; grouping only adds value at 7+ digits.
  const useGrouping = !noCents || Math.abs(value) >= 1_000_000;
  const formatted = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    maximumFractionDigits: noCents ? 0 : 2,
    useGrouping,
  }).format(value);
  return lang === 'ar' ? `${formatted} ${label}` : `${label} ${formatted}`;
}

/**
 * Returns a SQL-comparable 'YYYY-MM-DD HH:MM:SS' UTC start time for a named
 * period ('today' | 'week' | 'month'), or undefined for 'all'.
 */
export function periodStart(period) {
  if (!period || period === 'all') return undefined;
  const now = new Date();
  const d = new Date(now);
  if (period === 'today') d.setHours(0, 0, 0, 0);
  else if (period === 'week') {
    d.setDate(now.getDate() - 7);
    d.setHours(0, 0, 0, 0);
  } else if (period === 'month') {
    d.setMonth(now.getMonth() - 1);
    d.setHours(0, 0, 0, 0);
  }
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Converts a local date string (YYYY-MM-DD) to a UTC 'YYYY-MM-DD HH:MM:SS' suitable
 * for >= comparison against UTC-stored datetimes in SQLite. 'T00:00:00' without a
 * timezone suffix is parsed as local time by the JS Date constructor.
 * Optional `time` (HH:MM) overrides the default start-of-day midnight.
 */
export function localDateToUtcFrom(date, time = '') {
  if (!date) return undefined;
  return new Date(`${date}T${time || '00:00'}:00`).toISOString().slice(0, 19).replace('T', ' ');
}

/** Same as localDateToUtcFrom but for the end boundary (<= comparison).
 *  Optional `time` (HH:MM) overrides the default end-of-day 23:59:59. */
export function localDateToUtcTo(date, time = '') {
  if (!date) return undefined;
  return new Date(`${date}T${time || '23:59'}:59`).toISOString().slice(0, 19).replace('T', ' ');
}

/** Formats an ISO/SQL datetime string for display. */
export function formatDate(value, lang = 'ar') {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
