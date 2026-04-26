# Sprint 8 — Completion Documentation

## Overview

Sprint 8 was scoped in `suggested_sprint8_implementations.md`: shopping list feature, critical security fixes, and demo polish. This document records **what has been completed to date** for Sprint 8. Items not listed here are still open against that plan.

## Completed work

### Tier 2.4 — Stop swallowing errors (quality)

**Goal:** Surface failures instead of empty `catch` blocks so users know when something went wrong.

| Area | File | Change |
|------|------|--------|
| Recipes — households | `components/RecipesPage.tsx` | Loading `/api/households` now sets `householdError` on network failure, non-OK responses (with a specific message for 401), and shows an amber banner under the page intro. |
| Shopping — visited stores | `components/ShoppingPageContent.tsx` | `saveCheckedStoreIds` returns `boolean`. If `localStorage.setItem` fails (quota, private browsing, etc.), an inline warning appears under **Stores in your area**; successful saves clear the message. |

### Tier 1.1 — Production debug output (partial)

**Goal:** Reduce noisy or redundant logging in production-facing frontend code.

| File | Change |
|------|--------|
| `lib/api.ts` | Removed `console.warn` / `console.error` in the pantry items fetch path. Invalid or legacy responses still throw `Error` with the same messages; behavior is unchanged aside from console noise. |
| `app/(routes)/login/page.tsx` | Removed redundant `console.error` before `setErr`; login errors remain user-visible in the form. |

### Tier 1.1 — Waste saved endpoint resilience (reliability)

**Goal:** Dashboard should not break or spam dev errors when `deleted_items` is missing, mis-migrated, or the query fails.

| File | Change |
|------|--------|
| `api/src/main.py` | `GET /api/waste-saved` wraps the `deleted_items` Supabase query in a nested try/except; on failure it logs a warning and returns zeroed stats instead of HTTP 500. |
| `components/DashboardHome.tsx` | If `getWasteSaved()` fails, the Waste Saved card shows zeros instead of relying on `console.error` (reduces Next.js dev overlay noise). |

### Tier 1.1 — Timestamps (Python 3.12+ compatibility)

**Goal:** Avoid deprecated naive `datetime.utcnow()` in favor of timezone-aware UTC.

| File | Change |
|------|--------|
| `api/src/main.py` | Replaced `datetime.utcnow().isoformat()` (and similar) with `datetime.now(timezone.utc).isoformat()` for pantry updates, shopping-list updates, profile updates, and related paths. Removes `DeprecationWarning` under pytest / modern Python. |

### Tier 1.2 — Shopping list (flagship feature)

**Goal:** Household-scoped shopping list CRUD, wired from pantry to the Shopping page, with the existing store locator kept below the list.

| Area | File(s) | Change |
|------|---------|--------|
| Database | `db/migrations/add_shopping_list.sql` | New `shopping_list_items` table (`user_id`, `household_id`, `name`, `quantity`, `checked`, timestamps), indexes, and RLS policies aligned with `relation_househould` membership. **Apply this migration in Supabase** before using the feature. If `household.id` is not an integer type in your project, adjust the `household_id` column type and FK to match. |
| Schema note | `db/init.sql` | Comment pointing Supabase setups to the migrations folder (including shopping list). |
| Backend | `api/src/main.py` | `GET/POST /api/shopping-list`, `POST /api/shopping-list/clear-checked`, `PUT/DELETE /api/shopping-list/{item_id}` with `Depends(get_user_id)`, same household resolution pattern as `GET /api/items`, SlowAPI limits, and name/quantity length caps via Pydantic. |
| API client | `lib/api.ts` | `getShoppingList`, `createShoppingListItem`, `updateShoppingListItem`, `deleteShoppingListItem`, `clearCheckedShoppingListItems` with optional `household_id` query. |
| Data model | `data/pantry-items.ts`, `lib/api.ts` (`backendItemToFrontend`) | Optional `quantity` on `PantryItem` / mapped from backend for pantry display logic (not copied to shopping list from the cart — see below). |
| Shopping UI | `components/ShoppingPageContent.tsx` | List section above **Find Nearby Stores**: household selector, add row, check/uncheck (optimistic), remove, clear checked, loading/error/empty states; optional quantity line labeled **Qty:**; add form ignores duplicate submit while a request is in flight. |
| Pantry UI | `components/DashboardHome.tsx` | Cart action adds **name only** (`quantity: null` on the API) so pantry inventory count is not confused with “amount to buy”; `addingToShoppingList` guard reduces duplicate rows from double-clicks; toast on success or error. |
| Dashboard copy | `components/Dashboard.tsx` | Shopping tile describes shared list + map. |

