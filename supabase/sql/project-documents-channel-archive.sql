-- Additive: no existing project or financial records are rewritten.
create table public.project_documents (
 project_id bigint primary key references public.editor_projects(id) on delete cascade,
 content text not null default '',
 assets jsonb not null default '[]'::jsonb check(jsonb_typeof(assets)='array'),
 version bigint not null default 1 check(version>0),
 updated_at timestamptz not null default now()
);
alter table public.project_documents enable row level security;
revoke all on public.project_documents from anon;
grant select,insert,update on public.project_documents to authenticated;
create policy project_document_read on public.project_documents for select to authenticated
 using((exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role in ('owner','manager')) or exists(select 1 from public.editor_projects p join public.editors e on e.id=p.editor_id join public.profiles me on lower(me.email)=lower(e.email) where me.id=(select auth.uid()) and p.id=project_id)));
create policy project_document_create on public.project_documents for insert to authenticated
 with check(exists(select 1 from public.profiles where id=(select auth.uid()) and role in ('owner','manager')) and exists(select 1 from public.editor_projects p where p.id=project_id));
create policy project_document_edit on public.project_documents for update to authenticated
 using(exists(select 1 from public.profiles where id=(select auth.uid()) and role in ('owner','manager')))
 with check(exists(select 1 from public.profiles where id=(select auth.uid()) and role in ('owner','manager')) and exists(select 1 from public.editor_projects p where p.id=project_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('project-originals','project-originals',false,20971520,array['image/png','image/jpeg','image/webp','image/gif','image/avif','image/bmp']);
create policy project_original_read on storage.objects for select to authenticated
 using(bucket_id='project-originals' and (exists(select 1 from public.profiles me where me.id=(select auth.uid()) and me.role in ('owner','manager')) or exists(select 1 from public.editor_projects p join public.editors e on e.id=p.editor_id join public.profiles me on lower(me.email)=lower(e.email) where me.id=(select auth.uid()) and p.id::text=split_part(storage.objects.name,'/',1))));
create policy project_original_upload on storage.objects for insert to authenticated
 with check(bucket_id='project-originals' and exists(select 1 from public.profiles where id=(select auth.uid()) and role in ('owner','manager')) and exists(select 1 from public.editor_projects p where p.id::text=split_part(name,'/',1)));

-- Explicit owner action: lock the channel so new FK references cannot race the empty check.
-- Existing foreign keys are unchanged.
create function public.delete_empty_finance_channel(channel_to_delete uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role='owner') then raise exception 'Owner only'; end if;
 perform 1 from public.finance_channels where id=channel_to_delete for update;
 if not found then return false; end if;
 if exists(select 1 from public.finance_income where channel_id=channel_to_delete)
 or exists(select 1 from public.finance_expenses where channel_id=channel_to_delete)
 or exists(select 1 from public.finance_payroll where channel_id=channel_to_delete)
 or exists(select 1 from public.finance_subscriptions where channel_id=channel_to_delete)
 or exists(select 1 from public.editor_projects where upload_channel_id=channel_to_delete) then
 raise exception 'Channel has linked records. Archive it instead.';
 end if;
 delete from public.finance_channels where id=channel_to_delete;
 return true;
end $$;
revoke all on function public.delete_empty_finance_channel(uuid) from public,anon;
grant execute on function public.delete_empty_finance_channel(uuid) to authenticated;
