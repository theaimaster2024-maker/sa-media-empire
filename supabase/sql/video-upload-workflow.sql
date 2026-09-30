alter table public.editor_projects
 add column upload_status text not null default 'ready' check (upload_status in ('ready','uploaded','published')),
 add column upload_url text,
 add column upload_channel_id uuid references public.finance_channels(id) on delete set null,
 add column upload_notes text,
 add column uploaded_at timestamptz,
 add column published_at timestamptz;
create index editor_projects_upload_queue_idx on public.editor_projects(upload_status,updated_at desc) where is_completed;
create index editor_projects_upload_channel_idx on public.editor_projects(upload_channel_id) where upload_channel_id is not null;
create function public.guard_video_upload_workflow() returns trigger language plpgsql security invoker set search_path='' as $$
declare changed boolean;
begin
 if TG_OP='INSERT' then
  if new.upload_status<>'ready' or new.upload_url is not null or new.upload_channel_id is not null or new.upload_notes is not null or new.uploaded_at is not null or new.published_at is not null then raise exception 'Create the project before recording its upload'; end if;
  return new;
 end if;
 changed:=row(new.upload_status,new.upload_url,new.upload_channel_id,new.upload_notes,new.uploaded_at,new.published_at) is distinct from row(old.upload_status,old.upload_url,old.upload_channel_id,old.upload_notes,old.uploaded_at,old.published_at);
 if changed and not exists(select 1 from public.profiles where id=auth.uid() and role in ('owner','manager')) then raise exception 'Only owner or manager can manage video uploads' using errcode='42501'; end if;
 if old.is_completed and not new.is_completed then
  -- Keep reference URL/channel/notes, but require renewed upload confirmation after revision.
  new.upload_status='ready'; new.uploaded_at=null; new.published_at=null;
  return new;
 end if;
 if changed then
  if not new.is_completed or new.status<>'done' then raise exception 'Complete the project before recording an upload'; end if;
  if new.upload_url is not null and new.upload_url !~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/[^[:space:]]+$' then raise exception 'Use a valid HTTPS YouTube video URL'; end if;
  if new.upload_status='published' and coalesce(new.upload_url,'')='' then raise exception 'Add the published YouTube video link'; end if;
  if new.upload_status='ready' then new.uploaded_at=null;new.published_at=null;
  elsif new.upload_status='uploaded' then new.uploaded_at=coalesce(old.uploaded_at,now());new.published_at=null;
  else new.uploaded_at=coalesce(old.uploaded_at,now());new.published_at=coalesce(old.published_at,now());end if;
 end if;
 return new;
end $$;
create trigger video_upload_workflow_guard before insert or update on public.editor_projects for each row execute function public.guard_video_upload_workflow();
