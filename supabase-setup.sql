-- Bullet Journal — Supabase schema + Row Level Security.
-- Paste into the Supabase SQL editor and run once.

-- One journal row per user, keyed by their auth id.
create table if not exists public.journal (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  content    text        not null default '',
  updated_at timestamptz not null default now()
);

-- Without RLS the publishable key would let anyone read/write. Turn it on.
alter table public.journal enable row level security;

-- Each user can only see and change their own row.
create policy "own journal - select" on public.journal
  for select using (auth.uid() = user_id);
create policy "own journal - insert" on public.journal
  for insert with check (auth.uid() = user_id);
create policy "own journal - update" on public.journal
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
