# Sprint 8 — Suggested Implementations

**Sprint goal:** Ship the shopping list feature, close critical security gaps, and polish the app for a local capstone demo.

**Capacity assumption:** 2–3 weeks, 2–3 devs.

**Demo format:** Local — backend via `uvicorn` + frontend via `npm run dev`. No deployed-demo or recording polish in scope.

**Where completion is recorded:** [`SPRINT8_DOCUMENTATION.md`](./SPRINT8_DOCUMENTATION.md) is the running log of what merged for Sprint 8. The table below maps that log onto this backlog (last crosswalk: **2026-04-28**).

### Sprint 8 status at a glance

| Area | Status | Notes |
|------|--------|--------|
| **Tier 1.1 — Admin routes** (`DELETE`/`GET` `/api/admin/users…`) | Not started | Still no `Depends(get_user_id)` / `ADMIN_EMAILS` allow-list (see `api/src/main.py` admin block). |
| **Tier 1.1 — `/api/food/search` auth + rate limit** | Not started | Route remains unauthenticated. |
| **Tier 1.1 — Receipt `scan-result` ownership** | Not started | `scan_sessions` dict still unbounded; no caller vs stored `user_id` check on `GET /api/receipt/scan-result/{token}`. |
| **Tier 1.1 — Bounded in-memory caches** | Not started | |
| **Tier 1.1 — Remove debug output** | Partial | `lib/api.ts` and login page: redundant console noise reduced per sprint doc. **`api/src/main.py` signup path still uses many `print()` calls.** `app/scan-receipt/page.tsx` still has multiple `console.log` calls. |
| **Tier 1.1 — Input validation caps** | Partial | Shopping-list create/update use Pydantic length caps; **food search, recipes-by-ingredients, ZIP on price-compare, generic item/household name caps** (as originally listed) still backlog unless implemented elsewhere. |
| **Tier 1.1 — Waste-saved resilience** | Done | `GET /api/waste-saved` tolerates `deleted_items` failures; dashboard card degrades gracefully (`SPRINT8_DOCUMENTATION.md`). |
| **Tier 1.1 — UTC timestamps (Python 3.12+)** | Done | `datetime.now(timezone.utc)` in relevant paths; removes `utcnow` deprecation noise under pytest. |
| **Tier 1.2 — Shopping list Steps 1–5, 7** | Done | Migration `db/migrations/add_shopping_list.sql`, CRUD + `clear-checked`, `lib/api.ts`, `ShoppingPageContent.tsx`, pantry cart → list (name only), `Dashboard.tsx` copy. **Requires migration applied in Supabase.** |
| **Tier 1.2 — Step 6 price-compare UI** | Not started | `/api/price-compare` exists; not wired from the list. |
| **Pantry UX follow-ons** (not in original tier list) | Done | Full pantry modal, background expiration backfill on items missing dates (`SPRINT8_DOCUMENTATION.md`). |
| **Tier 2.1 — Receipt scan refactor** | Not started | |
| **Tier 2.2 — Notification-config UX** | Not started | |
| **Tier 2.3 — Accessibility pass** | Not started | |
| **Tier 2.4 — Stop swallowing errors** | Done | `RecipesPage.tsx` (household load), `ShoppingPageContent.tsx` (localStorage for visited stores). |
| **Tier 2.5 — Backend endpoint tests** | Partial | `api/tests/test_shopping_list_crud.py` added. **Still open:** admin auth, items CRUD roundtrip, household join, auth login happy/sad (per original §2.5 list). |
| **Tier 2.6 — Pin `requirements.txt`** | Not started | |
| **Tier 2.7–2.9 — `.env.example`, `DEMO.md`, README** | Not started | |
| **Tier 3** | Not started | All stretch items remain optional. |

**Critical path for a “safe demo”:** finish Tier 1.1 security items (admin, food search, receipt token, caches) before treating Sprint 8 as closed from a security perspective — the flagship shopping work does not replace those fixes.

---

## Executive Summary

