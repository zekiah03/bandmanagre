create schema if not exists app_private;

create or replace function app_private.stm_is_member(target_band_id uuid)
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

create or replace function app_private.stm_is_admin(target_band_id uuid)
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

revoke execute on function app_private.stm_is_member(uuid) from anon, public;
revoke execute on function app_private.stm_is_admin(uuid) from anon, public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.stm_is_member(uuid) to authenticated;
grant execute on function app_private.stm_is_admin(uuid) to authenticated;

drop policy if exists "stm bands read" on public.stm_bands;
create policy "stm bands read" on public.stm_bands for select to authenticated using (created_by = (select auth.uid()) or app_private.stm_is_member(id));

drop policy if exists "stm bands update" on public.stm_bands;
create policy "stm bands update" on public.stm_bands for update to authenticated using (created_by = (select auth.uid()) or app_private.stm_is_admin(id)) with check (created_by = (select auth.uid()) or app_private.stm_is_admin(id));

drop policy if exists "stm members read" on public.stm_members;
create policy "stm members read" on public.stm_members for select to authenticated using (app_private.stm_is_member(band_id) or user_id = (select auth.uid()) or lower(coalesce(email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), '')));

drop policy if exists "stm members create" on public.stm_members;
create policy "stm members create" on public.stm_members for insert to authenticated with check (
  user_id = (select auth.uid())
  or exists (select 1 from public.stm_bands b where b.id = band_id and b.created_by = (select auth.uid()))
  or app_private.stm_is_admin(band_id)
);

drop policy if exists "stm members update" on public.stm_members;
create policy "stm members update" on public.stm_members for update to authenticated using (app_private.stm_is_admin(band_id) or user_id = (select auth.uid())) with check (app_private.stm_is_admin(band_id) or user_id = (select auth.uid()));

drop policy if exists "stm events all" on public.stm_events;
create policy "stm events all" on public.stm_events for all to authenticated using (app_private.stm_is_member(band_id)) with check (app_private.stm_is_member(band_id));

drop policy if exists "stm tasks all" on public.stm_tasks;
create policy "stm tasks all" on public.stm_tasks for all to authenticated using (app_private.stm_is_member(band_id)) with check (app_private.stm_is_member(band_id));

drop policy if exists "stm transactions all" on public.stm_transactions;
create policy "stm transactions all" on public.stm_transactions for all to authenticated using (app_private.stm_is_member(band_id)) with check (app_private.stm_is_member(band_id));

drop policy if exists "stm meeting minutes all" on public.stm_meeting_minutes;
create policy "stm meeting minutes all" on public.stm_meeting_minutes for all to authenticated using (app_private.stm_is_member(band_id)) with check (app_private.stm_is_member(band_id));

drop function if exists public.stm_is_member(uuid);
drop function if exists public.stm_is_admin(uuid);
