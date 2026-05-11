alter table public.stm_events
  add column if not exists allow_muted_participation boolean not null default false;

create table if not exists public.stm_schedule_polls (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.stm_bands(id) on delete cascade,
  title text not null,
  kind text not null default 'rehearsal' check (kind in ('rehearsal','live','recording','meeting','other')),
  note text,
  allow_muted_participation boolean not null default false,
  status text not null default 'open' check (status in ('open','closed')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.stm_availability_slots (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.stm_schedule_polls(id) on delete cascade,
  band_id uuid not null references public.stm_bands(id) on delete cascade,
  member_id uuid not null references public.stm_members(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  can_join_muted boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  constraint stm_availability_slots_time_order check (ends_at > starts_at),
  unique (poll_id, member_id, starts_at, ends_at)
);

create index if not exists stm_schedule_polls_band_id_status_idx on public.stm_schedule_polls(band_id, status, created_at desc);
create index if not exists stm_availability_slots_band_id_starts_at_idx on public.stm_availability_slots(band_id, starts_at);
create index if not exists stm_availability_slots_poll_id_idx on public.stm_availability_slots(poll_id);
create index if not exists stm_availability_slots_member_id_idx on public.stm_availability_slots(member_id);

alter table public.stm_schedule_polls enable row level security;
alter table public.stm_availability_slots enable row level security;

drop policy if exists "stm schedule polls all" on public.stm_schedule_polls;
create policy "stm schedule polls all" on public.stm_schedule_polls
  for all to authenticated
  using (app_private.stm_is_member(band_id))
  with check (app_private.stm_is_member(band_id));

drop policy if exists "stm availability slots all" on public.stm_availability_slots;
create policy "stm availability slots all" on public.stm_availability_slots
  for all to authenticated
  using (app_private.stm_is_member(band_id))
  with check (app_private.stm_is_member(band_id));

grant select, insert, update, delete on public.stm_schedule_polls, public.stm_availability_slots to authenticated;
