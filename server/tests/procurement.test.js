// RBAC + lock + validation + dashboard tests. Memory DB per run.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.PROC_DB = ':memory:';

const { createApp } = await import('../app.js');
const { procDb } = await import('../lib/proc_db.js');

let app;
let server;
let base;

// Tap-to-enter: no passwords. Placeholder hash kept for the NOT NULL column.
const users = {
  spec: { login: 'spec1', role: 'procurement_specialist', name: 'Spec One' },
  spec2: { login: 'spec2', role: 'procurement_specialist', name: 'Spec Two' },
  boss: { login: 'boss1', role: 'boss', name: 'Boss One' },
};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Login sets an httpOnly cookie — tests extract the token from set-cookie
// and resend it as a Cookie header.
// Token cache: login throttle (20/dəq/IP) test suitində keçilməsin deyə
// hər user üçün token bir dəfə alınır, sonra təkrar istifadə olunur.
const tokenCache = new Map();
async function loginToken(u) {
  if (tokenCache.has(u.login)) return tokenCache.get(u.login);
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: u.login }),
  });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie') || '';
  const m = /proc_token=([^;]+)/.exec(cookie);
  assert.ok(m, 'session cookie set');
  tokenCache.set(u.login, m[1]);
  return m[1];
}

function cookieFetch(token) {
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: `proc_token=${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

before(async () => {
  const db = procDb();
  for (const u of Object.values(users)) {
    db.prepare('INSERT INTO users (full_name, login, password_hash, proc_role, must_rotate) VALUES (?, ?, ?, ?, 0)')
      .run(u.name, u.login, 'nopw', u.role);
  }
  db.prepare("INSERT INTO price_catalog (internal_id, name, unit, firm, buy_price, sell_price) VALUES ('TST-001', 'Test mal', 'əd', 'UMUMI', 10, 15)").run();
  app = createApp();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

describe('auth', () => {
  it('lists tap-to-enter profiles', async () => {
    const res = await fetch(base + '/api/auth/users');
    assert.equal(res.status, 200);
    const d = await res.json();
    assert.equal(d.users.length, 3);
  });

  it('rejects unknown users', async () => {
    const res = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'no-such-user' }),
    });
    assert.equal(res.status, 401);
  });

  it('blocks unauthenticated procurement access', async () => {
    const res = await fetch(base + '/api/procurement/orders');
    assert.equal(res.status, 401);
  });
});

describe('catalog RBAC', () => {
  it('specialist reads but cannot write', async () => {
    const t = await loginToken(users.spec);
    const f = cookieFetch(t);
    const list = await f('GET', '/api/procurement/catalog');
    assert.equal(list.status, 200);
    assert.ok(list.data.items.length >= 1);
    const w = await f('POST', '/api/procurement/catalog', { internal_id: 'X-1', name: 'x', unit: 'əd', buy_price: 1, sell_price: 2 });
    assert.equal(w.status, 403);
    assert.equal(w.data.error, 'boss_only');
  });

  it('boss creates; duplicate internal_id same firm → 409', async () => {
    const t = await loginToken(users.boss);
    const f = cookieFetch(t);
    const c = await f('POST', '/api/procurement/catalog', { internal_id: 'tst-002', name: 'Mal 2', unit: 'əd', buy_price: 5, sell_price: 8, firm: 'ACME' });
    assert.equal(c.status, 201);
    const dup = await f('POST', '/api/procurement/catalog', { internal_id: ' tst-002 ', name: 'Dup', unit: 'əd', buy_price: 1, sell_price: 1, firm: 'acme' });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.error, 'internal_id_taken');
  });

  it('POST without firm defaults to UMUMI; sell_price accepted and ignored', async () => {
    const t = await loginToken(users.boss);
    const f = cookieFetch(t);
    const c = await f('POST', '/api/procurement/catalog', { internal_id: 'tst-003', name: 'Mal 3', unit: 'əd', buy_price: 7, sell_price: 999 });
    assert.equal(c.status, 201);
    const list = await f('GET', '/api/procurement/catalog?q=TST-003');
    const row = list.data.items.find((i) => i.internal_id === 'TST-003');
    assert.ok(row);
    assert.equal(row.firm, 'UMUMI');
    assert.equal(row.buy_price, 7);
    assert.equal(row.sell_price, 7);
  });

  it('same internal_id in two firms is allowed', async () => {
    const t = await loginToken(users.boss);
    const f = cookieFetch(t);
    const a = await f('POST', '/api/procurement/catalog', { internal_id: 'SHARED-1', name: 'A malı', unit: 'əd', buy_price: 3, firm: 'FIRMA-A' });
    assert.equal(a.status, 201);
    const b = await f('POST', '/api/procurement/catalog', { internal_id: 'shared-1', name: 'B malı', unit: 'əd', buy_price: 4, firm: 'FIRMA-B' });
    assert.equal(b.status, 201);
  });

  it('GET /catalog ?firm= filters; q matches firm rows', async () => {
    const t = await loginToken(users.boss);
    const f = cookieFetch(t);
    const scoped = await f('GET', '/api/procurement/catalog?firm=FIRMA-A');
    assert.equal(scoped.status, 200);
    assert.ok(scoped.data.items.length >= 1);
    assert.ok(scoped.data.items.every((i) => String(i.firm).toUpperCase() === 'FIRMA-A'));
    const byQ = await f('GET', '/api/procurement/catalog?q=SHARED-1');
    assert.ok(byQ.data.items.length >= 2);
    assert.ok(byQ.data.items.some((i) => String(i.firm).toUpperCase() === 'FIRMA-A'));
    assert.ok(byQ.data.items.some((i) => String(i.firm).toUpperCase() === 'FIRMA-B'));
    // q matches the firm column itself, not just ID/name.
    const byFirm = await f('GET', '/api/procurement/catalog?q=FIRMA-B');
    assert.ok(byFirm.data.items.length >= 1);
    assert.ok(byFirm.data.items.some((i) => String(i.firm).toUpperCase() === 'FIRMA-B'));
  });
});

describe('orders + decisions', () => {
  let orderId;

  it('specialist creates an order with catalog snapshot', async () => {
    const t = await loginToken(users.spec);
    const f = cookieFetch(t);
    const r = await f('POST', '/api/procurement/orders', {
      requester_name: 'Əməkdaş A', reason: 'Ofis üçün',
      items: [{ catalog_id: 1, requested_qty: 3 }, { product_name: 'Xüsusi kabel', unit: 'm', unit_price: 4, requested_qty: 10 }],
    });
    assert.equal(r.status, 201);
    orderId = r.data.id;
    const d = await f('GET', `/api/procurement/orders/${orderId}`);
    assert.equal(d.status, 200);
    assert.equal(d.data.order.status, 'pending');
    assert.equal(d.data.order.requested, 3 * 10 + 10 * 4);
    assert.equal(d.data.items[0].product_name, 'Test mal');
    // Order price defaults to the catalog buy_price (10), not sell_price (15).
    assert.equal(d.data.items[0].unit_price, 10);
  });

  it('other specialist cannot see it (403)', async () => {
    const t = await loginToken(users.spec2);
    const f = cookieFetch(t);
    const d = await f('GET', `/api/procurement/orders/${orderId}`);
    assert.equal(d.status, 403);
    const list = await f('GET', '/api/procurement/orders');
    assert.equal(list.data.items.length, 0);
  });

  it('specialist cannot decide (403)', async () => {
    const t = await loginToken(users.spec);
    const f = cookieFetch(t);
    const d = await f('POST', `/api/procurement/orders/${orderId}/decision`, { decision: 'approved' });
    assert.equal(d.status, 403);
  });

  it('boss partially approves with qty edits + comment', async () => {
    const t = await loginToken(users.boss);
    const f = cookieFetch(t);
    const before = await f('GET', `/api/procurement/orders/${orderId}`);
    const ids = before.data.items.map((i) => i.id);
    const d = await f('POST', `/api/procurement/orders/${orderId}/decision`, {
      decision: 'partially_approved',
      items: [{ id: ids[0], approved_qty: 2 }, { id: ids[1], approved_qty: 10 }],
      comment: 'Monitor 2 ədəd kifayətdir',
    });
    assert.equal(d.status, 200);
    assert.equal(d.data.status, 'partially_approved');
    const after = await f('GET', `/api/procurement/orders/${orderId}`);
    assert.equal(after.data.order.status, 'partially_approved');
    assert.equal(after.data.order.approved, 2 * 10 + 10 * 4);
    // 2 approved from the catalog snapshot → buy_price 10, not sell_price 15.
    assert.equal(after.data.items[0].unit_price, 10);
    assert.ok(after.data.comments.some((c) => c.body.includes('kifayətdir')));
    assert.ok(after.data.history.some((h) => h.to_status === 'partially_approved'));
  });

  it('locked order: no edit, no second decision (409)', async () => {
    const ts = await loginToken(users.spec);
    const fs = cookieFetch(ts);
    const e = await fs('PUT', `/api/procurement/orders/${orderId}`, {
      requester_name: 'X', reason: 'Y', items: [{ product_name: 'Z', unit: 'əd', unit_price: 1, requested_qty: 1 }],
    });
    assert.equal(e.status, 409);
    const tb = await loginToken(users.boss);
    const fb = cookieFetch(tb);
    const d = await fb('POST', `/api/procurement/orders/${orderId}/decision`, { decision: 'approved' });
    assert.equal(d.status, 409);
    assert.equal(d.data.error, 'ORDER_LOCKED');
  });

  it('boss reopens a decided order and revises the decision', async () => {
    const ts = await loginToken(users.spec);
    const fs = cookieFetch(ts);
    const tb = await loginToken(users.boss);
    const fb = cookieFetch(tb);
    const r = await fs('POST', '/api/procurement/orders', {
      requester_name: 'D', reason: 'Revizyon testi',
      items: [{ product_name: 'Stəkan', unit: 'əd', unit_price: 3, requested_qty: 2 }],
    });
    assert.equal(r.status, 201);
    const id = r.data.id;
    // specialist cannot reopen (403)
    const no = await fs('POST', `/api/procurement/orders/${id}/reopen`, {});
    assert.equal(no.status, 403);
    // boss approves → locked
    const ap = await fb('POST', `/api/procurement/orders/${id}/decision`, { decision: 'approved' });
    assert.equal(ap.status, 200);
    // boss reopens → pending again, history kept
    const ro = await fb('POST', `/api/procurement/orders/${id}/reopen`, {});
    assert.equal(ro.status, 200);
    assert.equal(ro.data.status, 'pending');
    const det = await fb('GET', `/api/procurement/orders/${id}`);
    assert.equal(det.data.order.status, 'pending');
    assert.ok(det.data.history.some((h) => h.to_status === 'pending'));
    // reopen while pending → 409
    const again = await fb('POST', `/api/procurement/orders/${id}/reopen`, {});
    assert.equal(again.status, 409);
    // revised decision works, then reopen once more so dashboard fixtures stay neutral (ends pending)
    const d2 = await fb('POST', `/api/procurement/orders/${id}/decision`, { decision: 'rejected', comment: 'Fikrimi dəyişdim' });
    assert.equal(d2.status, 200);
    const fin = await fb('GET', `/api/procurement/orders/${id}`);
    assert.equal(fin.data.order.status, 'rejected');
    const back = await fb('POST', `/api/procurement/orders/${id}/reopen`, {});
    assert.equal(back.status, 200);
  });

  it('reject works without a comment', async () => {
    const ts = await loginToken(users.spec);
    const fs = cookieFetch(ts);
    const r = await fs('POST', '/api/procurement/orders', {
      requester_name: 'B', reason: 'Test rədd',
      items: [{ product_name: 'Qələm', unit: 'əd', unit_price: 1, requested_qty: 5 }],
    });
    const tb = await loginToken(users.boss);
    const fb = cookieFetch(tb);
    const ok = await fb('POST', `/api/procurement/orders/${r.data.id}/decision`, { decision: 'rejected' });
    assert.equal(ok.status, 200);
  });

  it('partial with no cut is rejected', async () => {
    const ts = await loginToken(users.spec);
    const fs = cookieFetch(ts);
    const r = await fs('POST', '/api/procurement/orders', {
      requester_name: 'C', reason: 'Test kəsmə',
      items: [{ product_name: 'Dəftər', unit: 'əd', unit_price: 2, requested_qty: 4 }],
    });
    const det = await fs('GET', `/api/procurement/orders/${r.data.id}`);
    const tb = await loginToken(users.boss);
    const fb = cookieFetch(tb);
    const bad = await fb('POST', `/api/procurement/orders/${r.data.id}/decision`, {
      decision: 'partially_approved',
      items: [{ id: det.data.items[0].id, approved_qty: 4 }],
    });
    assert.equal(bad.status, 400);
  });
});

describe('threaded comments + mentions', () => {
  it('top-level, reply, and mention extraction', async () => {
    const ts = await loginToken(users.spec);
    const fs = cookieFetch(ts);
    const r = await fs('POST', '/api/procurement/orders', {
      requester_name: 'CMT', reason: 'Comment thread testi',
      items: [{ product_name: 'Marker', unit: 'əd', unit_price: 2, requested_qty: 3 }],
    });
    assert.equal(r.status, 201);
    const id = r.data.id;
    const tb = await loginToken(users.boss);
    const fb = cookieFetch(tb);
    // top-level with @mention of a real login
    const top = await fb('POST', `/api/procurement/orders/${id}/comments`, { body: '@spec1 bax, qiymət normaldır?' });
    assert.equal(top.status, 201);
    const det = await fb('GET', `/api/procurement/orders/${id}`);
    const saved = det.data.comments.find((c) => c.id === top.data.id);
    assert.ok(saved);
    assert.equal(saved.parent_id, null);
    assert.ok(String(saved.mentions_csv).split(',').includes('spec1'));
    // reply to it
    const rep = await fs('POST', `/api/procurement/orders/${id}/comments`, { body: 'Razıyam', parent_id: top.data.id });
    assert.equal(rep.status, 201);
    const det2 = await fs('GET', `/api/procurement/orders/${id}`);
    const child = det2.data.comments.find((c) => c.id === rep.data.id);
    assert.equal(child.parent_id, top.data.id);
  });

  it('cross-order parent is rejected (400)', async () => {
    const ts = await loginToken(users.spec);
    const fs = cookieFetch(ts);
    const a = await fs('POST', '/api/procurement/orders', {
      requester_name: 'CMT-A', reason: 'A', items: [{ product_name: 'A', unit: 'əd', unit_price: 1, requested_qty: 1 }],
    });
    const b = await fs('POST', '/api/procurement/orders', {
      requester_name: 'CMT-B', reason: 'B', items: [{ product_name: 'B', unit: 'əd', unit_price: 1, requested_qty: 1 }],
    });
    const tb = await loginToken(users.boss);
    const fb = cookieFetch(tb);
    const top = await fb('POST', `/api/procurement/orders/${a.data.id}/comments`, { body: 'A-order comment' });
    assert.equal(top.status, 201);
    const cross = await fb('POST', `/api/procurement/orders/${b.data.id}/comments`, { body: 'səhv yerə', parent_id: top.data.id });
    assert.equal(cross.status, 400);
    assert.equal(cross.data.error, 'parent_invalid');
    const missing = await fb('POST', `/api/procurement/orders/${b.data.id}/comments`, { body: 'yoxdur', parent_id: 999999 });
    assert.equal(missing.status, 400);
  });

  it('mentionables lists participants, strangers see nothing new', async () => {
    const t2 = await loginToken(users.spec2);
    const f2 = cookieFetch(t2);
    const ts = await loginToken(users.spec);
    const fs = cookieFetch(ts);
    const r = await fs('POST', '/api/procurement/orders', {
      requester_name: 'CMT-M', reason: 'Mention siyahısı',
      items: [{ product_name: 'C', unit: 'əd', unit_price: 1, requested_qty: 1 }],
    });
    // unrelated specialist: 403 (visibility gate holds)
    const denied = await f2('GET', `/api/procurement/orders/${r.data.id}/mentionables`);
    assert.equal(denied.status, 403);
    // owner sees requester + commenters
    const tb = await loginToken(users.boss);
    const fb = cookieFetch(tb);
    await fb('POST', `/api/procurement/orders/${r.data.id}/comments`, { body: 'Boss qeydi' });
    const ok = await fs('GET', `/api/procurement/orders/${r.data.id}/mentionables`);
    assert.equal(ok.status, 200);
    const logins = ok.data.users.map((u) => u.login);
    assert.ok(logins.includes('spec1'));
    assert.ok(logins.includes('boss1'));
  });
});

describe('dashboard', () => {
  it('counts decided orders, volume excludes rejected', async () => {
    const t = await loginToken(users.boss);
    const f = cookieFetch(t);
    const d = await f('GET', '/api/procurement/dashboard');
    assert.equal(d.status, 200);
    assert.ok(d.data.counts.partially_approved >= 1);
    assert.ok(d.data.counts.rejected >= 1);
    assert.ok(d.data.cancelled.saved_amount > 0);
    // 3 monitors requested, 2 approved → 10 saved (buy_price 10 × 1 cut);
    // rejected pen order → 5 saved. sell_price (15) never enters the math.
    const expectedSaved = 10 + 5;
    assert.equal(d.data.cancelled.saved_amount, expectedSaved);
    const vol = d.data.volume_trend.reduce((s, m) => s + m.value, 0);
    assert.equal(vol, 2 * 10 + 10 * 4);
  });
});

describe('catalog replace (Excel import)', () => {
  it('rejects >5000 items with too_many_items', async () => {
    const t = await loginToken(users.boss);
    const f = cookieFetch(t);
    const items = Array.from({ length: 5001 }, (_, i) => ({
      internal_id: `BULK-${i}`, name: `Mal ${i}`, unit: 'əd', buy_price: 1,
    }));
    const r = await f('POST', '/api/procurement/catalog/replace', { items, firm: 'BULK' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'too_many_items');
  });

  it('rejects duplicate IDs within one payload', async () => {
    const t = await loginToken(users.boss);
    const f = cookieFetch(t);
    const r = await f('POST', '/api/procurement/catalog/replace', {
      firm: 'DUPF',
      items: [
        { internal_id: 'DUP-1', name: 'Bir', unit: 'əd', buy_price: 1 },
        { internal_id: ' dup-1 ', name: 'İki', unit: 'əd', buy_price: 2 },
      ],
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'duplicate_id');
  });

  it('scoped replace wipes only the target firm', async () => {
    const t = await loginToken(users.boss);
    const f = cookieFetch(t);
    // FIRMA-A holds SHARED-1 from the earlier catalog test; UMUMI + FIRMA-B must survive.
    const r = await f('POST', '/api/procurement/catalog/replace', {
      firm: 'FIRMA-A',
      items: [{ internal_id: 'A-NEW', name: 'A yeni', unit: 'əd', buy_price: 9 }],
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.count, 1);
    assert.ok(r.data.firms.includes('FIRMA-A'));
    const scoped = await f('GET', '/api/procurement/catalog?firm=FIRMA-A');
    assert.equal(scoped.data.items.length, 1);
    assert.equal(scoped.data.items[0].internal_id, 'A-NEW');
    const other = await f('GET', '/api/procurement/catalog?firm=FIRMA-B');
    assert.ok(other.data.items.some((i) => i.internal_id === 'SHARED-1'));
    const umumi = await f('GET', '/api/procurement/catalog?firm=UMUMI');
    assert.ok(umumi.data.items.some((i) => i.internal_id === 'TST-001'));
  });

  it('full replace (no firm) rewrites everything and returns firms list', async () => {
    const t = await loginToken(users.boss);
    const f = cookieFetch(t);
    const r = await f('POST', '/api/procurement/catalog/replace', {
      items: [
        { internal_id: 'FULL-1', name: 'Tam 1', unit: 'əd', buy_price: 5, firm: 'X-FIRM' },
        { internal_id: 'FULL-2', name: 'Tam 2', unit: 'əd', buy_price: 6 },
      ],
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.count, 2);
    assert.deepEqual([...r.data.firms].sort(), ['UMUMI', 'X-FIRM']);
    const all = await f('GET', '/api/procurement/catalog');
    assert.equal(all.data.items.length, 2);
    assert.ok(!all.data.items.some((i) => i.internal_id === 'TST-001'));
  });
});