Smart Pantry is in solid shape after Sprint 7: auth is hardened, core features work, and documentation is strong. A deep review surfaced three things Sprint 8 should address:

1. **Three unauthenticated endpoints** that any caller can hit — including a `DELETE /api/admin/users/{email}` that removes users with no auth. **As of the 2026-04-28 status crosswalk, these fixes are still outstanding** and remain the highest-risk gap.
2. **Shopping list** — the store locator already worked; the list itself was the gap. **Household-scoped shopping list CRUD, API client, Shopping UI, pantry “add to list,” and dashboard copy are now implemented** (see status table above). Price-compare wiring from the list (Step 6) is still optional backlog.
3. **Polish debt** — some silent catches and noisy client logging were addressed; **large remaining items include** signup `print()`s and scan-receipt `console.log`s, receipt-scan duplication, modal accessibility, pinned dependencies, and demo docs.

The rest of this document lays out the work in priority tiers. Tier 1 is non-negotiable; Tier 2 is the main sprint body; Tier 3 is stretch.

---

## Tier 1 — Must-Do

**Status:** Shopping list (§1.2) is largely implemented; **§1.1 security and most debug/logging cleanup are still open** — see the status table above and [`SPRINT8_DOCUMENTATION.md`](./SPRINT8_DOCUMENTATION.md).

### 1.1 Security & Correctness (~20% of sprint)

These are bugs, not features. Fix them first.

#### Fix unauthenticated admin endpoints
**Status:** Not started.
- **Files:** `api/src/main.py:3073` (`DELETE /api/admin/users/{user_email}`), `api/src/main.py:3151` (`GET /api/admin/users`)
- **Issue:** Neither endpoint uses `Depends(get_user_id)`. Any unauthenticated caller can list every user in the system or delete any user by email.
- **Fix:**
  1. Add `user_id: str = Depends(get_user_id)` to both routes.
  2. Introduce an `ADMIN_EMAILS` env var (comma-separated allow-list).
  3. Add a small `require_admin(user_id)` helper that looks up the caller's email from `profiles` and 403s if not in the allow-list.
  4. Document the env var in CLAUDE.md and `.env.example`.

#### Auth on `/api/food/search`
**Status:** Not started.
- **File:** `api/src/main.py` (USDA search handler; search for `@app.get("/api/food/search")`)
- **Issue:** Endpoint is open to the internet. USDA API key is burned on every call.
- **Fix:** Add `Depends(get_user_id)` and a SlowAPI rate limit (e.g., `30/minute`).

#### Ownership check on receipt-scan results
**Status:** Not started.
- **File:** `api/src/main.py` (`GET /api/receipt/scan-result/{token}` and receipt session creation)
- **Issue:** Anyone who guesses or obtains a scan token can read the result. No user-id check.
- **Fix:** When `create-session` is called (`main.py:2651`), store `{token: {user_id, created_at, result}}`. On `scan-result`, require auth and verify the stored `user_id` matches the caller.

#### Bound unbounded in-memory caches
**Status:** Not started.
- **Files:** `api/src/main.py` (`scan_sessions` and any token cache dicts near module top)
- **Issue:** Neither dict ever evicts. Long-running servers leak memory; scan tokens never expire.
- **Fix:** Add TTL (e.g., 10 min for scan sessions, 5 min for token cache) and a simple sweep on write, or swap in `cachetools.TTLCache`.

#### Remove production debug output
**Status:** Partial — frontend/login/api client noise reduced per sprint doc; **backend signup `print()` and scan-receipt `console.log` cleanup still TODO.**
- `api/src/main.py` signup flow: many `print()` statements remain. Replace with `logger.debug(...)` or delete.
- `app/scan-receipt/page.tsx`: 13 `console.log` calls (lines ~13, 19, 23, 51–53, 59, 181–194, 228).
- `app/(routes)/login/page.tsx:81`: stray `console.log`.
- `lib/api.ts`: 3 `console.log`/`console.warn` calls (lines ~183, 196–197).

