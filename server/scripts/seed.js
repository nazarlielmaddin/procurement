// Idempotent seed: 4 users (tap-to-enter, no passwords) + 5 demo catalog items.
import { procDb, __resetDb } from '../lib/proc_db.js';

const SEEDS = [
  { full_name: 'Elməddin Nəzərli', login: 'elmeddin.nezerli', proc_role: 'procurement_specialist' },
  { full_name: 'Nəcəf Əsgərov', login: 'necef.esgerov', proc_role: 'procurement_specialist' },
  { full_name: 'Fərəc Fərəci', login: 'ferec.fereci', proc_role: 'boss' },
  { full_name: 'Fuad Amirov', login: 'fuad.amirov', proc_role: 'boss' },
];

const DEMO_CATALOG = [
  { internal_id: 'MON-24FHD', name: 'Monitor 24" FHD', unit: 'əd', buy_price: 280, firm: 'IMZA' },
  { internal_id: 'MSE-WL01', name: 'Mouse simsiz', unit: 'əd', buy_price: 18, firm: 'PREMIER' },
  { internal_id: 'KBD-MB02', name: 'Klaviatura mexaniki', unit: 'əd', buy_price: 45, firm: 'IMZA' },
  { internal_id: 'NB-TP14', name: 'Noutbuk 14" (ofis)', unit: 'əd', buy_price: 1100, firm: 'IMZA' },
  { internal_id: 'CBL-HDMI2', name: 'HDMI kabel 2m', unit: 'əd', buy_price: 6, firm: 'PREMIER' },
];

const fresh = process.argv.includes('--fresh');
if (fresh) {
  // --fresh is only meaningful with a file DB; :memory: is always fresh.
  __resetDb();
}

const db = procDb();
for (const s of SEEDS) {
  const existing = db.prepare('SELECT id FROM users WHERE login = ?').get(s.login);
  if (existing) {
    // No passwords: tap-to-enter. Placeholder hash kept for the NOT NULL column.
    db.prepare('UPDATE users SET full_name = ?, password_hash = ?, proc_role = ?, proc_access = 1, must_rotate = 0 WHERE id = ?')
      .run(s.full_name, 'nopw', s.proc_role, existing.id);
  } else {
    db.prepare('INSERT INTO users (full_name, login, password_hash, proc_role, must_rotate) VALUES (?, ?, ?, ?, 0)')
      .run(s.full_name, s.login, 'nopw', s.proc_role);
  }
}

for (const c of DEMO_CATALOG) {
  db.prepare(`INSERT OR IGNORE INTO price_catalog (internal_id, name, unit, buy_price, firm, sell_price)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(c.internal_id, c.name, c.unit, c.buy_price, c.firm, c.buy_price);
}

console.log('\nSeed users (tap-to-enter — no passwords, just pick a profile):\n');
for (const u of SEEDS) console.log(`  ${u.full_name} [${u.proc_role}]  login=${u.login}`);
console.log('\nDemo catalog: 5 items seeded (INSERT OR IGNORE).\n');
