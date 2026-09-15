// Procurement API — mirrors server/routes/finance.js shape (generic MODULES
// CRUD + dedicated order/decision routes + server-side dashboard aggregates).
import { Router } from 'express';
import { procDb } from '../lib/proc_db.js';
import { authenticate, requireProcurement, requireBoss, isBoss, isStorekeeper, denyStorekeeper, procSectionsFor, loadOrder, ensureVisible, ensureOwnerPending } from '../lib/proc_access.js';
import { HttpError, ah, round2, str, num, normInternalId, effectiveQty, orderTotals, statusTotals, logDecision, extractMentions } from '../lib/proc_helpers.js';

const r = Router();
r.use(authenticate);
r.use(requireProcurement);

// GET /api/procurement/access — auth seam for the client (display-only gating).
r.get('/access', (req, res) => {
  res.json({ proc_role: req.user.proc_role, is_boss: isBoss(req.user), sections: procSectionsFor(req.user), must_rotate: !!req.user.must_rotate });
});

// ── Price catalog (MODULES-map style; boss writes, specialist reads) ──
// Hybrid C-base: firm groups the catalog (UMUMI = ungrouped legacy rows).
// sell_price is frozen — always mirrors buy_price on write, never read for pricing.
const DEFAULT_FIRM = 'UMUMI';
const CAT_COLS = ['internal_id', 'name', 'unit', 'firm', 'buy_price'];

function normFirm(v) {
  const s = str(v, 60).replace(/\s+/g, ' ').trim();
  return s || DEFAULT_FIRM;
}

function prepCatalog(body) {
  const data = {};
  if (body.internal_id !== undefined) data.internal_id = normInternalId(body.internal_id);
  if (body.name !== undefined) data.name = str(body.name, 300);
  if (body.unit !== undefined) data.unit = str(body.unit, 40);
  if (body.firm !== undefined) data.firm = normFirm(body.firm);
  if (body.buy_price !== undefined) data.buy_price = num(body.buy_price);
  // sell_price frozen: accepted and ignored — never a 400, never written from input.
  return data;
}

r.get('/catalog', denyStorekeeper, (req, res) => {
  const q = str(req.query.q, 120);
  const firmFilter = str(req.query.firm, 60).replace(/\s+/g, ' ').trim();
  const d = procDb();
  const conds = [];
  const args = [];
  if (firmFilter) {
    conds.push('UPPER(TRIM(firm)) = UPPER(TRIM(?))');
    args.push(firmFilter);
  }
  if (q) {
    const like = `%${q}%`;
    conds.push('(internal_id = ? OR name LIKE ? OR internal_id LIKE ? OR firm LIKE ?)');
    args.push(q.toUpperCase(), like, like, like);
  }
  if (!conds.length) {
    return res.json({ items: d.prepare('SELECT * FROM price_catalog ORDER BY name ASC').all() });
  }
  const order = q
    ? 'ORDER BY internal_id = ? DESC, name ASC LIMIT 100'
    : 'ORDER BY name ASC';
  const oargs = q ? [...args, q.toUpperCase()] : args;
  const items = d.prepare(`SELECT * FROM price_catalog WHERE ${conds.join(' AND ')} ${order}`).all(...oargs);
  res.json({ items });
});