#### Input validation hardening
**Status:** Partial — shopping-list Pydantic models enforce name/quantity caps; **other handlers as listed below may still need guards.**
- Cap `query` length on `/api/food/search` and `/api/recipes/by-ingredients` (e.g., 200 chars).
- Validate 5-digit ZIP format on `/api/price-compare`.
- Cap item name and household name length (200 chars) on create/update.
- These are all cheap `HTTPException(400)` guards at the top of the handlers.

**Verification:**
```bash
# Admin routes should 401 unauthenticated, 403 for non-admin, 200 for admin:
curl http://localhost:8000/api/admin/users
curl -H "Authorization: Bearer $NON_ADMIN_JWT" http://localhost:8000/api/admin/users
# Food search should 401 unauthenticated:
curl http://localhost:8000/api/food/search?query=milk
# Receipt result should 403 for wrong user:
curl -H "Authorization: Bearer $OTHER_USER_JWT" http://localhost:8000/api/receipt/scan-result/$TOKEN
```

---

### 1.2 Flagship Feature — Shopping List CRUD (~45% of sprint)

**Status:** **Steps 1–5 and 7 are done** (see `SPRINT8_DOCUMENTATION.md`). **Step 6 (price-compare from the list) is not done.** Apply `db/migrations/add_shopping_list.sql` in Supabase before testing RLS and multi-user behavior.

This is the biggest single item in the sprint. Build it end-to-end per `SHOPPING_ROADMAP.md`.

#### Step 1 — Database (`db/migrations/add_shopping_list.sql`)
**Status:** Done (migration + `db/init.sql` pointer per sprint doc).
```sql
CREATE TABLE shopping_list_items (
  id           SERIAL PRIMARY KEY,
  user_id      UUID NOT NULL,
  household_id INT REFERENCES household(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  quantity     TEXT,
  checked      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shopping_list_household ON shopping_list_items(household_id);
CREATE INDEX idx_shopping_list_user ON shopping_list_items(user_id);

ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;
-- RLS: a user sees rows whose household_id is in their household memberships
```
Also append these columns to `db/init.sql` so fresh installs work.

#### Step 2 — Backend endpoints (`api/src/main.py`)
**Status:** Done — routes exist with auth, household scoping, SlowAPI limits, and Pydantic validation.

Add to the existing single-file backend:
- `GET    /api/shopping-list` — list items for the caller's household (follow the same `relation_househould` pattern already used by `GET /api/items`).
- `POST   /api/shopping-list` — create `{name, quantity?}`.
- `PUT    /api/shopping-list/{item_id}` — toggle `checked` or rename.
- `DELETE /api/shopping-list/{item_id}` — delete a single item.
- `POST   /api/shopping-list/clear-checked` — bulk delete all checked items for the household.

All routes use `Depends(get_user_id)` and enforce household scope. Rate limit with SlowAPI (e.g., `100/minute`).

#### Step 3 — Frontend API layer (`lib/api.ts`)
**Status:** Done.

Add wrappers mirroring the existing item CRUD:
```ts
getShoppingList()
createShoppingListItem({ name, quantity? })
updateShoppingListItem(id, patch)
deleteShoppingListItem(id)
clearCheckedShoppingListItems()
```

#### Step 4 — UI (`components/ShoppingPageContent.tsx`)
**Status:** Done — list section above store locator, optimistic check/uncheck, clear checked, states, optional quantity line.

Restructure into two sections (implemented):
- **Top:** shopping list (new) — add input row, checkable rows, delete button, "Clear checked" action, empty state, loading/error states.
- **Bottom:** existing store locator (untouched).

Optimistic updates on check/uncheck (the repo already documents optimistic patterns — see `OPTIMISTIC_UPDATES_GUIDE.md`).

#### Step 5 — Pantry integration
**Status:** Done — cart action posts **name only** (`quantity: null`) with duplicate-click guard and toasts.

In `DashboardHome.tsx` / item row, add an "Add to shopping list" action. Posts to `/api/shopping-list` with the item name. Toast on success.

