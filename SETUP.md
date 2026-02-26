# Smart Pantry - Setup Guide

This guide will help you get the Smart Pantry application up and running.

## 📋 Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** 20+ and npm (for frontend)
- **Python** 3.12+ and pip (for backend)
- **Docker** and **Docker Compose** (optional, for containerized setup)
- **Supabase Account** (free tier works fine)
  - Create an account at https://supabase.com
  - Create a new project
  - Get your project URL and service role key

## 🏗️ Architecture Overview

- **Frontend**: Next.js 15 with React 19, TypeScript, Tailwind CSS
- **Backend**: FastAPI (Python) with Supabase
- **Database**: Supabase (managed PostgreSQL)
- **Ports**: 
  - Frontend: `http://localhost:3000`
  - Backend API: `http://localhost:8000`
  - PostgreSQL (if using docker-compose): `localhost:5432`

---

## 🚀 Option 1: Running with Docker (Recommended)

### Step 1: Set Up Supabase Database

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create a new project (or use existing)
3. Go to **Settings** → **API**
4. Copy your:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **Service Role Key** (starts with `eyJ...` - **Keep this secret!**)

5. Go to **SQL Editor** and create the required tables. Run this SQL:

```sql
-- Create profiles table (for user profiles)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create items table (for pantry items)
CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    expiration_date DATE,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
CREATE INDEX IF NOT EXISTS idx_items_expiration_date ON items(expiration_date);

-- Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Create policies (users can only see their own data)
-- Note: Service role key bypasses RLS, but these policies are good for client-side access
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can view own items"
    ON items FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own items"
    ON items FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own items"
    ON items FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own items"
    ON items FOR DELETE
    USING (auth.uid() = user_id);

-- Create trigger to auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        NEW.email
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### Step 2: Create Environment Files

1. Create `api/.env` file in the `api` directory:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# CORS Origins (comma-separated)
ALLOWED_ORIGINS=http://localhost:3000
```

2. Create `.env.local` file in the project root (for Next.js):

```bash
# API Base URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000

### Step 4: Verify Everything is Running

1. Check backend health: http://localhost:8000/health
2. Check API docs: http://localhost:8000/docs
3. Open frontend: http://localhost:3000

---

## 🔧 Option 2: Running Locally (Without Docker)

### Step 1: Set Up Supabase Database

Follow the same Supabase setup steps from Option 1 (create tables and get credentials).

### Step 2: Backend Setup

1. Navigate to the API directory:
```bash
cd api
```

2. Create a virtual environment:
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Mac/Linux
python3 -m venv venv
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `api/.env` file:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
ALLOWED_ORIGINS=http://localhost:3000
```

5. Start the backend server:
```bash
uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at http://localhost:8000

### Step 3: Frontend Setup

1. In a new terminal, navigate to the project root:
```bash
cd ..
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local` file in the project root:
```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

4. Start the development server:
```bash
npm run dev
```

The frontend will be available at http://localhost:3000

---

## 🧪 Testing the Setup

### 1. Test Backend Health
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"ok": true, "database": "connected", "supabase": "ready"}
```

### 2. Test API Documentation
Visit http://localhost:8000/docs to see the interactive API documentation (Swagger UI).

### 3. Test User Registration
```bash
curl -X POST http://localhost:8000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

### 4. Test Login
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'
```

Save the `token` from the response for authenticated requests.

### 5. Test Creating an Item
```bash
curl -X POST http://localhost:8000/api/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "name": "Milk",
    "quantity": 2,
    "expiration_date": "2024-12-31"
  }'
```

### 6. Test Frontend
1. Open http://localhost:3000
2. Sign up for a new account
3. Navigate to the Pantry page
4. Try adding items to your pantry

---

## 🐛 Troubleshooting

### Backend Issues

**Error: "SUPABASE_URL environment variable is required"**
- Make sure `api/.env` exists and contains `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

**Error: "Database connection error"**
- Verify your Supabase credentials are correct
- Check that you've created the required tables in Supabase SQL Editor
- Make sure your Supabase project is active (not paused)

**CORS errors**
- Check that `ALLOWED_ORIGINS` in `api/.env` includes your frontend URL
- Default should be: `ALLOWED_ORIGINS=http://localhost:3000`

### Frontend Issues

**Error: "Failed to fetch items" or 401 Unauthorized**
- Make sure you're logged in
- Check that `NEXT_PUBLIC_API_BASE_URL` in `.env.local` points to `http://localhost:8000`
- Verify the backend is running

**Port 3000 already in use**
- Stop other applications using port 3000, or change the port:
  ```bash
  npm run dev -- -p 3001
  ```

### Docker Issues

**Port conflicts**
- If ports 3000, 8000, or 5432 are already in use, stop those services or modify `docker-compose.yml` to use different ports

**Build errors**
- Try rebuilding without cache:
  ```bash
  docker-compose build --no-cache
  docker-compose up
  ```

---

## 📝 Important Notes

1. **Supabase vs Local Database**: This project uses Supabase (managed PostgreSQL), not a local PostgreSQL database. The `db` service in `docker-compose.yml` may not be necessary if you're using Supabase exclusively.

2. **Environment Variables**: 
   - Never commit `.env` or `.env.local` files to git
   - These files should be in `.gitignore`

3. **Service Role Key**: The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security (RLS). Keep it secret and never expose it to the frontend.

4. **Development vs Production**: 
   - For production, use environment variables set in your hosting platform
   - Update `ALLOWED_ORIGINS` to include your production frontend URL

---

## 🚢 Next Steps

- Review the API documentation at http://localhost:8000/docs
- Check the project TODO list in `todo.md`
- Read the project documentation in `README.md` and `SPRINT2_DOCUMENTATION.md`

---

## 💡 Quick Start Checklist

- [ ] Install Node.js 20+, Python 3.12+, and Docker
- [ ] Create Supabase project and get credentials
- [ ] Run SQL schema setup in Supabase
- [ ] Create `api/.env` with Supabase credentials
- [ ] Create `.env.local` with API URL
- [ ] Run `docker-compose up --build` OR run backend/frontend separately
- [ ] Test backend at http://localhost:8000/health
- [ ] Test frontend at http://localhost:3000
- [ ] Sign up and create test items

---

**Need Help?** Check the troubleshooting section above or review the code comments in `api/src/main.py` for more details.

