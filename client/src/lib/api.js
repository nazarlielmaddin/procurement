// Browser-only demo API. GitHub Pages has no server runtime, so the public demo
// persists its data in localStorage and keeps the same response shapes as the API.
const BASE = import.meta.env.VITE_API_URL || '/api';
const KEY = 'appina-procurement-demo-v1';
const users = [
  { id: 1, full_name: 'Boss istifadəçi', login: 'boss', proc_role: 'boss', proc_access: 1 },
  { id: 2, full_name: 'Specialist istifadəçi', login: 'specialist', proc_role: 'procurement_specialist', proc_access: 1 },
];
const catalogSeed = [
  ['MON-24FHD', 'Monitor 24" FHD', 'əd', 280, 'IMZA'],
  ['MSE-WL01', 'Mouse simsiz', 'əd', 18, 'PREMIER'],
  ['KBD-MB02', 'Klaviatura mexaniki', 'əd', 45, 'IMZA'],
  ['NB-TP14', 'Noutbuk 14" (ofis)', 'əd', 1100, 'IMZA'],
  ['CBL-HDMI2', 'HDMI kabel 2m', 'əd', 6, 'PREMIER'],
].map((x, i) => ({ id: i + 1, internal_id: x[0], name: x[1], unit: x[2], buy_price: x[3], sell_price: x[3], firm: x[4] }));

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { catalog: catalogSeed, orders: [], nextOrder: 1, nextCatalog: 6, me: null }; }
  catch { return { catalog: catalogSeed, orders: [], nextOrder: 1, nextCatalog: 6, me: null }; }
}
function write(state) { localStorage.setItem(KEY, JSON.stringify(state)); return state; }
function result(data) { return Promise.resolve(data); }
function currentUser(state) { return users.find((u) => u.id === state.me) || users[1]; }
function totals(order) {
  return order.items.reduce((s, i) => s + Number(i.unit_price || 0) * Number(i.requested_qty || 0), 0);
}
function dashboard(state) {
  const amounts = { approved: 0, partially_approved: 0, rejected: 0, pending: 0 };
  const counts = { approved: 0, partially_approved: 0, rejected: 0, pending: 0 };
  state.orders.forEach((o) => { const k = o.status || 'pending'; amounts[k] += totals(o); counts[k]++; });
  return { counts, status_amounts: amounts, volume_trend: [], cancelled: { share: counts.rejected, saved_amount: amounts.rejected } };
}
function detail(state, id) {
  const order = state.orders.find((o) => o.id === Number(id));
  if (!order) throw Object.assign(new Error('Sifariş tapılmadı'), { status: 404 });
  return { order, items: order.items, comments: order.comments || [], history: order.history || [], mentionables: users };
}

async function mock(method, path, body) {
  const state = read();
  const cleanPath = path.split('?')[0];
  if (path === '/auth/users') return result({ users });
  if (path === '/auth/me') {
    if (!state.me) throw Object.assign(new Error('unauthorized'), { status: 401 });
    return result({ user: currentUser(state) });
  }
  if (path === '/auth/login') { const user = users.find((u) => u.login === body?.login); if (!user) throw Object.assign(new Error('unknown_user'), { status: 401 }); state.me = user.id; write(state); return result({ ok: true, user }); }
  if (path === '/auth/logout') { state.me = null; write(state); return result({ ok: true }); }
  if (cleanPath === '/procurement/catalog' && method === 'GET') return result({ items: state.catalog });
  if (cleanPath === '/procurement/catalog' && method === 'POST') {
    const row = { ...body, id: state.nextCatalog++, sell_price: body.buy_price };
    state.catalog.push(row); write(state); return result({ item: row });
  }
  if (cleanPath === '/procurement/catalog' && method === 'PUT') return result({ ok: true });
  const catalogId = cleanPath.match(/^\/procurement\/catalog\/(\d+)$/);
  if (catalogId && method === 'PUT') {
    const i = state.catalog.findIndex((x) => x.id === Number(catalogId[1]));
    state.catalog[i] = { ...state.catalog[i], ...body, sell_price: body.buy_price }; write(state); return result({ item: state.catalog[i] });
  }
  if (catalogId && method === 'DELETE') { state.catalog = state.catalog.filter((x) => x.id !== Number(catalogId[1])); write(state); return result({ ok: true }); }
  if (cleanPath === '/procurement/catalog/replace' && method === 'POST') { state.catalog = body.items.map((x, i) => ({ ...x, id: i + 1 })); write(state); return result({ ok: true }); }
  if (cleanPath === '/procurement/dashboard') return result(dashboard(state));
  if (path.startsWith('/procurement/orders/') && path.endsWith('/mentionables')) return result({ users });
  if (path.startsWith('/procurement/orders/') && !path.endsWith('/decision') && !path.endsWith('/reopen') && method === 'GET') return result(detail(state, path.split('/')[3]));
  if (cleanPath === '/procurement/orders' && method === 'GET') return result({ orders: state.orders });
  if (cleanPath === '/procurement/orders' && method === 'POST') {
    const order = { ...body, id: state.nextOrder++, status: 'pending', created_at: new Date().toISOString(), requester_name: currentUser(state).full_name, comments: [], history: [], items: body.items || [] };
    state.orders.unshift(order); write(state); return result({ order });
  }
  if (path.match(/^\/procurement\/orders\/\d+$/) && method === 'PUT') { const id = Number(path.split('/')[3]); const i = state.orders.findIndex((o) => o.id === id); state.orders[i] = { ...state.orders[i], ...body, items: body.items || state.orders[i].items }; write(state); return result({ order: state.orders[i] }); }
  if (path.match(/^\/procurement\/orders\/\d+$/) && method === 'DELETE') { state.orders = state.orders.filter((o) => o.id !== Number(path.split('/')[3])); write(state); return result({ ok: true }); }
  const decision = path.match(/^\/procurement\/orders\/(\d+)\/decision$/);
  if (decision) { const o = state.orders.find((x) => x.id === Number(decision[1])); o.status = body.decision; if (body.comment) o.comments.push({ body: body.comment, author_name: currentUser(state).full_name, created_at: new Date().toISOString() }); write(state); return result({ ok: true, order: o }); }
  const reopen = path.match(/^\/procurement\/orders\/(\d+)\/reopen$/);
  if (reopen) { const o = state.orders.find((x) => x.id === Number(reopen[1])); o.status = 'pending'; write(state); return result({ ok: true, order: o }); }
  const comment = path.match(/^\/procurement\/orders\/(\d+)\/comments$/);
  if (comment) { const o = state.orders.find((x) => x.id === Number(comment[1])); o.comments.push({ body: body.body, author_name: currentUser(state).full_name, created_at: new Date().toISOString() }); write(state); return result({ ok: true }); }
  return result({ ok: true });
}

async function request(method, path, body, opts = {}) {
  if (!import.meta.env.VITE_API_URL) return mock(method, path, body);
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + path, { method, credentials: 'include', headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined, ...opts });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) throw Object.assign(new Error((data && (data.message || data.error)) || res.statusText || 'Request failed'), { status: res.status, code: data?.error });
  return data;
}
export const api = { get: (p, o) => request('GET', p, null, o), post: (p, b, o) => request('POST', p, b, o), patch: (p, b, o) => request('PATCH', p, b, o), put: (p, b, o) => request('PUT', p, b, o), del: (p, o) => request('DELETE', p, null, o) };
export { BASE };
