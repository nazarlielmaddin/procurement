// Pure helpers + the single decision writer. No Express imports here
// so tests can unit-check the money/validation logic directly.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

// Express 4 async wrapper (Express 5 not required).
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// NULL approved_qty means "as requested" (full approval). THE single place
// this semantic lives — the client must never reimplement it.
export const effectiveQty = (it) =>
  it.approved_qty == null ? Number(it.requested_qty) : Number(it.approved_qty);

export const lineRequested = (it) => round2(Number(it.requested_qty) * Number(it.unit_price));
export const lineApproved = (it) => round2(effectiveQty(it) * Number(it.unit_price));

export function orderTotals(items) {
  let requested = 0;
  let approved = 0;
  for (const it of items || []) {
    requested += lineRequested(it);
    approved += lineApproved(it);
  }
  return { requested: round2(requested), approved: round2(approved) };
}

// Status-gated totals: approved money exists only after a boss approval.
// pending/rejected orders report approved = 0 so no list or detail ever
// implies money was granted. (Dashboard keeps its own, already gated, math.)
export function statusTotals(status, items) {
  const t = orderTotals(items || []);
  if (status === 'approved' || status === 'partially_approved') return t;
  return { requested: t.requested, approved: 0 };
}

// Internal IDs are case-insensitive: normalized once, on write.
export const normInternalId = (v) => String(v ?? '').trim().toUpperCase();

export const str = (v, maxLen = 2000) => {
  if (v == null) return '';
  const s = String(v).trim();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

// @mention-lər: '@login' nümunələrini mətndən çıxarır (latin login-lər,
// nöqtə/tire/altxətt dəstəklənir), kiçik hərfə endirib təkrarları atır.
export function extractMentions(body) {
  const out = [];
  const seen = new Set();
  for (const m of String(body || '').matchAll(/@([A-Za-z0-9._-]{1,60})/g)) {
    const login = m[1].replace(/[._-]+$/, '').toLowerCase();
    if (login && !seen.has(login)) {
      seen.add(login);
      out.push(login);
    }
  }
  return out;
}

// ── Passwords (scrypt, stdlib only — no bcrypt dependency) ──
export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  const h = scryptSync(String(pw), salt, 64).toString('hex');
  return `scrypt$${salt}$${h}`;
}

export function verifyPassword(pw, stored) {
  try {
    const [, salt, h] = String(stored).split('$');
    if (!salt || !h) return false;
    const test = scryptSync(String(pw), salt, 64);
    const exp = Buffer.from(h, 'hex');
    return test.length === exp.length && timingSafeEqual(test, exp);
  } catch {
    return false;
  }
}

// ── Decision writer: the ONLY function that moves pending → terminal. ──
// Writes orders.status/decided_* + status_history (+ optional comment) inside
// one transaction. Throws HttpError(409 'ORDER_LOCKED') on replay,
// HttpError(400 ...) on validation failures.
export function logDecision(db, { orderId, actor, decision, items, comment }) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new HttpError(404, 'order_not_found');
  if (order.status !== 'pending') throw new HttpError(409, 'ORDER_LOCKED', 'Sifariş artıq qərarlaşdırılıb');

  const rows = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(orderId);
  if (!rows.length) throw new HttpError(400, 'order_empty', 'Sifarişdə məhsul yoxdur');

  const now = new Date().toISOString();
  let toStatus;
  let diff = null;

  if (decision === 'approved') {
    toStatus = 'approved';
    // approved_qty stays NULL = as-requested (effectiveQty handles it).
  } else if (decision === 'partially_approved') {
    toStatus = 'partially_approved';
    if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'partial_no_items');
    const byId = new Map(items.map((i) => [Number(i.id), i]));
    let cut = false;
    let kept = false;
    diff = [];
    for (const r of rows) {
      const inc = byId.get(r.id);
      if (inc?.approved_qty == null) throw new HttpError(400, 'partial_item_missing', `Məhsul #${r.id} üçün təsdiq miqdarı göstərilməyib`);
      const q = num(inc.approved_qty);
      if (!Number.isFinite(q) || q < 0) throw new HttpError(400, 'partial_qty_invalid');
      if (q > Number(r.requested_qty)) throw new HttpError(400, 'qty_exceeds', `#${r.id}: təsdiq tələbdən çox ola bilməz`);
      if (q < Number(r.requested_qty)) cut = true;
      if (q > 0) kept = true;
      diff.push({ item_id: r.id, requested: Number(r.requested_qty), approved: q });
    }
    if (!cut) throw new HttpError(400, 'partial_no_cut', 'Qismən təsdiq üçün ən azı bir miqdar azaldılmalıdır');
    if (!kept) throw new HttpError(400, 'partial_all_zero', 'Qismən təsdiqdə ən azı bir məhsul saxlanmalıdır');
  } else if (decision === 'rejected') {
    toStatus = 'rejected';
  } else {
    throw new HttpError(400, 'decision_invalid');
  }

  // node:sqlite has no db.transaction() — run the writes sequentially on the
  // single shared connection (same atomicity class as the finance routes).
  if (toStatus === 'partially_approved') {
    const upd = db.prepare('UPDATE order_items SET approved_qty = ? WHERE id = ? AND order_id = ?');
    for (const d of diff) upd.run(d.approved, d.item_id, orderId);
  }
  db.prepare('UPDATE orders SET status = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?')
    .run(toStatus, actor.id, now, now, orderId);
  db.prepare(`INSERT INTO status_history (order_id, from_status, to_status, actor_id, comment, diff_json)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(orderId, 'pending', toStatus, actor.id, str(comment, 2000) || null, diff ? JSON.stringify(diff) : null);
  if (str(comment)) {
    db.prepare('INSERT INTO comments (order_id, author_id, author_name, body) VALUES (?, ?, ?, ?)')
      .run(orderId, actor.id, actor.full_name, str(comment));
  }

  return { ok: true, status: toStatus };
}
