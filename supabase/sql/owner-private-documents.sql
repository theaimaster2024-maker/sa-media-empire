create table public.owner_private_documents (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 content text not null default '',
 version bigint not null default 1 check(version>0),
 updated_at timestamptz not null default now()
);
alter table public.owner_private_documents enable row level security;
revoke all on public.owner_private_documents from anon;
grant select,insert,update,delete on public.owner_private_documents to authenticated;
create policy "owner document access" on public.owner_private_documents for all to authenticated
 using(owner_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='owner'))
 with check(owner_id=(select auth.uid()) and exists(select 1 from public.profiles where id=(select auth.uid()) and role='owner'));