#### Step 6 — Price comparison wiring (descope target if time-tight)
**Status:** Not started.

Existing `/api/price-compare` (Apify Instacart scraper; search in `api/src/main.py`) is unwired. From the shopping list, add a small "Compare prices" button per item that calls `/api/price-compare?query={name}&zip={userZip}` and shows results in a modal or inline row.

#### Step 7 — Dashboard card
**Status:** Done.

Update the shopping tile copy in `components/Dashboard.tsx` to reflect that the list exists now (not just the map).

**Verification:**
- Full CRUD loop in browser: add, check, uncheck, delete, clear-checked.
- RLS check: log in as two users in different households, confirm neither sees the other's list.
- Two users in the *same* household should see the same list.

---

## Tier 2 — Should-Do (Quality & Polish)

**Status:** **§2.4 complete.** **§2.5 partial** (shopping-list tests only). **§2.1–2.3, 2.6–2.9 not started** unless noted in `SPRINT8_DOCUMENTATION.md`.

### 2.1 Refactor duplicated receipt-scan logic (~5%)
**Status:** Not started.
- **Files:** `api/src/main.py:2418` (`scan_receipt`), `api/src/main.py:2676` (`scan_receipt_mobile`)
- **Issue:** Two ~170-line near-identical functions. Any bug fix has to be made twice.
- **Fix:** Extract a private helper `_process_receipt_image(contents, user_id) -> list[ItemCreate]` that handles OpenAI Vision call, USDA enrichment, and expiration suggestion. Both routes become ~20-line wrappers. Also cache USDA lookups inside the helper — currently each receipt item triggers 2 USDA calls (`main.py:2547`, `main.py:2562`), which is ~20 API calls per scan.

### 2.2 Notification-config UX (~2%)
**Status:** Not started.
- **Files:** `api/src/main.py` (SMTP / Twilio reminder paths; search for notification/reminder handlers)
- **Issue:** When email/SMS creds aren't configured, the code silently logs instead of sending. User sees "reminder sent" with nothing actually sent.
- **Fix:** Return a structured response like `{sent: false, reason: "smtp_not_configured"}` from the reminder endpoint. In `AccountSettings.tsx`, surface a warning banner when the user enables notifications but the backend reports the channel unconfigured.

### 2.3 Accessibility pass (~6%)
**Status:** Not started.
- **Files:** `components/AddItemModal.tsx`, `components/EditItemModal.tsx`, `components/ReceiptScannerModal.tsx`
- **Fixes:**
  - Focus trap inside the modal (trap Tab, restore focus on close).
  - Escape key closes the modal.
  - `aria-modal="true"` and `role="dialog"` on the root.
  - Audit form inputs for matching `<label htmlFor>` pairs.
  - Use `role="status"` / `aria-live="polite"` for success toasts in `AccountSettings.tsx` (partially done; audit the rest).

### 2.4 Stop swallowing errors (~2%)
**Status:** Done — household load errors surfaced on Recipes; visited-store persistence failures surfaced on Shopping (`SPRINT8_DOCUMENTATION.md`).

- `components/RecipesPage.tsx:46` — replace `catch { // ignore }` with a user-visible toast or inline error.
- `components/ShoppingPageContent.tsx:29` — same.

### 2.5 Backend endpoint tests (~5%)
**Status:** Partial — `api/tests/test_shopping_list_crud.py` covers shopping-list CRUD + unauthenticated `GET` → 401. **Items 1–3 and 5 in the list below are still to add.**

Add ~5 pytest tests to `api/tests/` (current coverage is helpers-only). Mock Supabase per existing `conftest.py` pattern:
1. `test_admin_requires_auth` — confirms `/api/admin/users` returns 401 unauthenticated and 403 for a non-admin JWT. **This test guards the Tier 1 fix against regression.**
2. `test_items_crud_roundtrip` — create → get → update → delete a pantry item as an authenticated user.
3. `test_household_join` — join by ID, verify membership row.
4. `test_shopping_list_crud` — the new flagship endpoints, full loop. **Implemented:** `api/tests/test_shopping_list_crud.py`.
5. `test_auth_login_happy_and_sad` — valid creds return token; invalid creds return 401.

