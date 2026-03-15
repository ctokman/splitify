# Splittify

A shared expense tracker for splitting bills with friends. Create groups, invite people by email, add expenses, and see who owes whom.

## Features

- **User accounts**: Register, login, logout with email/password
- **Sessions**: Stay logged in across page loads
- **Protected routes**: Dashboard and groups require login
- **Expense groups**: Create groups with a name
- **Invites**: Invite others by email; they accept from their dashboard
- **Expenses**: Add expenses (who paid, amount, split among members)
- **Balances**: Automatic calculation of who owes whom
- **Data scoping**: You only see groups you belong to

Money is stored as integer cents to avoid floating-point rounding issues.

## Setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project
2. In the SQL Editor, run the contents of `supabase/schema.sql` to create tables and RLS policies

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase URL and anon key (from Project Settings → API):

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. Run the app

```bash
npm install
npm run dev
```

Open http://localhost:5173

### 4. Seed test data (optional)

Creates 4 test users and sample groups/expenses:

```bash
# Add SUPABASE_SERVICE_ROLE_KEY to .env (from Supabase → Project Settings → API)
npm run seed
```

Test accounts (password: `testpass123`):
- alice@test.splittify.dev
- bob@test.splittify.dev
- carol@test.splittify.dev
- dave@test.splittify.dev

Alice & Bob see both "Paris Trip 2025" and "NYC Weekend". Carol & Dave see only "Paris Trip 2025".

## Tech stack

- React + Vite
- Supabase (auth + database)
- React Router
