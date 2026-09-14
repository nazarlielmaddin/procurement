// Money + date formatting (mirrors Appina Finance lib/format.js).
import { createElement as h, Fragment } from 'react';

// Returns a React node (not a string) so the ₼ sign renders bigger
// everywhere via the `.cur` class. Always used as a JSX child.
export const money = (n) =>
  h(Fragment, null,
    Number(n || 0).toLocaleString('az-AZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ',
    h('span', { className: 'cur' }, '₼'));

const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'İyn', 'İyl', 'Avq', 'Sen', 'Okt', 'Noy', 'Dek'];

// ISO 'YYYY-MM-DD[THH..]' → 'DD.MM.YYYY'. All dates are stored ISO-only.
export function fmtDate(v) {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return String(v);
}

export function fmtDateTime(v) {
  if (!v) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(v));
  if (m) return `${m[3]}.${m[2]}.${m[1]}, ${m[4]}:${m[5]}`;
  return fmtDate(v);
}

// 'YYYY-MM' → 'Yan 2026' for chart labels.
export function fmtMonth(m) {
  const x = /^(\d{4})-(\d{2})$/.exec(String(m || ''));
  if (!x) return String(m || '—');
  return `${MONTHS[Number(x[2]) - 1] || x[2]} ${x[1]}`;
}
