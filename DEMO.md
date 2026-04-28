# Smart Pantry Demo Guide (Local)

This guide is for graders/presenters running the Sprint 8 demo locally.

## 1) Prerequisites

- Node.js 20+ (18+ minimum)
- Python 3.12+ (3.11+ minimum)
- A Supabase project with required tables/migrations applied
- Git

## 2) Clone and install

```bash
git clone https://github.com/Cmcfall04/CSC-401-senior-capstone-project.git
cd CSC-401-senior-capstone-project
npm install
```

Install backend dependencies:

```bash
cd api
pip install -r requirements.txt
cd ..
```

## 3) Configure environment variables

Create local env files from examples:

- Root: copy `.env.example` -> `.env`
- API: copy `api/.env.example` -> `api/.env` (optional if your backend reads root `.env`, but recommended)

Fill required values:

- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- Frontend public keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- APIs: `USDA_API_KEY`, `SPOONACULAR_API_KEY`, `OPENAI_API_KEY`
- Admin routes: `ADMIN_EMAILS` (comma-separated emails from `profiles.email`)

Optional:

- Apify price compare (`APIFY_TOKEN`, etc.)
- SMTP/Twilio reminder channels

## 4) Database setup

Apply schema/migrations in Supabase, including shopping list migration:

- `db/init.sql`
- `db/migrations/add_shopping_list.sql`

If using seed data, run:

```bash
psql "$SUPABASE_URL" -f db/seed.sql
```

## 5) Run the app

Backend (terminal 1):

```bash
cd api
python -m uvicorn src.main:app --reload
```

Frontend (terminal 2):

```bash
npm run dev
```

## 6) Quick verification

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend health: [http://localhost:8000/health](http://localhost:8000/health)
- Swagger docs: [http://localhost:8000/docs](http://localhost:8000/docs)

## 7) Demo script (suggested)

1. Sign up (or log in) with a household account.
2. Add a pantry item manually.
3. Scan/upload a sample receipt.
4. Open Recipes and fetch recommendations.
5. Add an item to Shopping List and mark it checked.
6. Show Shopping page with list + store section.
7. Show dashboard cards (including updated shopping card text).

## 8) Troubleshooting

- **401 on admin endpoints:** set `ADMIN_EMAILS` to valid `profiles.email` values and restart backend.
- **Backend unreachable from frontend:** verify `NEXT_PUBLIC_API_BASE_URL`/host and `ALLOWED_ORIGINS`.
- **Receipt scan fails:** verify `OPENAI_API_KEY` and file format/size limits.
- **Recipe search empty or errors:** verify `SPOONACULAR_API_KEY`.
- **Price compare disabled/empty:** check `APIFY_TOKEN` and usage limits.
