insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('studio-originals','studio-originals',false,20971520,array['image/png','image/jpeg','image/webp','image/gif','image/avif','image/bmp']) on conflict(id) do nothing;
create function board_private.image_access(object_name text,editing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.studio_boards b where b.id::text=split_part(object_name,'/',1) and board_private.access(b.id,editing));
$$;
revoke all on function board_private.image_access(text,boolean) from public;
grant execute on function board_private.image_access(text,boolean) to authenticated;
create policy studio_originals_insert on storage.objects for insert to authenticated with check(bucket_id='studio-originals' and board_private.image_access(name,true));
create policy studio_originals_read on storage.objects for select to authenticated using(bucket_id='studio-originals' and board_private.image_access(name,false));
