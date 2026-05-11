create extension if not exists pgcrypto;

create table if not exists public.stm_bands (
  id uuid primary key default gen_random_uuid(),
  name text not null default '震星理論',
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.stm_members (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.stm_bands(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  display_name text not null,
  instrument text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique (band_id, user_id),
  unique (band_id, email)
);

create table if not exists public.stm_events (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.stm_bands(id) on delete cascade,
  title text not null,
  kind text not null default 'rehearsal' check (kind in ('rehearsal','live','recording','meeting','other')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.stm_tasks (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.stm_bands(id) on delete cascade,
  title text not null,
  description text,
  assignee_member_id uuid references public.stm_members(id) on delete set null,
  due_date date,
  status text not null default 'todo' check (status in ('todo','doing','done')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.stm_transactions (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.stm_bands(id) on delete cascade,
  kind text not null check (kind in ('income','expense')),
  category text not null default 'other',
  title text not null,
  amount integer not null check (amount >= 0),
  occurred_on date not null default current_date,
  member_id uuid references public.stm_members(id) on delete set null,
  memo text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists stm_members_band_id_idx on public.stm_members(band_id);
create index if not exists stm_members_user_id_idx on public.stm_members(user_id);
create index if not exists stm_events_band_id_starts_at_idx on public.stm_events(band_id, starts_at);
create index if not exists stm_tasks_band_id_status_idx on public.stm_tasks(band_id, status);
create index if not exists stm_tasks_assignee_member_id_idx on public.stm_tasks(assignee_member_id);
create index if not exists stm_transactions_band_id_occurred_on_idx on public.stm_transactions(band_id, occurred_on desc);
create index if not exists stm_transactions_member_id_idx on public.stm_transactions(member_id);

create or replace function public.stm_is_member(target_band_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stm_members m
    where m.band_id = target_band_id
      and (m.user_id = (select auth.uid()) or lower(coalesce(m.email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), '')))
  );
$$;

create or replace function public.stm_is_admin(target_band_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.stm_members m
    where m.band_id = target_band_id
      and m.role = 'admin'
      and (m.user_id = (select auth.uid()) or lower(coalesce(m.email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), '')))
  );
$$;

revoke execute on function public.stm_is_member(uuid) from anon, public;
revoke execute on function public.stm_is_admin(uuid) from anon, public;
grant execute on function public.stm_is_member(uuid) to authenticated;
grant execute on function public.stm_is_admin(uuid) to authenticated;

alter table public.stm_bands enable row level security;
alter table public.stm_members enable row level security;
alter table public.stm_events enable row level security;
alter table public.stm_tasks enable row level security;
alter table public.stm_transactions enable row level security;

drop policy if exists "stm bands read" on public.stm_bands;
create policy "stm bands read" on public.stm_bands for select to authenticated using (created_by = (select auth.uid()) or public.stm_is_member(id));

drop policy if exists "stm bands create" on public.stm_bands;
create policy "stm bands create" on public.stm_bands for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "stm bands update" on public.stm_bands;
create policy "stm bands update" on public.stm_bands for update to authenticated using (created_by = (select auth.uid()) or public.stm_is_admin(id)) with check (created_by = (select auth.uid()) or public.stm_is_admin(id));

drop policy if exists "stm members read" on public.stm_members;
create policy "stm members read" on public.stm_members for select to authenticated using (public.stm_is_member(band_id) or user_id = (select auth.uid()) or lower(coalesce(email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), '')));

drop policy if exists "stm members create" on public.stm_members;
create policy "stm members create" on public.stm_members for insert to authenticated with check (
  user_id = (select auth.uid())
  or exists (select 1 from public.stm_bands b where b.id = band_id and b.created_by = (select auth.uid()))
  or public.stm_is_admin(band_id)
);

drop policy if exists "stm members update" on public.stm_members;
create policy "stm members update" on public.stm_members for update to authenticated using (public.stm_is_admin(band_id) or user_id = (select auth.uid())) with check (public.stm_is_admin(band_id) or user_id = (select auth.uid()));

drop policy if exists "stm events all" on public.stm_events;
create policy "stm events all" on public.stm_events for all to authenticated using (public.stm_is_member(band_id)) with check (public.stm_is_member(band_id));

drop policy if exists "stm tasks all" on public.stm_tasks;
create policy "stm tasks all" on public.stm_tasks for all to authenticated using (public.stm_is_member(band_id)) with check (public.stm_is_member(band_id));

drop policy if exists "stm transactions all" on public.stm_transactions;
create policy "stm transactions all" on public.stm_transactions for all to authenticated using (public.stm_is_member(band_id)) with check (public.stm_is_member(band_id));

grant select, insert, update, delete on public.stm_bands, public.stm_members, public.stm_events, public.stm_tasks, public.stm_transactions to authenticated;
