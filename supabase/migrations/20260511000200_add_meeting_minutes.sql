create table if not exists public.stm_meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.stm_bands(id) on delete cascade,
  event_id uuid references public.stm_events(id) on delete set null,
  title text not null,
  body text not null,
  decisions text,
  action_items text,
  next_steps text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stm_meeting_minutes_band_id_created_at_idx
  on public.stm_meeting_minutes(band_id, created_at desc);

create index if not exists stm_meeting_minutes_event_id_idx
  on public.stm_meeting_minutes(event_id);

alter table public.stm_meeting_minutes enable row level security;

drop policy if exists "stm meeting minutes all" on public.stm_meeting_minutes;
create policy "stm meeting minutes all"
  on public.stm_meeting_minutes
  for all
  to authenticated
  using (public.stm_is_member(band_id))
  with check (public.stm_is_member(band_id));

grant select, insert, update, delete on public.stm_meeting_minutes to authenticated;
