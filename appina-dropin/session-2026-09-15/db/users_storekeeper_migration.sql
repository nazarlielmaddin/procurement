-- ═══════════════════════════════════════════════════════════════════
-- Sessiya 2026-09-15 — Anbardar rolu: mövcud `users` cədvəlinin miqrasiyası
-- BİR DƏFƏ işlədilir (transaction içindədir — yarımçıq qalmır).
-- Nə edir:
--   1) proc_role CHECK-ini genişləndirir ('storekeeper' əlavə olunur).
--      SQLite CHECK-i ALTER ilə dəyişməyə qoymur — cədvəl məlumatla birlikdə
--      yenidən qurulur (bütün sətirlər id-ləri ilə köçürülür, FK-lar qorunur).
--   2) Köhnə silinmələrə status sütunu əlavə edir (hamısı 'pending' olur).
--   3) Bütün mövcud user-lərə Anbar+1C bölmələrini əlavə edir (var olan
--      bölmələrə toxunmur, təkrar işlədilə bilər).
-- Təzə (boş) DB-lərdə bunlara ehtiyac yoxdur — schema elə belə gəlir.
-- ═══════════════════════════════════════════════════════════════════

PRAGMA foreign_keys = OFF;
BEGIN;

CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  proc_role TEXT NOT NULL CHECK (proc_role IN ('procurement_specialist', 'boss', 'storekeeper')),
  proc_access INTEGER NOT NULL DEFAULT 1,
  sections_csv TEXT NOT NULL DEFAULT 'orders,catalog,dashboard,warehouse,1c',
  appina_user_id TEXT NULL UNIQUE,
  must_rotate INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO users_new (id, full_name, login, password_hash, proc_role, proc_access, sections_csv, appina_user_id, must_rotate, created_at)
  SELECT id, full_name, login, password_hash, proc_role, proc_access, sections_csv, appina_user_id, must_rotate, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

COMMIT;
PRAGMA foreign_keys = ON;

-- Köhnə silinmələr (status sütunu yoxdursa) — hər biri ayrıca yoxlanılır:
--   PRAGMA table_info(stock_removals); → 'status' yoxdursa, bunu işlət:
--   ALTER TABLE stock_removals ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- Bölmə backfill-i (istəyə bağlı təkrarlana bilər, mövcudu pozmur):
--   Hər user-in sections_csv-nə 'warehouse' və '1c' əlavə et (artıq varsa, atla).
--   Məntiq üçün bax: server/lib/proc_db.js → migrate() → "New sections" bloku.

-- Anbardar user-i yaratmaq (Appina öz user-ini bağlayırsa login-i uyğunlaşdır):
--   INSERT INTO users (full_name, login, password_hash, proc_role, sections_csv, must_rotate)
--   VALUES ('Anbardar', 'anbardar', 'nopw', 'storekeeper', 'warehouse,1c,orders', 0);
--   QEYD: sections_csv MÜTLƏQ 'warehouse,1c,orders' olmalıdır — geniş olarsa,
--   anbardar panel/kataloqa da çıxar (bax: README §4).
