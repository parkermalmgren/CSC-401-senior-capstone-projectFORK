# Smart Pantry: AI Food Waste Reducer

**Vercel Link:** https://smart-pantry-psi.vercel.app/

**CSC-401 Senior Capstone Project**  
**Team Name:** Pantry Guardians  
**Trello Board:** https://trello.com/b/jgs7YbLN/smartpantry-capstone-project

An AI-powered application designed to reduce household food waste by helping users track items, predict freshness, and discover recipes based on available ingredients.

---

## Table of Contents
- [Project Overview](#project-overview)  
- [Team Information](#team-information)  
- [Features](#features)  
- [Technology Stack](#technology-stack)  
- [Setup Instructions](#setup-instructions)  
- [Sprint Outline](#sprint-outline)  
- [Extra Work](#extra-work)  
- [Links](#links)  

---

## Project Overview

Smart Pantry helps households reduce food waste and save money by managing pantry and fridge items more efficiently. The system tracks inventory, predicts freshness, and provides personalized recipe recommendations. Shared accounts make it easy for families or roommates to coordinate shopping and usage.  

---

## Team Information

**Team Members & Roles**  
- Michael Krueger – Full Stack  
- Parker Malmgren – Full Stack  
- Creed McFall – Full Stack  
- Zachary Meyer – Full Stack  

---

## Features

### Core Features
1. **Inventory Management** – Add, edit, and track items through barcode scanning or image uploads.  
2. **Expiration Tracking & Notifications** – Reminders before items expire, plus “use-soon” lists.  
3. **Recipe Recommendations** – Personalized recipes that prioritize soon-to-expire items and handle dietary preferences (e.g., vegetarian).  
4. **Shared Household Accounts** – Sync shopping lists and roles for households.  
5. **Analytics Dashboard** – Track waste avoided, money saved, and usage trends.  

---

## Technology Stack

- **Backend Development:** FastAPI with Supabase for database and server logic  
- **Frontend Development:** Next.js interface for mobile and web users  
- **AI/ML:** OpenAI GPT-4 Vision for receipt scanning and OCR  
- **APIs & Integrations:** USDA FoodData Central, OpenAI, Supabase Auth  
- **Testing & Deployment:** Feature testing, UI/UX refinement, deployed prototype with Vercel  

---

## Setup Instructions

### Prerequisites
- **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
- **Python** (v3.11 or higher) - [Download](https://www.python.org/)
- **Git** - [Download](https://git-scm.com/)

### 1. Clone Repository
```bash
git clone https://github.com/Cmcfall04/CSC-401-senior-capstone-project.git
cd CSC-401-senior-capstone-project
```

### 2. Environment Variables
Create a `.env` file in the project root with:
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FRONTEND_URL=http://localhost:3000

# APIs
USDA_API_KEY=your_usda_api_key
OPENAI_API_KEY=your_openai_api_key

# CORS
ALLOWED_ORIGINS=http://localhost:3000
```

### 3. Frontend Setup
```bash
# Install dependencies
npm install

# Run development server
npm run dev
```
Frontend will run on http://localhost:3000

### 4. Backend Setup
```bash
# Navigate to api folder
cd api

# Install Python dependencies
pip install fastapi uvicorn supabase python-dotenv httpx pydantic openai pillow python-multipart

# Run backend server
python -m uvicorn src.main:app --reload
```
Backend will run on http://localhost:8000

### 5. API Keys Setup

**Supabase:**
1. Create account at https://supabase.com
2. Create new project
3. Get URL and service role key from Settings > API

**USDA FoodData Central:**
1. Sign up at https://fdc.nal.usda.gov/api-key-signup.html
2. Get free API key

**OpenAI (for receipt scanning):**
1. Create account at https://platform.openai.com/
2. Go to API Keys section
3. Create new secret key

---

## Sprint Outline

**Sprint 1 – Frontend Foundations**  
- Develop a basic homepage and navigation structure  
- Create a prototype management page to outline functionality  
- Establish UI/UX framework (frontend only)  

**Sprint 2 – Backend Integration**  
- Set up backend frameworks (FastAPI + MySQL)  
- Connect backend to frontend and validate with sample data  
- Ensure reliable data flow between UI and server  

**Sprint 3 – Core Feature Implementation**  
- Implement inventory management and backend storage  
- Integrate barcode scanning API for item logging  
- Refine overall system stability and usability  

---

## Extra Work (If Time Allows)

- Deal finder for best prices on missing recipe items  
- Dietary and allergy filters for recipe recommendations  
- Expanded analytics dashboard with waste-reduction tips  
- Community sharing features (neighbors swapping surplus items)  
- Gamification (badges/rewards) to encourage sustainable habits  

---

## Links

- **GitHub Repository:** [Smart Pantry Repo](https://github.com/Cmcfall04/CSC-401-senior-capstone-project.git)  
- **Trello Board:** [Smart Pantry Trello](https://trello.com/invite/b/68d14d9b9d697e1f48aa5291/ATTI5e381c16c92ebbee0a4dfeac19c276c50CFF531C/smartpantry-capstone-project)  

---
