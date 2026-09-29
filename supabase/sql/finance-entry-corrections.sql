create or replace function public.guard_editor_payment_ledger() returns trigger language plpgsql set search_path='' as $$
declare paid numeric; role_name text;
begin
 select role into role_name from public.profiles where id=auth.uid();
 if TG_OP='INSERT' then
  if coalesce(new.paid_amount,0)<>0 or new.payment_status<>'unpaid' or new.payment_date is not null then raise exception 'Create projects unpaid, then use Mark as Paid'; end if;
  return new;
 end if;
 if old.payment_status is distinct from new.payment_status or old.paid_amount is distinct from new.paid_amount or old.payment_date is distinct from new.payment_date then
  if auth.uid() is null or role_name is distinct from 'owner' then raise exception 'Only the owner can record editor payments' using errcode='42501'; end if;
  select sum(amount) into paid from public.finance_expenses where editor_project_id=new.id and approval_status='paid';
  if new.payment_status='unpaid' and coalesce(new.paid_amount,0)=0 and new.payment_date is null and not exists(select 1 from public.finance_expenses where editor_project_id=new.id) then return new; end if;
  if new.payment_status<>'paid' or coalesce(paid,0)<=0 or new.paid_amount is distinct from paid or new.paid_amount is distinct from coalesce(nullif(new.total_amount,0),new.amount,0) or new.payment_date is null then raise exception 'Record payment through the linked Finance transaction'; end if;
 end if;
 if coalesce(old.paid_amount,0)>0 and (coalesce(nullif(new.total_amount,0),new.amount,0) is distinct from coalesce(nullif(old.total_amount,0),old.amount,0)) then raise exception 'A paid project amount cannot be changed'; end if;
 return new;
end $$;
create or replace function public.guard_linked_finance_expense() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if old.editor_project_id is not null then
   if not exists(select 1 from public.profiles where id=auth.uid() and role='owner') then raise exception 'Only the owner can remove an editor payment' using errcode='42501'; end if;
   perform 1 from public.editor_projects where id=old.editor_project_id for update;
  end if; return old;
 end if;
 if new.scope not in ('whole_business','channel') or new.scope is null then raise exception 'Choose Whole Business or a channel'; end if;
 if new.scope='channel' and new.channel_id is null then raise exception 'Choose a channel'; end if;
 if new.scope='whole_business' then new.channel_id=null; end if;
 if new.amount<=0 then raise exception 'Amount must be positive'; end if;
 if new.editor_project_id is not null and not exists(select 1 from public.profiles where id=auth.uid() and role='owner') then raise exception 'Only the owner can record editor payments' using errcode='42501'; end if;
 if TG_OP='UPDATE' and old.editor_project_id is not null and (new.editor_project_id is distinct from old.editor_project_id or new.amount is distinct from old.amount or new.approval_status is distinct from old.approval_status or new.payment_date is distinct from old.payment_date) then raise exception 'Linked editor payment records are immutable'; end if;
 return new;
end $$;
-- Deletion and project reset are one transaction. No money is transferred or refunded.
create or replace function public.reset_deleted_editor_payment() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if old.editor_project_id is not null then
  update public.editor_projects set payment_status='unpaid',paid_amount=0,payment_date=null,invoice_generated_at=null where id=old.editor_project_id;
  if not found then raise exception 'Could not reset linked project'; end if;
 end if;
 return old;
end $$;
create trigger reset_deleted_editor_payment after delete on public.finance_expenses for each row execute function public.reset_deleted_editor_payment();
