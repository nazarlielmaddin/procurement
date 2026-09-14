// Express app factory (no listen here — index.js listens, tests import app).
import express from 'express';
import cookieParser from 'cookie-parser';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import procurement from './routes/procurement.js';
import { procDb } from './lib/proc_db.js';
import { str } from './lib/proc_helpers.js';
import { createSession, destroySession, COOKIE, authenticate } from './lib/proc_access.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Ensure DB exists on boot.
  procDb();

  // ── Standalone auth (the Appina drop-in reuses Appina's own session) ──
  // Tiny in-memory brute-force throttle: 20 attempts / minute / IP.
  const attempts = new Map();
  const throttled = (ip) => {
    const now = Date.now();
    const rec = attempts.get(ip) || { n: 0, reset: now + 60000 };
    if (now > rec.reset) { rec.n = 0; rec.reset = now + 60000; }
    rec.n++;
    attempts.set(ip, rec);
    if (attempts.size > 1000) attempts.clear();
    return rec.n > 20;
  };
  // Tap-to-enter: no passwords — the user just picks their own profile.
  // Local-trusted tool: the TAKEOVER warning is by design (it IS the user).
  app.get('/api/auth/users', (req, res) => {
    const users = procDb().prepare(
      'SELECT id, full_name, login, proc_role FROM users WHERE proc_access = 1 ORDER BY proc_role DESC, full_name ASC',
    ).all();
    res.json({ users });
  });

  app.post('/api/auth/login', (req, res) => {
    if (throttled(req.ip)) return res.status(429).json({ error: 'login_rate_limited' });
    const login = str(req.body?.login, 120).toLowerCase();
    if (!login) return res.status(400).json({ error: 'login_required' });
    const user = procDb().prepare('SELECT * FROM users WHERE login = ?').get(login);
    if (!user || !user.proc_access) return res.status(401).json({ error: 'unknown_user' });
    const { token, exp } = createSession(user.id);
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      // Local dev runs plain HTTP; production must be HTTPS-only.
      secure: process.env.NODE_ENV === 'production',
      expires: new Date(exp),
    });
    res.json({
      ok: true,
      user: { id: user.id, full_name: user.full_name, login: user.login, proc_role: user.proc_role, must_rotate: false },
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    destroySession(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', authenticate, (req, res) => {
    res.json({ user: { id: req.user.id, full_name: req.user.full_name, login: req.user.login, proc_role: req.user.proc_role, must_rotate: !!req.user.must_rotate } });
  });

  // Kept for backward compatibility: tap-to-enter needs no rotation.
  app.post('/api/auth/rotate', authenticate, (req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/procurement', procurement);

  // Central error formatter: HttpError → {error: code}, else 500.
  app.use((err, _req, res, _next) => { // eslint-disable-line no-unused-vars
    if (err?.status) return res.status(err.status).json({ error: err.code || 'error', message: err.message });
    console.error(err);
    res.status(500).json({ error: 'internal' });
  });

  // Static client (after `npm run build` in ../client).
  const dist = resolve(__dirname, '..', 'client', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
  }

  return app;
}