**Follow-on UX (same sprint thread, not in original tier list):**

| Area | File(s) | Change |
|------|---------|--------|
| Full pantry modal | `components/DashboardHome.tsx` | **View full pantry →** opens a modal (`PantryListPanel` shared with the dashboard card) with taller scroll, Escape/backdrop close, footer actions for Scan/Add, delete confirm `z-index` above the modal, and closing the modal when opening Edit. |
| Auto expiration backfill | `components/DashboardHome.tsx` | After `getItems`, any item **without** `expiration_date` is updated in the background via `suggest-expiration` + `updateItem` (rate-limited delays; optional second suggest when recommended storage differs), matching the spirit of Add/Edit modal suggestions. |

### Tier 2.5 — Backend endpoint tests (partial)

**Goal:** Regression tests for critical API behavior with Supabase mocked (per `api/tests/conftest.py`).

| File | Change |
|------|--------|
| `api/tests/test_shopping_list_crud.py` | `GET/POST/PUT/DELETE` shopping-list routes plus `GET` **401** without `Authorization`; uses `TestClient`, `dependency_overrides` for `get_user_id`, and ordered `supabase.table` mocks. |

**Still open vs `suggested_sprint8_implementations.md` §2.5:** `test_admin_requires_auth`, `test_items_crud_roundtrip`, `test_household_join`, `test_auth_login_happy_and_sad` (not yet added).

**Not done in this slice (still optional per original sprint doc):** Step 6 “Compare prices” wiring to `/api/price-compare`, and any extra README feature-list edits beyond the dashboard tile.

## Not completed (still on the Sprint 8 plan)

The following major themes from `suggested_sprint8_implementations.md` were **not** implemented in the same pass as the items above. Use that file as the source of truth for backlog:

- **Tier 1.1 (remainder):** Admin route protection (`ADMIN_EMAILS`, `require_admin`), auth on `/api/food/search`, receipt scan-result ownership, bounded in-memory caches, signup `print()` cleanup in `api/src/main.py`, broader input validation caps on other endpoints, etc.
- **Tier 2:** Receipt-scan refactor, notification-config UX, accessibility pass, additional backend endpoint tests (admin, pantry items CRUD, household join, auth — see §2.5 above), pinned `requirements.txt`, `.env.example`, `DEMO.md`, README updates, price-compare UI, and other polish items.

## Verification (completed items)

- **Recipes:** With the backend down or an invalid session, the Recipes page should show the household banner instead of failing silently when households cannot be loaded.
- **Shopping (stores):** With storage blocked, toggling “visited” on a store should show the persistence warning; with normal storage, toggles behave as before and no warning appears.
- **Shopping (list):** After applying the shopping-list migration, users with a household can use `/shopping` for full CRUD; pantry **cart** adds **one line per click** with **no auto-filled quantity** from pantry stock.
- **Waste saved:** If `deleted_items` cannot be read, the API still returns zeros and the dashboard card stays usable without a 500-driven dev overlay from this path.
- **Pantry:** Items missing expiration dates should eventually get suggested dates (background backfill); **View full pantry** opens a modal instead of relying on navigation for that action.
- **Console:** Pantry list fetch and successful login error paths should not emit the removed `console.*` calls from the changed code paths.
- **Tests:** From `api/`, `python -m pytest tests/test_shopping_list_crud.py -v` should pass with no `utcnow` deprecation warnings.

## Related documents

- `suggested_sprint8_implementations.md` — Full Sprint 8 backlog, tiers, and verification checklist.
- `SHOPPING_ROADMAP.md` — Original design reference; implementation follows the same shape (household-scoped list + store section).

---

*Last updated: 2026-04-28 — Added `test_shopping_list_crud.py`, timezone-aware UTC timestamps in `main.py`, and clarified remaining §2.5 tests.*
