// Access gates (mirrors server/lib/access.js 2-gate doctrine):
// client hiding is UX only — every route below re-checks server-side.
import { randomBytes } from 'node:crypto';
import { procDb } from './proc_db.js';

const COOKIE = 'proc_token';
const SESSION_DAYS = 30;

export function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + SESSION_DAYS * 86400 * 1000).toISOString();
  procDb().prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, exp);
  return { token, exp };
}

export function destroySession(token) {
  if (token) procDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

const PUBLIC_USER = 'u.id, u.full_name, u.login, u.proc_role, u.proc_access, u.sections_csv, u.appina_user_id, u.must_rotate';

// Hard gate: valid session + active proc_access. Attaches req.user.
export function authenticate(req, res, next) {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.[COOKIE] || bearer;
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  const row = procDb()
    .prepare(`SELECT ${PUBLIC_USER} FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.token = ? AND s.expires_at > ?`)
    .get(token, new Date().toISOString());
  if (!row || !row.proc_access) return res.status(401).json({ error: 'unauthorized' });

  req.user = row;
  next();
}

export const isBoss = (user) => user?.proc_role === 'boss';

// Section seam for the future Appina sync (mirrors finance_sections CSV).
export function procSectionsFor(user) {
  if (!user) return [];
  const raw = String(user.sections_csv || '').trim();
  if (!raw) return ['orders', 'catalog', 'dashboard'];
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function requireProcurement(req, res, next) {
  if (req.user && req.user.proc_access) return next();
  return res.status(403).json({ error: 'no_proc_access' });
}

// Boss-only routes (catalog writes, decisions).
export function requireBoss(req, res, next) {
  if (isBoss(req.user)) return next();
  return res.status(403).json({ error: 'boss_only' });
}

// Visibility: boss sees everything, specialists only their own orders.
export function loadOrder(orderId) {
  return procDb().prepare('SELECT * FROM orders WHERE id = ?').get(Number(orderId)) || null;
}

export function ensureVisible(user, order) {
  if (!order) return { status: 404, error: 'order_not_found' };
  if (isBoss(user) || order.requester_id === user.id) return null;
  return { status: 403, error: 'not_your_order' };
}

export function ensureOwnerPending(user, order) {
  const v = ensureVisible(user, order);
  if (v) return v;
  if (!isBoss(user) && order.requester_id !== user.id) return { status: 403, error: 'not_your_order' };
  if (order.status !== 'pending') return { status: 409, error: 'ORDER_LOCKED' };
  return null;
}

export { COOKIE };
