# Appina-ya drop-in qoşulma (Procurement)

Paket: `client/Procurement.jsx`, `server/procurement.js`, `server/proc_*.js`,
`db/procurement.schema.sql`. Standalone fayllar (`appina-procurement/server/app.js`,
`/auth/*`) drop-inə DAXİL DEYİL — Appina öz session/auth sistemini işlədir.

## 1. DB

`db/procurement.schema.sql`-u Appina DB-sinə execute et (ayrı fayl kimi də saxlaya
bilərsən — finance-dəki kimi 2 DB rejimi dəstəklənir). Təkcə `users` cədvəli fərqlidir:
əgər Appina-da artıq `users` varsa, procurement cədvəllərindən `users`-u YARATMA —
əvəzinə Appina `users`-una bu sütunları əlavə et:

```sql
ALTER TABLE users ADD COLUMN proc_role TEXT NOT NULL DEFAULT 'procurement_specialist'
  CHECK (proc_role IN ('procurement_specialist','boss'));
ALTER TABLE users ADD COLUMN proc_access INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN appina_user_id TEXT NULL UNIQUE; -- seam, gələcək sync üçün
```

`sessions` cədvəli standalone-a aiddir — Appina-da lazım deyil.

## 2. Server (Express ESM)

```js
import procurement from './procurement.js'; // bu paketdəki server/procurement.js
import { procDb } from './proc_db.js';      // DB yolu Appina-ya uyğunlaşdır

// Appina auth middleware-indən SONRA, api prefix altında:
app.use('/api/procurement', appinaAuth, procurement);
```

`proc_access.js`-dəki `authenticate` standalone üçündür — Appina-da onu öz
session middleware-inlə əvəz et, amma `requireBoss`, `ensureVisible`,
`ensureOwnerPending` AYNEN qalmalıdır (server-side RBAC — client gizlətməsi kifayət
deyil). `req.user` obyektində `id`, `proc_role`, `proc_access`, `full_name` olmalıdır.

## 3. Client (React + Vite + react-query + recharts + lucide-react)

```jsx
import Procurement from './Procurement.jsx';
// Appina router-ində:
<Route path="/procurement/*" element={<Procurement me={appinaUser} />} />
```

`me` obyekti: `{ id, full_name, proc_role: 'boss' | 'procurement_specialist' }` —
rol yalnız göstərmə üçündür, səlahiyyət serverdə yoxlanır. `AuthShell`/`Login`/`Rotate`
yalnız standalone üçündür — Appina-da istifadə etmə. `index.css`-dəki tokenlər
(`--bg/--surface/--line/--ink...`) finance tokenləri ilə eynidir — toqquşmur.

Son drop-in paketi yalnız `Procurement` komponentini mount edir; Login/AuthShell
istifadə olunmur. Appina autentifikasiyası və logout-u host tətbiq idarə edir.
Procurement daxilində yalnız iki rol müqaviləsi var: `boss` və
`procurement_specialist` (UI etiketi: `BOSS` və `SPECIALIST`). Standalone giriş
ekranı isə şəxslərin adlarını göstərmədən bu iki rol üzrə seçim təqdim edir.

## 4. RBAC matrisi (server tərəfindən məcburidir)

| Əməliyyat | Specialist | Boss |
|---|---|---|
| Sifariş yaratmaq (POST /orders) | ✅ | ✅ |
| Öz sifarişlərini görmək | ✅ (yalnız özününkü) | ✅ (hamısını) |
| Başqasının sifarişini görmək | ❌ 403 | ✅ |
| Pending sifarişi redaktə (PUT) | ✅ yalnız özününkü | ❌ 403 (boss qərar panelindən işləyir) |
| Qərar (approve/partial/reject) | ❌ 403 boss_only | ✅ |
| Kataloq oxumaq | ✅ | ✅ |
| Kataloq yazmaq (POST/PUT/DELETE) | ❌ 403 boss_only | ✅ (dup ID → 409) |
| Qərarlaşmış sifarişi redaktə | ❌ 409 ORDER_LOCKED | ❌ 409 ORDER_LOCKED |

Qərar tək-yazıçılıdır (`logDecision`): `approved` (miqdarlar olduğu kimi),
`partially_approved` (ən azı 1 kəsim + ən azı 1 saxlanılan sətir, `approved_qty ≤
requested_qty`), `rejected` (comment istəyə bağlı). Təkrar qərar → 409.

## 5. Gələcək (20 addım irəli)

- `orders.appina_user_id` / `users.appina_user_id` — Appina user-id mapi hazırdır.
- `orders.currency` (default AZN) — çoxvalyutalı görünüş tək `money()` helperindən keçir.
- `status_history.diff_json` — qismən qərarların audit izi JSON saxlanır.
- Dashboard qaydası: həcm = yalnız `approved|partially_approved` × `effectiveQty` ×
  snapshot qiymət, ay = `decided_at` (YYYY-MM); qənaət = tələb − təsdiq − pending.
