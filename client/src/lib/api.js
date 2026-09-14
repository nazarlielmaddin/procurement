// Thin fetch wrapper (mirrors Appina Finance lib/api.js).
const BASE = '/api';

async function request(method, path, body, opts = {}) {
  const isForm = body instanceof FormData;
  const res = await fetch(BASE + path, {
    method,
    credentials: 'include',
    headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    ...opts,
  });

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const err = new Error((data && (data.message || data.error)) || res.statusText || 'Request failed');
    err.status = res.status;
    err.code = data && data.error;
    throw err;
  }
  return data;
}

export const api = {
  get: (p, opts) => request('GET', p, null, opts),
  post: (p, b, opts) => request('POST', p, b, opts),
  patch: (p, b, opts) => request('PATCH', p, b, opts),
  put: (p, b, opts) => request('PUT', p, b, opts),
  del: (p, opts) => request('DELETE', p, null, opts),
};

export { BASE };
