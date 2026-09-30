-- One Notes entry point, shared between the owner's and managers' workspace.
-- Existing private/shared note contents are preserved.
drop policy "owner only private notes" on public.private_notes;
create policy "workspace notes staff read" on public.private_notes for select to authenticated
 using (exists(select 1 from public.profiles where id=auth.uid() and role in ('owner','manager')));
create policy "workspace notes staff update" on public.private_notes for update to authenticated
 using (exists(select 1 from public.profiles where id=auth.uid() and role in ('owner','manager')))
 with check (exists(select 1 from public.profiles where id=auth.uid() and role in ('owner','manager')));
create policy "workspace notes staff create" on public.private_notes for insert to authenticated
 with check (owner_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role in ('owner','manager')));
create policy "workspace notes owner delete" on public.private_notes for delete to authenticated
 using (exists(select 1 from public.profiles where id=auth.uid() and role='owner'));
