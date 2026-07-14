/**
 * downloadCsv — build a CSV from a column spec and trigger a client-side
 * download. Shared by the list pages' Export buttons (companies, contacts,
 * master data, …) so they all quote/escape identically.
 *
 * `columns` is an array of [header, accessor] pairs; the accessor returns the
 * cell string for a row. A UTF-8 BOM is prepended so Excel reads it correctly.
 */
export function downloadCsv<T>(
  filename: string,
  columns: Array<[string, (row: T) => string]>,
  rows: T[],
): void {
  if (!rows.length) return;
  const cell = (v: string) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const header = columns.map((c) => cell(c[0])).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c[1](r))).join(',')).join('\n');
  const csv = '﻿' + header + '\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
