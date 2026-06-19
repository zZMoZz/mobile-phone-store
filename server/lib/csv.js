/** Escapes a single CSV cell, quoting when needed. */
function cell(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Builds a CSV string from an array of row objects and an ordered column list.
 * columns: [{ key, label }]. Prepends a UTF-8 BOM so Excel reads Arabic correctly.
 */
export function toCsv(rows, columns) {
  const header = columns.map((c) => cell(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => cell(row[c.key])).join(','));
  return '﻿' + [header, ...lines].join('\r\n');
}