r.post('/catalog', requireBoss, (req, res) => {
  const data = prepCatalog(req.body || {});
  if (!data.firm) data.firm = DEFAULT_FIRM;
  if (!data.internal_id) throw new HttpError(400, 'internal_id_required');
  if (!data.name) throw new HttpError(400, 'name_required');
  if (!data.unit) throw new HttpError(400, 'unit_required');
  if (!Number.isFinite(data.buy_price) || data.buy_price < 0) throw new HttpError(400, 'buy_price_invalid');
  const d = procDb();
  const dup = d.prepare(
    'SELECT id FROM price_catalog WHERE UPPER(internal_id) = UPPER(?) AND UPPER(TRIM(firm)) = UPPER(TRIM(?))',
  ).get(data.internal_id, data.firm);
  if (dup) throw new HttpError(409, 'internal_id_taken', `Bu ID artıq kataloqdadır (${data.firm})`);
  try {
    const info = d.prepare(
      'INSERT INTO price_catalog (internal_id, name, unit, firm, buy_price, sell_price) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(data.internal_id, data.name, data.unit, data.firm, data.buy_price, data.buy_price);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    if (String(e?.message).includes('UNIQUE')) throw new HttpError(409, 'internal_id_taken', `Bu ID artıq kataloqdadır (${data.firm})`);
    throw e;
  }
});

r.put('/catalog/:id', requireBoss, (req, res) => {
  const data = prepCatalog(req.body || {});
  const keys = Object.keys(data).filter((k) => CAT_COLS.includes(k));
  if (!keys.length) throw new HttpError(400, 'no_fields');
  if (data.buy_price !== undefined && (!Number.isFinite(data.buy_price) || data.buy_price < 0)) {
    throw new HttpError(400, 'buy_price_invalid');
  }
  // sell_price mirrors buy_price whenever buy_price is written.
  const sets = [...keys];
  const vals = keys.map((k) => data[k]);
  if (data.buy_price !== undefined) {
    sets.push('sell_price');
    vals.push(data.buy_price);
  }
  try {
    procDb().prepare(`UPDATE price_catalog SET ${sets.map((k) => `${k}=?`).join(',')}, updated_at = ? WHERE id = ?`)
      .run(...vals, new Date().toISOString(), Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    if (String(e?.message).includes('UNIQUE')) {
      throw new HttpError(409, 'internal_id_taken', `Bu ID artıq kataloqdadır (${data.firm || ''})`);
    }
    throw e;
  }
});

r.delete('/catalog/:id', requireBoss, (req, res) => {
  // order_items.catalog_id is ON DELETE SET NULL — history survives.
  procDb().prepare('DELETE FROM price_catalog WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// POST /api/procurement/catalog/replace — Excel import.
// Boss-only. Body: { items: [{ internal_id, name, unit, buy_price }], firm? }.
// firm verilsə → yalnız HƏMİN firma əvəz olunur (scoped DELETE);
// verilməsə → legacy tam DELETE. Sifariş tarixçəsi (order_items) sağ qalır
// (catalog_id ON DELETE SET NULL) — yalnız kataloq bazası əvəz olunur.
// sell_price frozen: input-dan oxunmur, buy_price-ə bərabər yazılır.
r.post('/catalog/replace', requireBoss, (req, res) => {
  const raw = req.body?.items;
  if (!Array.isArray(raw)) throw new HttpError(400, 'items_required');
  if (raw.length > 5000) throw new HttpError(400, 'too_many_items', 'Maksimum 5000 məhsul');
  const firmScoped = req.body?.firm !== undefined && req.body?.firm !== null && String(req.body.firm).trim() !== '';
  const firm = firmScoped ? normFirm(req.body.firm) : null;
  const seen = new Set();
  const clean = raw.map((it, i) => {
    const internal_id = normInternalId(it?.internal_id);
    const name = str(it?.name, 300);
    const unit = str(it?.unit, 40) || 'əd';
    const buy_price = num(it?.buy_price);
    const rowFirm = firm || normFirm(it?.firm);
    if (!internal_id) throw new HttpError(400, 'internal_id_required', `Sətir ${i + 1}: ID boşdur`);
    if (!name) throw new HttpError(400, 'name_required', `Sətir ${i + 1} (${internal_id}): ad boşdur`);
    if (!Number.isFinite(buy_price) || buy_price < 0) throw new HttpError(400, 'buy_price_invalid', `Sətir ${i + 1} (${internal_id}): alış qiyməti yanlışdır`);
    const dupKey = `${internal_id}::${rowFirm.toUpperCase()}`;
    if (seen.has(dupKey)) throw new HttpError(400, 'duplicate_id', `Təkrar ID: ${internal_id} (${rowFirm})`);
    seen.add(dupKey);
    return { internal_id, name, unit, firm: rowFirm, buy_price };
  });
  const d = procDb();
  if (firm) {
    d.prepare('DELETE FROM price_catalog WHERE UPPER(TRIM(firm)) = UPPER(TRIM(?))').run(firm);
  } else {
    d.prepare('DELETE FROM price_catalog').run();
  }
  const ins = d.prepare(
    'INSERT INTO price_catalog (internal_id, name, unit, firm, buy_price, sell_price) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const c of clean) ins.run(c.internal_id, c.name, c.unit, c.firm, c.buy_price, c.buy_price);
  const firms = [...new Set(d.prepare('SELECT DISTINCT firm FROM price_catalog ORDER BY firm').all().map((r) => r.firm))];
  res.json({ ok: true, count: clean.length, firms });
});

// ── Orders ──
function withTotals(list) {
  const d = procDb();
  const lines = d.prepare('SELECT * FROM order_items ORDER BY order_id, id').all();
  const byOrder = new Map();
  for (const it of lines) {
    if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
    byOrder.get(it.order_id).push(it);
  }
  return list.map((o) => {
    const items = byOrder.get(o.id) || [];
    return { ...o, items_count: items.length, ...statusTotals(o.status, items) };
  });
}

r.get('/orders', (req, res) => {
  const d = procDb();
  const status = str(req.query.status, 30);
  const allowed = ['pending', 'approved', 'partially_approved', 'rejected'];
  let sql = `SELECT o.*, u.full_name AS owner_name FROM orders o JOIN users u ON u.id = o.requester_id`;
  const conds = [];
  const args = [];
  if (isStorekeeper(req.user)) {
    // Anbardar yalnız təsdiqlənmiş sifarişləri görür (sorğu parametri keçərsizdir).
    conds.push('o.status = ?');
    args.push('approved');
  } else {
    if (!isBoss(req.user)) {
      conds.push('o.requester_id = ?');
      args.push(req.user.id);
    }
    if (status && allowed.includes(status)) {
      conds.push('o.status = ?');
      args.push(status);
    }
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  // Status sırası: Gözləyir → Qismən təsdiq → Təsdiqlənib → Rədd edilib, sonra tarix DESC
  sql += ` ORDER BY CASE o.status WHEN 'pending' THEN 0 WHEN 'partially_approved' THEN 1 WHEN 'approved' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END ASC, o.id DESC`;
  res.json({ items: withTotals(d.prepare(sql).all(...args)) });
});

r.post('/orders', denyStorekeeper, ah(async (req, res) => {
  const { requester_name, reason, items } = req.body || {};
  const rn = str(requester_name, 200);
  const rs = str(reason, 2000);
  if (!rn) throw new HttpError(400, 'requester_name_required');
  if (!rs) throw new HttpError(400, 'reason_required');
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'items_required');

  const d = procDb();
  const catIds = [...new Set(items.map((i) => Number(i.catalog_id)).filter((n) => Number.isFinite(n)))];
  const catById = new Map();
  if (catIds.length) {
    for (const c of d.prepare(`SELECT * FROM price_catalog WHERE id IN (${catIds.map(() => '?').join(',')})`).all(...catIds)) {
      catById.set(c.id, c);
    }
  }

  const rows = items.map((it) => {
    const cat = catById.get(Number(it.catalog_id)) || null;
    const name = str(it.product_name || cat?.name, 300);
    const unit = str(it.unit || cat?.unit, 40);
    const price = it.unit_price !== undefined && it.unit_price !== '' ? num(it.unit_price) : Number(cat?.buy_price);
    const qty = num(it.requested_qty);
    if (!name) throw new HttpError(400, 'item_name_required');
    if (!unit) throw new HttpError(400, 'item_unit_required');
    if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'item_price_invalid');
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, 'item_qty_invalid');
    return { catalog_id: cat?.id ?? null, product_name: name, unit, unit_price: price, requested_qty: qty };
  });

  const now = new Date().toISOString();
  const info = d.prepare(
    'INSERT INTO orders (requester_id, requester_name, reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(req.user.id, rn, rs, 'pending', now, now);
  const orderId = Number(info.lastInsertRowid);
  const ins = d.prepare(
    'INSERT INTO order_items (order_id, catalog_id, product_name, unit, unit_price, requested_qty) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const it of rows) ins.run(orderId, it.catalog_id, it.product_name, it.unit, it.unit_price, it.requested_qty);
  d.prepare('INSERT INTO status_history (order_id, from_status, to_status, actor_id) VALUES (?, ?, ?, ?)')
    .run(orderId, null, 'pending', req.user.id);
  res.status(201).json({ id: orderId });
}));

r.get('/orders/:id', (req, res) => {
  const order = loadOrder(req.params.id);
  const denied = ensureVisible(req.user, order);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  const d = procDb();
  const decided = order.status === 'approved' || order.status === 'partially_approved';
  const items = d.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id)
    .map((it) => {
      const eff = decided ? effectiveQty(it) : 0;
      return { ...it, approved_qty_eff: eff, line_requested: round2(Number(it.requested_qty) * Number(it.unit_price)), line_approved: round2(eff * Number(it.unit_price)) };
    });
  const comments = d.prepare(
    'SELECT c.*, u.proc_role AS author_role FROM comments c JOIN users u ON u.id = c.author_id WHERE c.order_id = ? ORDER BY c.created_at, c.id',
  ).all(order.id);
  const history = d.prepare(
    'SELECT h.*, u.full_name AS actor_name FROM status_history h LEFT JOIN users u ON u.id = h.actor_id WHERE h.order_id = ? ORDER BY h.id',
  ).all(order.id);
  res.json({ order: { ...order, ...statusTotals(order.status, items) }, items, comments, history });
});

// Owner-specialist edit of a PENDING order: replace-items (mirrors PUT /omid-alis/:id).
r.put('/orders/:id', denyStorekeeper, ah(async (req, res) => {
  const order = loadOrder(req.params.id);
  if (isBoss(req.user)) return res.status(403).json({ error: 'boss_uses_decision' });
  const denied = ensureOwnerPending(req.user, order);
  if (denied) return res.status(denied.status).json({ error: denied.error });

  const { requester_name, reason, items } = req.body || {};
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'items_required');
  const rows = items.map((it) => {
    const name = str(it.product_name, 300);
    const unit = str(it.unit, 40);
    const price = num(it.unit_price);
    const qty = num(it.requested_qty);
    if (!name || !unit) throw new HttpError(400, 'item_name_required');
    if (!Number.isFinite(price) || price < 0) throw new HttpError(400, 'item_price_invalid');
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, 'item_qty_invalid');
    return { catalog_id: Number.isFinite(Number(it.catalog_id)) ? Number(it.catalog_id) : null, product_name: name, unit, unit_price: price, requested_qty: qty };
  });

  const d = procDb();
  const now = new Date().toISOString();
  if (requester_name !== undefined || reason !== undefined) {
    d.prepare('UPDATE orders SET requester_name = ?, reason = ?, updated_at = ? WHERE id = ?')
      .run(requester_name !== undefined ? str(requester_name, 200) : order.requester_name,
        reason !== undefined ? str(reason, 2000) : order.reason, now, order.id);
  }
  d.prepare('DELETE FROM order_items WHERE order_id = ?').run(order.id);
  const ins = d.prepare('INSERT INTO order_items (order_id, catalog_id, product_name, unit, unit_price, requested_qty) VALUES (?, ?, ?, ?, ?, ?)');
  for (const it of rows) ins.run(order.id, it.catalog_id, it.product_name, it.unit, it.unit_price, it.requested_qty);
  d.prepare('UPDATE orders SET updated_at = ? WHERE id = ?').run(now, order.id);
  res.json({ ok: true });
}));

// Boss decision: pending → terminal (single writer in proc_helpers).
r.post('/orders/:id/decision', requireBoss, ah(async (req, res) => {
  const { decision, items, comment } = req.body || {};
  const out = logDecision(procDb(), { orderId: Number(req.params.id), actor: req.user, decision, items, comment });
  res.json(out);
}));

// Boss revision: terminal → pending ("Qərarı dəyiş").
// Təsdiq miqdarları sıfırlanır, sifariş yenidən qərar gözləyir —
// boss dərhal yeni qərar verə bilər. Tarixçəyə yazılır.
r.post('/orders/:id/reopen', requireBoss, (req, res) => {
  const order = loadOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  if (order.status === 'pending') throw new HttpError(409, 'already_pending', 'Sifariş artıq gözləyir');
  const d = procDb();
  const now = new Date().toISOString();
  d.prepare('UPDATE order_items SET approved_qty = NULL WHERE order_id = ?').run(order.id);
  d.prepare('UPDATE orders SET status = ?, decided_by = NULL, decided_at = NULL, updated_at = ? WHERE id = ?')
    .run('pending', now, order.id);
  d.prepare(`INSERT INTO status_history (order_id, from_status, to_status, actor_id)
              VALUES (?, ?, ?, ?)`)
    .run(order.id, order.status, 'pending', req.user.id);
  res.json({ ok: true, status: 'pending' });
});

// Orders are destructive records; only a boss can remove one.
r.delete('/orders/:id', requireBoss, (req, res) => {
  const order = loadOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  procDb().prepare('DELETE FROM orders WHERE id = ?').run(order.id);
  res.json({ ok: true });
});

// Threaded comments: body mütləqdir, parent_id (reply) opsionaldır —
// yalnız EYNİ sifarişin comment-inə cavab vermək olar (cross-order → 400).
// @mention-lər serverdə body-dən çıxarılıb mentions_csv-ə yazılır.
r.post('/orders/:id/comments', denyStorekeeper, (req, res) => {
  const order = loadOrder(req.params.id);
  const denied = ensureVisible(req.user, order);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  const body = str(req.body?.body, 2000);
  if (!body) throw new HttpError(400, 'body_required');
  const db = procDb();
  let parentId = null;
  if (req.body?.parent_id !== undefined && req.body?.parent_id !== null && String(req.body.parent_id) !== '') {
    parentId = Number(req.body.parent_id);
    if (!Number.isInteger(parentId) || parentId <= 0) throw new HttpError(400, 'parent_invalid');
    const parent = db.prepare('SELECT id, order_id, author_id, author_name FROM comments WHERE id = ?').get(parentId);
    if (!parent || parent.order_id !== order.id) throw new HttpError(400, 'parent_invalid', 'Cavab yalnız bu sifarişin comment-inə verilə bilər');
  }
  const mentions = extractMentions(body)
    .filter((login) => db.prepare('SELECT 1 FROM users WHERE login = ?').get(login));
  const info = db.prepare('INSERT INTO comments (order_id, author_id, author_name, body, parent_id, mentions_csv) VALUES (?, ?, ?, ?, ?, ?)')
    .run(order.id, req.user.id, req.user.full_name, body, parentId, mentions.join(','));
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

// Mention autocomplete: sifarişin görünən iştirakçıları (author-lar + sifarişi yaradan).
// ensureVisible keçibsə, bu siyahı da ona görünür — yeni məlumat sızmır.
r.get('/orders/:id/mentionables', (req, res) => {
  const order = loadOrder(req.params.id);
  const denied = ensureVisible(req.user, order);
  if (denied) return res.status(denied.status).json({ error: denied.error });
  const db = procDb();
  const rows = db.prepare(
    `SELECT DISTINCT u.id, u.full_name, u.login, u.proc_role FROM comments c
     JOIN users u ON u.id = c.author_id WHERE c.order_id = ?
     UNION SELECT u.id, u.full_name, u.login, u.proc_role FROM orders o
     JOIN users u ON u.id = o.requester_id WHERE o.id = ?
     ORDER BY full_name ASC`,
  ).all(order.id, order.id);
  res.json({ users: rows.map((u) => ({ id: u.id, full_name: u.full_name, login: u.login, proc_role: u.proc_role })) });
});

// ── Anbar (warehouse): Excel "anbar faktiki sayım" 1:1 ──
// Malın adı | Ölçü vahidi | Miqdarı → name | unit | qty. Real CRUD +
// persistent SQLite. Read: hamı; write: hamı (rol məhdudu yoxdur —
// boss da, specialist də anbarla işləyir).
function prepWarehouse(body) {
  const data = {};
  if (body.name !== undefined) data.name = str(body.name, 500);
  if (body.unit !== undefined) data.unit = str(body.unit, 40) || 'ədəd';
  if (body.qty !== undefined) data.qty = num(body.qty);
  return data;
}

r.get('/warehouse', (req, res) => {
  const q = str(req.query.q, 200).toLowerCase();
  const items = procDb().prepare('SELECT * FROM warehouse_items ORDER BY name ASC').all();
  if (!q) return res.json({ items });
  res.json({ items: items.filter((it) => `${it.name} ${it.unit}`.toLowerCase().includes(q)) });
});

r.post('/warehouse', (req, res) => {
  const data = prepWarehouse(req.body || {});
  if (!data.name) throw new HttpError(400, 'name_required', 'Məhsul adı mütləqdir');
  if (!data.unit) data.unit = 'ədəd';
  if (!Number.isFinite(data.qty) || data.qty < 0) throw new HttpError(400, 'qty_invalid', 'Miqdar 0 və ya böyük olmalıdır');
  try {
    const now = new Date().toISOString();
    const info = procDb().prepare(
      'INSERT INTO warehouse_items (name, unit, qty, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(data.name, data.unit, data.qty, now, now);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch (e) {
    if (String(e?.message).includes('UNIQUE')) throw new HttpError(409, 'duplicate_product', 'Bu məhsul artıq anbardadır (ad + vahid)');
    throw e;
  }
});

r.put('/warehouse/:id', (req, res) => {
  const data = prepWarehouse(req.body || {});
  const keys = Object.keys(data).filter((k) => ['name', 'unit', 'qty'].includes(k));
  if (!keys.length) throw new HttpError(400, 'no_fields');
  if (data.qty !== undefined && (!Number.isFinite(data.qty) || data.qty < 0)) {
    throw new HttpError(400, 'qty_invalid', 'Miqdar 0 və ya böyük olmalıdır');
  }
  try {
    procDb().prepare(`UPDATE warehouse_items SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => data[k]), new Date().toISOString(), Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    if (String(e?.message).includes('UNIQUE')) throw new HttpError(409, 'duplicate_product', 'Bu məhsul artıq anbardadır (ad + vahid)');
    throw e;
  }
});

// POST /api/procurement/warehouse/replace — Tam yeniləmə (Excel import).
// Body: { items: [{ name, unit, qty }] }. Bütün anbar əvəz olunur.
// Silinmə tarixçəsi (stock_removal_items) sağ qalır
// (warehouse_item_id ON DELETE SET NULL + snapshot ad/vahid).
r.post('/warehouse/replace', (req, res) => {
  const raw = req.body?.items;
  if (!Array.isArray(raw)) throw new HttpError(400, 'items_required');
  if (raw.length > 10000) throw new HttpError(400, 'too_many_items', 'Maksimum 10000 məhsul');
  const seen = new Set();
  const clean = raw.map((it, i) => {
    const name = str(it?.name, 500);
    const unit = str(it?.unit, 40) || 'ədəd';
    const qty = num(it?.qty);
    if (!name) throw new HttpError(400, 'name_required', `Sətir ${i + 1}: məhsul adı boşdur`);
    if (!Number.isFinite(qty) || qty < 0) throw new HttpError(400, 'qty_invalid', `Sətir ${i + 1} (${name}): miqdar yanlışdır`);
    const dupKey = `${name.toLowerCase()}::${unit.toLowerCase()}`;
    if (seen.has(dupKey)) throw new HttpError(400, 'duplicate_product', `Təkrar məhsul: ${name} (${unit})`);
    seen.add(dupKey);
    return { name, unit, qty };
  });
  const d = procDb();
  const now = new Date().toISOString();
  d.prepare('DELETE FROM warehouse_items').run();
  const ins = d.prepare(
    'INSERT INTO warehouse_items (name, unit, qty, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  );
  for (const c of clean) ins.run(c.name, c.unit, c.qty, now, now);
  res.json({ ok: true, count: clean.length });
});

// ── Silinmələr: başlıq (№ + təyinat + tarix) + sətirlər (məhsul + miqdar + açıqlama) ──
function removalWithItems(d, r) {
  const items = d.prepare('SELECT * FROM stock_removal_items WHERE removal_id = ? ORDER BY id').all(r.id);
  return { ...r, items };
}

r.get('/warehouse/removals', (req, res) => {
  const d = procDb();
  const rows = d.prepare(
    `SELECT r.*, u.full_name AS created_by_name FROM stock_removals r
     LEFT JOIN users u ON u.id = r.created_by ORDER BY r.id DESC LIMIT 500`,
  ).all();
  res.json({ items: rows.map((x) => removalWithItems(d, x)) });
});

// POST /api/procurement/warehouse/removals — Silinmə yarat.
// Body: { doc_no?, destination, note?, lines: [{ warehouse_item_id, qty, note? }] }.
// Məntiq: stok yoxlanılır (artıq silinməyə 400) → əsas anbardan çıxılır →
// silinmə sənədi + sətirlər yazılır. Hamısı ardıcıl (tək shared connection).
r.post('/warehouse/removals', (req, res) => {
  const d = procDb();
  const body = req.body || {};
  const destination = str(body.destination, 200);
  if (!destination) throw new HttpError(400, 'destination_required', 'Təyinat / obyekt mütləqdir (məs: Hotel)');
  let docNo = str(body.doc_no, 40);
  if (!docNo) {
    const mx = d.prepare('SELECT MAX(id) AS m FROM stock_removals').get()?.m || 0;
    docNo = String(Number(mx) + 1);
  }
  const headerNote = str(body.note, 2000);
  const lines = body.lines;
  if (!Array.isArray(lines) || !lines.length) throw new HttpError(400, 'lines_required', 'Ən azı bir məhsul seçin');
  if (lines.length > 200) throw new HttpError(400, 'too_many_lines', 'Maksimum 200 sətir');

  const clean = lines.map((ln, i) => {
    const wid = Number(ln?.warehouse_item_id);
    const qty = num(ln?.qty);
    const note = str(ln?.note, 2000);
    if (!Number.isInteger(wid) || wid <= 0) throw new HttpError(400, 'product_required', `Sətir ${i + 1}: məhsul seçin`);
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, 'qty_invalid', `Sətir ${i + 1}: miqdar 0-dan böyük olmalıdır`);
    const prod = d.prepare('SELECT * FROM warehouse_items WHERE id = ?').get(wid);
    if (!prod) throw new HttpError(404, 'product_not_found', `Sətir ${i + 1}: məhsul tapılmadı`);
    if (qty > Number(prod.qty)) {
      throw new HttpError(400, 'qty_exceeds', `"${prod.name}" — stokda ${prod.qty} ${prod.unit} var, ${qty} silinə bilməz`);
    }
    return { prod, qty, note };
  });

  const now = new Date().toISOString();
  const info = d.prepare(
    'INSERT INTO stock_removals (doc_no, destination, note, created_by, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(docNo, destination, headerNote, req.user?.id ?? null, now);
  const removalId = Number(info.lastInsertRowid);
  const insLine = d.prepare(
    'INSERT INTO stock_removal_items (removal_id, warehouse_item_id, product_name, unit, qty, note) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const decStock = d.prepare('UPDATE warehouse_items SET qty = qty - ?, updated_at = ? WHERE id = ?');
  for (const ln of clean) {
    insLine.run(removalId, ln.prod.id, ln.prod.name, ln.prod.unit, ln.qty, ln.note);
    decStock.run(ln.qty, now, ln.prod.id);
  }
  res.status(201).json({ id: removalId, doc_no: docNo });
});

// GET /api/procurement/warehouse/removals/:id — silinmə detalı (drawer üçün).
r.get('/warehouse/removals/:id', (req, res) => {
  const d = procDb();
  const row = d.prepare(
    `SELECT r.*, u.full_name AS created_by_name FROM stock_removals r
     LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ?`,
  ).get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'removal_not_found', message: 'Silinmə tapılmadı' });
  res.json({ removal: removalWithItems(d, row) });
});

// PUT /api/procurement/warehouse/removals/:id — silinməni redaktə et.
// Body: { doc_no?, destination?, note?, lines: [{ warehouse_item_id, qty, note? }] }.
// Stok məntiqi (delta): bütün yeni sətirlər ÖNCƏ yoxlanılır (heç bir yazı
// aparılmadan) — köhnə sətirlərin miqdarı virtual geri qaytarılmış stokla
// müqayisə olunur; sonra header + sətirlər əvəz olunur və hər məhsul üzrə
// fərq (köhnə − yeni) stoka tətbiq edilir. Yazılar ardıcıl (tək connection).
r.put('/warehouse/removals/:id', (req, res) => {
  const d = procDb();
  const removal = d.prepare('SELECT * FROM stock_removals WHERE id = ?').get(Number(req.params.id));
  if (!removal) return res.status(404).json({ error: 'removal_not_found', message: 'Silinmə tapılmadı' });
  const oldLines = d.prepare('SELECT * FROM stock_removal_items WHERE removal_id = ?').all(removal.id);
  const body = req.body || {};
  const destination = body.destination !== undefined ? str(body.destination, 200) : removal.destination;
  if (!destination) throw new HttpError(400, 'destination_required', 'Təyinat / obyekt mütləqdir (məs: Hotel)');
  const docNo = body.doc_no !== undefined ? (str(body.doc_no, 40) || removal.doc_no) : removal.doc_no;
  const headerNote = body.note !== undefined ? str(body.note, 2000) : removal.note;
  const lines = body.lines;
  if (!Array.isArray(lines) || !lines.length) throw new HttpError(400, 'lines_required', 'Ən azı bir məhsul seçin');
  if (lines.length > 200) throw new HttpError(400, 'too_many_lines', 'Maksimum 200 sətir');

  // Köhnə sətirlərin məhsul üzrə cəmi (silinmiş məhsul → bərpa mümkün deyil, 0).
  const oldByProd = new Map();
  for (const ol of oldLines) {
    if (ol.warehouse_item_id == null) continue;
    oldByProd.set(ol.warehouse_item_id, (oldByProd.get(ol.warehouse_item_id) || 0) + Number(ol.qty));
  }

  const clean = lines.map((ln, i) => {
    const wid = Number(ln?.warehouse_item_id);
    const qty = num(ln?.qty);
    const note = str(ln?.note, 2000);
    if (!Number.isInteger(wid) || wid <= 0) throw new HttpError(400, 'product_required', `Sətir ${i + 1}: məhsul seçin`);
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, 'qty_invalid', `Sətir ${i + 1}: miqdar 0-dan böyük olmalıdır`);
    const prod = d.prepare('SELECT * FROM warehouse_items WHERE id = ?').get(wid);
    if (!prod) throw new HttpError(404, 'product_not_found', `Sətir ${i + 1}: məhsul tapılmadı`);
    return { prod, qty, note };
  });
  // Eyni məhsul bir neçə sətirdə ola bilər — cəm yoxlanılır.
  const newByProd = new Map();
  for (const ln of clean) newByProd.set(ln.prod.id, (newByProd.get(ln.prod.id) || 0) + ln.qty);
  for (const [wid, total] of newByProd) {
    const prod = d.prepare('SELECT * FROM warehouse_items WHERE id = ?').get(wid);
    const restored = (oldByProd.get(wid) || 0);
    const avail = Number(prod.qty) + restored;
    if (total > avail) {
      throw new HttpError(400, 'qty_exceeds', `"${prod.name}" — stokda ${avail} ${prod.unit} var (bu silinmədəki ${restored} daxil), ${total} saxlanıla bilməz`);
    }
  }

  const now = new Date().toISOString();
  d.prepare('UPDATE stock_removals SET doc_no = ?, destination = ?, note = ? WHERE id = ?')
    .run(docNo, destination, headerNote, removal.id);
  d.prepare('DELETE FROM stock_removal_items WHERE removal_id = ?').run(removal.id);
  const insLine = d.prepare(
    'INSERT INTO stock_removal_items (removal_id, warehouse_item_id, product_name, unit, qty, note) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const adjStock = d.prepare('UPDATE warehouse_items SET qty = qty + ?, updated_at = ? WHERE id = ?');
  for (const wid of new Set([...oldByProd.keys(), ...newByProd.keys()])) {
    const delta = (oldByProd.get(wid) || 0) - (newByProd.get(wid) || 0);
    if (delta !== 0) adjStock.run(delta, now, wid);
  }
  for (const ln of clean) insLine.run(removal.id, ln.prod.id, ln.prod.name, ln.prod.unit, ln.qty, ln.note);
  res.json({ ok: true, id: removal.id, doc_no: docNo });
});

// DELETE /api/procurement/warehouse/removals/:id — silinməni sil, miqdarları stoka geri qaytar.
// Məhsul artıq anbarda yoxdursa (Tam yeniləmə ilə silinibsə) həmin sətir bərpa
// olunmur — tarixçə snapshot-u (ad/vahid) itmir, sadəcə stok toxunulmur.
r.delete('/warehouse/removals/:id', (req, res) => {
  const d = procDb();
  const removal = d.prepare('SELECT * FROM stock_removals WHERE id = ?').get(Number(req.params.id));
  if (!removal) return res.status(404).json({ error: 'removal_not_found', message: 'Silinmə tapılmadı' });
  const lines = d.prepare('SELECT * FROM stock_removal_items WHERE removal_id = ?').all(removal.id);
  const now = new Date().toISOString();
  const restore = d.prepare('UPDATE warehouse_items SET qty = qty + ?, updated_at = ? WHERE id = ?');
  let restored = 0;
  for (const ln of lines) {
    if (ln.warehouse_item_id == null) continue;
    const info = restore.run(ln.qty, now, ln.warehouse_item_id);
    restored += Number(info.changes || 0) ? 1 : 0;
  }
  d.prepare('DELETE FROM stock_removals WHERE id = ?').run(removal.id);
  res.json({ ok: true, restored });
});

// POST /api/procurement/warehouse/removals/:id/approve — silinməni təsdiqlə.
// Yalnız boss + specialist (anbardar təsdiqləyə bilməz). pending → approved.
// Stoka toxunmur — stok silinmə yaradılanda artıq azalıb. Təkrar təsdiq → 409.
r.post('/warehouse/removals/:id/approve', denyStorekeeper, (req, res) => {
  const d = procDb();
  const removal = d.prepare('SELECT * FROM stock_removals WHERE id = ?').get(Number(req.params.id));
  if (!removal) return res.status(404).json({ error: 'removal_not_found', message: 'Silinmə tapılmadı' });
  if (removal.status === 'approved') throw new HttpError(409, 'already_approved', 'Silinmə artıq təsdiqlənib');
  d.prepare('UPDATE stock_removals SET status = ? WHERE id = ?').run('approved', removal.id);
  res.json({ ok: true, status: 'approved' });
});

// ── Silinmə kommentləri (flat: müəllif + mətn + tarix) ──
function loadRemoval(id) {
  return procDb().prepare('SELECT * FROM stock_removals WHERE id = ?').get(Number(id)) || null;
}

r.get('/warehouse/removals/:id/comments', (req, res) => {
  const removal = loadRemoval(req.params.id);
  if (!removal) return res.status(404).json({ error: 'removal_not_found', message: 'Silinmə tapılmadı' });
  const items = procDb().prepare(
    'SELECT * FROM removal_comments WHERE removal_id = ? ORDER BY created_at, id',
  ).all(removal.id);
  res.json({ items });
});

r.post('/warehouse/removals/:id/comments', (req, res) => {
  const removal = loadRemoval(req.params.id);
  if (!removal) return res.status(404).json({ error: 'removal_not_found', message: 'Silinmə tapılmadı' });
  const body = str(req.body?.body, 2000);
  if (!body) throw new HttpError(400, 'body_required', 'Komment mətni mütləqdir');
  const info = procDb().prepare(
    'INSERT INTO removal_comments (removal_id, author_id, author_name, body) VALUES (?, ?, ?, ?)',
  ).run(removal.id, req.user.id, req.user.full_name, body);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

// ── Dashboard (server aggregates; boss + specialist — anbardar görmür) ──
// Volume rule: status IN (approved, partially_approved), value = effectiveQty × snapshot.
r.get('/dashboard', denyStorekeeper, (req, res) => {
  const d = procDb();
  const items = d.prepare(
    `SELECT i.*, o.status, substr(o.decided_at, 1, 7) AS month
     FROM order_items i JOIN orders o ON o.id = i.order_id
     WHERE o.status IN ('approved', 'partially_approved') AND o.decided_at IS NOT NULL`,
  ).all();

  const byMonth = new Map();
  for (const it of items) {
    const m = it.month || '—';
    byMonth.set(m, (byMonth.get(m) || 0) + effectiveQty(it) * Number(it.unit_price));
  }
  const volume_trend = [...byMonth.entries()]
    .map(([month, value]) => ({ month, value: round2(value) }))
    .sort((a, b) => (a.month < b.month ? -1 : 1));

  const all = d.prepare('SELECT * FROM order_items i JOIN orders o ON o.id = i.order_id').all();
  let reqTotal = 0;
  let approvedTotal = 0;
  let rejectedTotal = 0;
  let rejectedValue = 0;
  let totalOrders = 0;
  let rejectedOrders = 0;
  const statusAmounts = { approved: 0, partially_approved: 0, rejected: 0, pending: 0 };
  const seen = new Set();
  for (const it of all) {
    const line = Number(it.requested_qty) * Number(it.unit_price);
    reqTotal += line;
    if (!seen.has(it.order_id)) {
      seen.add(it.order_id);
      totalOrders++;
      if (it.status === 'rejected') rejectedOrders++;
    }
    if (it.status === 'approved' || it.status === 'partially_approved') {
      const approvedLine = effectiveQty(it) * Number(it.unit_price);
      approvedTotal += approvedLine;
      statusAmounts[it.status] += approvedLine;
    } else if (it.status === 'rejected') {
      rejectedTotal++;
      rejectedValue += line;
      statusAmounts.rejected += line;
    } else if (it.status === 'pending') {
      statusAmounts.pending += line;
    }
  }
  // Saved = what was requested but never approved (rejected fully + partial deltas).
  const saved = round2(reqTotal - approvedTotal - pendingValue(d));
  res.json({
    volume_trend,
    cancelled: {
      total_orders: totalOrders,
      rejected_orders: rejectedOrders,
      share: totalOrders ? round2((rejectedOrders / totalOrders) * 100) : 0,
      rejected_value: round2(rejectedValue),
      saved_amount: saved,
    },
    status_amounts: Object.fromEntries(Object.entries(statusAmounts).map(([status, value]) => [status, round2(value)])),
    counts: statusCounts(d),
  });
});

function pendingValue(d) {
  const rows = d.prepare(
    `SELECT i.requested_qty, i.unit_price FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.status = 'pending'`,
  ).all();
  return round2(rows.reduce((s, it) => s + Number(it.requested_qty) * Number(it.unit_price), 0));
}

function statusCounts(d) {
  const rows = d.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all();
  const out = { pending: 0, approved: 0, partially_approved: 0, rejected: 0 };
  for (const r of rows) if (r.status in out) out[r.status] = r.n;
  return out;
}

export default r;