### 2.6 Pin dependencies (~1%)
**Status:** Not started.
`api/requirements.txt` currently has unpinned packages. Run `pip freeze > requirements.txt` in a clean venv and commit. Protects the final weeks from a surprise breaking release.

---

## Tier 2 — Demo Readiness (~10%)

**Status:** Not started (no `.env.example` / `DEMO.md` / README sprint pass recorded in `SPRINT8_DOCUMENTATION.md`).

Local-first, because the demo is `uvicorn` + `npm run dev`.

### 2.7 `.env.example` files
**Status:** Not started.
Create two:
- `/.env.example` (frontend) — all `NEXT_PUBLIC_*` keys + `SUPABASE_*` server-side keys with placeholder values.
- `/api/.env.example` — all backend keys: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `OPENAI_API_KEY`, `USDA_API_KEY`, `SPOONACULAR_API_KEY`, `APIFY_API_TOKEN`, `ADMIN_EMAILS`, `FRONTEND_URL`, `ALLOWED_ORIGINS`.

Match the list in `CLAUDE.md` so they don't drift.

### 2.8 `DEMO.md` — scripted local walkthrough
**Status:** Not started.

A step-by-step doc for the demo presenter and graders:
1. **Prereqs** — Node 20, Python 3.12, a Supabase project with schema loaded.
2. **Setup** — clone, copy `.env.example` → `.env`, `pip install -r api/requirements.txt`, `npm install`.
3. **Seed data** — `psql "$SUPABASE_URL" -f db/seed.sql` (confirm this still matches the current schema first — recent migrations may have drifted).
4. **Run** — `uvicorn src.main:app --reload` in `api/`, `npm run dev` at the root.
5. **Walkthrough script** — the exact click-by-click path: signup → add pantry item → scan a provided sample receipt → get a recipe → add an item to the shopping list → check it off.
6. **Swagger** — note that API docs are at `http://localhost:8000/docs` (FastAPI default; confirm it's still on).

### 2.9 README polish
**Status:** Not started (optional README feature-list pass called out as still open in sprint doc).

Update feature list in `README.md` to reflect Sprint 8 reality (shopping list works, etc.). Remove any stale bullets.

---

## Tier 3 — Nice-to-Have (Stretch, ~15%)

**Status:** Not started.

Do these if Tier 1+2 finish with time to spare. Each is independent.

- **Consolidate AddItemModal + EditItemModal** — both are ~80+ lines of the same shape. One parameterized component with a `mode: "add" | "edit"` prop.
- **Delete `components/UnderConstruction.tsx`** — dead code, unreferenced.
- **Replace inline `style={...}`** — 5 occurrences in `app/page.tsx`, login/signup pages, and `DashboardHome.tsx:20`. Swap to Tailwind utilities.
- **Rename schema typo `relation_househould` → `relation_household`** — touches 7+ call sites across `main.py` (lines 470, 514, 658, 664, 671, 2388, 2395). Do it as a single atomic change with a migration that renames the table. Skip if the schedule is tight — it's ugly but working.
- **Prune stale git branches** — Sprint 2–5 leftover branches can go once their work is confirmed merged.
- **Household invite codes** — today users join by raw household ID. A short-lived, human-typable invite code is a nicer UX and a small backend change.

---

## Explicitly Out of Scope (for Sprint 8)

These came up during analysis but are being deferred on purpose:

- GitHub Actions / CI pipeline — team opted for manual QA this sprint.
- Frontend test suite (Vitest/Jest) — team opted for minimal testing.
- Vercel/production deploy polish — demo is local.
- Sentry or other error tracking.
- Real-time household sync (WebSockets or Supabase Realtime).
- 2FA, profile pictures, i18n, mobile native app.
- Splitting `api/src/main.py` into modules — satisfying but risky this late.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Shopping list scope creep (esp. price-compare) | High | Slips Tier 2 polish | Build Steps 1–5 first; Step 6 (price compare) is the descope target. |
| Admin allow-list spec debate stalls Tier 1.1 | Medium | Blocks security fix | Decide on `ADMIN_EMAILS` env var up front in a 15-min team call. No role table. |
| `relation_househould` rename breaks something subtle | Medium | Production bug | Keep it in Tier 3. Only attempt if test 2.5.1/2.5.2 pass. |
| USDA cache refactor hits an unexpected edge case | Low | Receipt scan flakiness | Gate behind a feature flag env var during refactor; fall through to current behavior. |
| Supabase RLS for shopping list is misconfigured | Medium | Cross-user data leak | Write the two-user RLS verification test (see 1.2 verification) before merging. |

---

## Verification Checklist

Before calling Sprint 8 done, all of these should pass. **Legend:** `[x]` verified as part of completed work (per `SPRINT8_DOCUMENTATION.md` / spot-check), `[~]` partial, `[ ]` still open.

**Security:**
- [ ] `curl http://localhost:8000/api/admin/users` → 401
- [ ] Same endpoint with non-admin JWT → 403
- [ ] `curl http://localhost:8000/api/food/search?query=milk` → 401
- [ ] `/api/receipt/scan-result/{token}` with wrong user's JWT → 403
- [ ] No `print(` statements remaining in `api/src/main.py` signup flow
- [~] No `console.log(` in `app/scan-receipt/page.tsx`, `lib/api.ts`, or login page — **scan-receipt still logs; login + pantry fetch path addressed**

**Shopping list:**
- [x] Full CRUD loop works in browser (after migration applied)
- [x] "Add to shopping list" from pantry item works (name-only line)
- [x] "Clear checked" removes only checked items
- [ ] Two users in different households cannot see each other's items (RLS) — **verify manually after migration**
- [ ] Two users in the same household share a list — **verify manually after migration**

**Quality:**
- [~] `pytest api/tests/` green — **shopping-list test file passes; full suite + four additional endpoint tests not yet in backlog completion**
- [~] `npm run dev` loads with no console errors on any page — **reduced on touched paths; scan-receipt still noisy**
- [ ] Tab-through each modal — focus stays trapped, Escape closes
- [ ] Receipt scan works end-to-end on both desktop and mobile paths
- [ ] `api/requirements.txt` has pinned versions

**Demo:**
- [ ] Fresh clone → follow `DEMO.md` → app running in under 10 minutes
- [ ] Swagger UI reachable at `http://localhost:8000/docs`
- [ ] `.env.example` files present at root and `api/`
- [ ] Seed data loads cleanly into a fresh Supabase project

---

## Suggested Sequencing (2.5-week sprint, 2–3 devs)

**Week 1:**
- Dev A: Tier 1.1 (all security fixes) + Tier 2.6 (pin deps)
- Dev B: Tier 1.2 Steps 1–3 (shopping list DB + backend + `lib/api.ts`)
- Dev C (if 3rd): Tier 2.1 (receipt refactor) + Tier 2.4 (error-swallowing cleanup)

**Week 2:**
- Dev A: Tier 2.5 (endpoint tests) + Tier 2.2 (notification UX) + start Tier 2.7/2.8 (demo docs)
- Dev B: Tier 1.2 Steps 4–6 (shopping list UI + pantry integration + price compare)
- Dev C: Tier 2.3 (accessibility pass)

**Week 3 (or last few days):**
- Everyone: Tier 1.2 Step 7 (dashboard copy), finish `DEMO.md`, walk through the verification checklist, cherry-pick Tier 3 items if time allows.

---

*Generated from a deep review of the codebase on 2026-04-15. **Status crosswalk added 2026-04-28** against [`SPRINT8_DOCUMENTATION.md`](./SPRINT8_DOCUMENTATION.md). Line-number citations in older bullets may drift; use symbol search in `api/src/main.py` and the files named in each section.*
