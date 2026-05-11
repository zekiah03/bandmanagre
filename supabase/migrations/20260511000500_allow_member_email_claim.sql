drop policy if exists "stm members update" on public.stm_members;
create policy "stm members update" on public.stm_members
  for update to authenticated
  using (
    app_private.stm_is_admin(band_id)
    or user_id = (select auth.uid())
    or lower(coalesce(email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  )
  with check (
    app_private.stm_is_admin(band_id)
    or user_id = (select auth.uid())
    or lower(coalesce(email, '')) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );
