# Appina Procurement

Təchizat sifarişləri: specialist yaradır, boss təsdiq / qismən / rədd edir.
Appina Finance keyfiyyət etalonu ilə — eyni stack, eyni üslub.

**Stack:** React 18 + Vite + react-query + recharts + lucide · Express 4 ESM +
node:sqlite · cookie session · scrypt (stdlib, bcrypt yoxdur) · ISO-8601 UTC.

## Lokal işə salma (test üçün)

```bash
cd server && npm install && npm run seed -- --fresh   # 4 user + 5 demo məhsul
node index.js                                          # :4173 (API + built client)
cd ../client && npm install && npm run build           # dist/ → server avtomatik serve edir
```

Brauzer: **http://127.0.0.1:4173** — login, ilk girişdə şifrə rotasiyası məcburidir.
Seed bir-dəfəlik şifrələri terminala çap edir (təhlükəsiz kanalla paylaş).

Testlər: `npm --prefix server test` → 12/12 (auth, kataloq RBAC, sifariş+qərarlar,
kilid, dashboard riyaziyyatı — `:memory:` DB ilə).

## Rollar

- **Specialist** (Elməddin Nəzərli, Nəcəf Əsgərov): sifariş yaratmaq (məhsul, vahid,
  qiymət, səbəb, sifariş edən əməkdaşın adı), ID ilə kataloqdan əlavə, yalnız
  ÖZ sifarişlərini görmək, pending-i redaktə, boss commentlərini + miqdar
  dəyişikliklərini görmək. Qərarlaşmışı redaktə edə bilməz (409).
- **Boss** (Fərəc Fərəci, Fuad Amirov): HAMISINI görmək, tam / qismən (miqdar
  kəsir) / rədd + comment, kataloq read+write.
- Hər kəs dashboard-u görür.

## Statuslar

`pending` (ilkin) → `approved` (olduğu kimi) · `partially_approved` (tələb vs təsdiq
yan-yana, məs. 3 monitor → 2) · `rejected` (tam). Qərar tək-yazıçılıdır
(`logDecision`), təkrar → 409 `ORDER_LOCKED`.

## Tablar

1. **Sifarişlər** — cədvəl + status filtri + kliklə detal (məhsullar, boss qərar
   paneli, commentlər, tarixçə).
2. **Qiymət kataloqu** — ad, vahid, alış, firma, daxili ID (hər firma daxilində
   UNIQUE, case-insensitive; boş firma → `UMUMI`). Satış sütunu dondurulub —
   alışa bərabər saxlanır, qiymətləmədə iştirak etmir. Excel-ə çıxar
   (ID | Ad | Vahid | Alis | Firma) ↔ Excel ilə yenilə: firma dropdown-u seçilibsə
   yalnız HƏMİN firma əvəz olunur, seçilməyibsə bütün kataloq — eyni format,
   round-trip dəstəklənir.
3. **Panel** — (a) aylıq təsdiq həcmi (wavy area), (b) rədd payı + manatla qənaət.

## API (hamısı `/api/procurement` altında, cookie/Bearer auth)

- `GET /access` — rol + bölmələr
- Kataloq: `GET /catalog?q=` · `POST /catalog` Ⓑ · `PUT /catalog/:id` Ⓑ ·
  `DELETE /catalog/:id` Ⓑ (tarixçə SET NULL ilə sağ qalır)
- Sifariş: `POST /orders` · `GET /orders?status=` · `GET /orders/:id` (items +
  comments + history) · `PUT /orders/:id` (yalnız sahibi, yalnız pending) ·
  `POST /orders/:id/decision {decision, items?, comment?}` Ⓑ ·
  `POST /orders/:id/comments`
- `GET /dashboard` — `volume_trend[]`, `cancelled{share, saved_amount}`,
  `counts{}` (Ⓑ = boss-only)

## Appina-ya qoşulma

`appina-dropin/` — hazır paket: `client/Procurement.jsx`, `server/procurement.js` +
`proc_*.js`, `db/procurement.schema.sql` + **`MOUNT.md`** (DB → server → client,
5 addımda). Standalone auth (`/api/auth/*`) drop-ində yoxdur — Appina öz
session-ını işlədir, `requireBoss`/visibility gate-ləri olduğu kimi qalır.

## Təhlükəsizlik qeydləri

- Bütün SQL parametrizasiya olunub (heç bir string-interpolation yoxdur);
  istifadəçi daxiletmələri `str()`/`num()` ilə sanitizasiya olunur.
- Şifrələr scrypt-hash ilə saxlanır, `must_rotate=1` ilk girişdə dəyişməyə məcbur edir.
- Cookie `httpOnly` + `SameSite=lax`; Bearer fallback testlər üçündür.
- CVE qeydi: `npm audit` client-də 0 zəiflik; serverdə yalnız `express` +
  `cookie-parser` (audit hesabatı `server/`-də yoxlanıla bilər).
