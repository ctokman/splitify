-- Splittify database schema for Supabase
-- Run this in the Supabase SQL Editor after creating your project

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Groups: expense groups users can create and join
create table public.groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- Group members: who belongs to which group
create table public.group_members (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);

-- Invites: pending invitations by email
create table public.invites (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.groups(id) on delete cascade,
  email text not null,
  invited_by uuid references auth.users(id) on delete set null,
  status text default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  unique(group_id, email)
);

-- Expenses: who paid, how much (in cents), split among members
create table public.expenses (
  id uuid primary key default uuid_generate_v4(),
  group_id uuid not null references public.groups(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  paid_by uuid not null references auth.users(id) on delete cascade,
  description text default '',
  created_at timestamptz default now()
);

-- Expense splits: which members share each expense (equal split = amount_cents / count)
create table public.expense_splits (
  id uuid primary key default uuid_generate_v4(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  unique(expense_id, user_id)
);

-- RLS policies: users only see their own data
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invites enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;

-- Groups: users can see groups they're members of
create policy "Users see groups they belong to"
  on public.groups for select
  using (
    id in (select group_id from public.group_members where user_id = auth.uid())
  );

create policy "Users can create groups"
  on public.groups for insert
  with check (auth.uid() = created_by);

create policy "Group creators can update their groups"
  on public.groups for update
  using (created_by = auth.uid());

-- Auto-add group creator as a member
create or replace function public.add_creator_as_member()
returns trigger as $$
begin
  insert into public.group_members (group_id, user_id)
  values (new.id, new.created_by)
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.add_creator_as_member();

-- Group members: members can see other members of their groups
create policy "Members see group members"
  on public.group_members for select
  using (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

create policy "Group members can add members"
  on public.group_members for insert
  with check (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

-- Users can add themselves when accepting an invite (matched by email)
create policy "Users can join via invite"
  on public.group_members for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.invites i
      where i.group_id = group_members.group_id
        and i.email = (select email from auth.users where id = auth.uid())
        and i.status = 'pending'
    )
  );

-- Invites: members can see invites for their groups
create policy "Members see group invites"
  on public.invites for select
  using (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
    or email = (select email from auth.users where id = auth.uid())
  );

create policy "Members can create invites"
  on public.invites for insert
  with check (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

create policy "Invitees can update their invites"
  on public.invites for update
  using (email = (select email from auth.users where id = auth.uid()));

-- Expenses: members can see and add expenses
create policy "Members see group expenses"
  on public.expenses for select
  using (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
  );

create policy "Members can add expenses"
  on public.expenses for insert
  with check (
    group_id in (select group_id from public.group_members where user_id = auth.uid())
    and paid_by = auth.uid()
  );

-- Expense splits: members can see splits for their group expenses
create policy "Members see expense splits"
  on public.expense_splits for select
  using (
    expense_id in (
      select id from public.expenses
      where group_id in (select group_id from public.group_members where user_id = auth.uid())
    )
  );

create policy "Expense creators can add splits"
  on public.expense_splits for insert
  with check (
    expense_id in (
      select id from public.expenses
      where group_id in (select group_id from public.group_members where user_id = auth.uid())
    )
  );
