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

/** Formats a numeric amount with grouping and the active currency label. */
export function formatMoney(amount, lang = 'ar') {
  const value = Number(amount || 0);
  const label = (CURRENCY_LABELS[currentCurrency] || { en: currentCurrency, ar: currentCurrency })[
    lang === 'ar' ? 'ar' : 'en'
  ];
  const formatted = new Intl.NumberFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    maximumFractionDigits: 2,
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

/** Formats an ISO/SQL datetime string for display. */
export function formatDate(value, lang = 'ar') {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
