create schema if not exists board_private;
create table public.studio_boards (
 id uuid primary key default gen_random_uuid(), title text not null default 'Untitled board' check(length(title) between 1 and 160),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 share_token uuid unique, cover text not null default 'violet'
);
create table public.studio_board_members (
 board_id uuid not null references public.studio_boards(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 can_edit boolean not null default false, primary key(board_id,user_id)
);
create table public.studio_board_items (
 id uuid primary key, board_id uuid not null references public.studio_boards(id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object'), deleted boolean not null default false,
 updated_at timestamptz not null default now()
);
create index studio_board_items_board_idx on public.studio_board_items(board_id);
create index studio_board_members_user_idx on public.studio_board_members(user_id);
create function board_private.staff() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role in ('owner','manager'));
$$;
create function board_private.access(b uuid, editing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (board_private.staff() or exists(select 1 from public.studio_board_members where board_id=b and user_id=auth.uid() and (not editing or can_edit)));
$$;
revoke all on schema board_private from public;
grant usage on schema board_private to authenticated;
revoke all on all functions in schema board_private from public;
grant execute on all functions in schema board_private to authenticated;
alter table public.studio_boards enable row level security;
alter table public.studio_board_members enable row level security;
alter table public.studio_board_items enable row level security;
grant select,insert,update,delete on public.studio_boards,public.studio_board_members,public.studio_board_items to authenticated;
create policy boards_read on public.studio_boards for select to authenticated using(board_private.access(id));
create policy boards_insert on public.studio_boards for insert to authenticated with check(board_private.staff() and created_by=auth.uid());
create policy boards_update on public.studio_boards for update to authenticated using(board_private.staff()) with check(board_private.staff());
create policy boards_delete on public.studio_boards for delete to authenticated using(board_private.staff());
create policy members_read on public.studio_board_members for select to authenticated using(user_id=auth.uid() or board_private.staff());
create policy members_insert on public.studio_board_members for insert to authenticated with check(board_private.staff());
create policy members_update on public.studio_board_members for update to authenticated using(board_private.staff()) with check(board_private.staff());
create policy members_delete on public.studio_board_members for delete to authenticated using(board_private.staff());
create policy items_read on public.studio_board_items for select to authenticated using(board_private.access(board_id));
create policy items_insert on public.studio_board_items for insert to authenticated with check(board_private.access(board_id,true));
create policy items_update on public.studio_board_items for update to authenticated using(board_private.access(board_id,true)) with check(board_private.access(board_id,true));
create policy items_delete on public.studio_board_items for delete to authenticated using(board_private.access(board_id,true));
create function public.read_shared_studio_board(token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',b.id,'title',b.title,'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'payload',i.payload,'deleted',i.deleted)) from public.studio_board_items i where i.board_id=b.id and not i.deleted),'[]'::jsonb)) from public.studio_boards b where b.share_token=token and token is not null;
$$;
revoke all on function public.read_shared_studio_board(uuid) from public;
grant execute on function public.read_shared_studio_board(uuid) to anon,authenticated;
