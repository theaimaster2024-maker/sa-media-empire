alter table public.finance_expenses add column editor_project_id bigint references public.editor_projects(id) on delete restrict;
create unique index finance_expenses_editor_project_unique on public.finance_expenses(editor_project_id) where editor_project_id is not null;
create function public.guard_editor_payment_ledger() returns trigger language plpgsql set search_path='' as $$
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
  if new.payment_status<>'paid' or coalesce(paid,0)<=0 or new.paid_amount is distinct from paid or new.paid_amount is distinct from coalesce(nullif(new.total_amount,0),new.amount,0) or new.payment_date is null then raise exception 'Record payment through the linked Finance transaction'; end if;
 end if;
 if coalesce(old.paid_amount,0)>0 and (coalesce(nullif(new.total_amount,0),new.amount,0) is distinct from coalesce(nullif(old.total_amount,0),old.amount,0)) then raise exception 'A paid project amount cannot be changed'; end if;
 return new;
end $$;
create trigger editor_payment_ledger_guard before insert or update on public.editor_projects for each row execute function public.guard_editor_payment_ledger();
create function public.guard_linked_finance_expense() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if old.editor_project_id is not null then raise exception 'Linked editor payments cannot be deleted'; end if; return old;
 end if;
 if new.scope not in ('whole_business','channel') or new.scope is null then raise exception 'Choose Whole Business or a channel'; end if;
 if new.scope='channel' and new.channel_id is null then raise exception 'Choose a channel'; end if;
 if new.scope='whole_business' then new.channel_id=null; end if;
 if new.amount<=0 then raise exception 'Amount must be positive'; end if;
 if new.editor_project_id is not null and not exists(select 1 from public.profiles where id=auth.uid() and role='owner') then raise exception 'Only the owner can record editor payments' using errcode='42501'; end if;
 if TG_OP='UPDATE' and old.editor_project_id is not null and (new.editor_project_id is distinct from old.editor_project_id or new.amount is distinct from old.amount or new.approval_status is distinct from old.approval_status or new.scope is distinct from old.scope or new.channel_id is distinct from old.channel_id or new.payment_date is distinct from old.payment_date) then raise exception 'Linked editor payment records are immutable'; end if;
 return new;
end $$;
create trigger linked_finance_expense_guard before insert or update or delete on public.finance_expenses for each row execute function public.guard_linked_finance_expense();
create function public.record_editor_payment(p_project_id bigint,p_scope text,p_channel_id uuid default null,p_expected_total numeric default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.editor_projects%rowtype; existing public.finance_expenses%rowtype; total numeric; expense_id uuid; payee_name text; pay_date date := (now() at time zone 'Asia/Dhaka')::date;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role='owner') then raise exception 'Only the owner can record editor payments' using errcode='42501'; end if;
 select * into p from public.editor_projects where id=p_project_id for update;
 if not found then raise exception 'Project not found'; end if;
 select * into existing from public.finance_expenses where editor_project_id=p.id;
 if found then return jsonb_build_object('expense_id',existing.id,'already_paid',true,'amount',existing.amount); end if;
 if not p.is_completed then raise exception 'Complete the project before recording payment'; end if;
 total:=coalesce(nullif(p.total_amount,0),p.amount,0);
 if total<=0 then raise exception 'Set a positive project total before recording payment'; end if;
 if p_expected_total is null or p_expected_total<>total then raise exception 'Project amount changed. Reopen the payment form'; end if;
 if p_scope not in ('whole_business','channel') or p_scope is null then raise exception 'Choose an expense scope'; end if;
 if p_scope='channel' and (p_channel_id is null or not exists(select 1 from public.finance_channels where id=p_channel_id)) then raise exception 'Choose a valid channel'; end if;
 if p_scope='whole_business' then p_channel_id=null; end if;
 select name into payee_name from public.editors where id=p.editor_id;
 insert into public.finance_expenses(date,payee,amount,description,category,scope,channel_id,payment_method,approval_status,payment_date,requested_by,approved_by,voucher_number,editor_project_id)
 values(pay_date,coalesce(payee_name,'Editor'),total,'Editor payment · '||coalesce(p.project_name,'Project'),'Editor Payment',p_scope,p_channel_id,p.payment_method,'paid',pay_date,auth.uid(),auth.uid(),'ED-'||p.id::text,p.id) returning id into expense_id;
 update public.editor_projects set payment_status='paid',paid_amount=total,payment_date=pay_date where id=p.id;
 return jsonb_build_object('expense_id',expense_id,'already_paid',false,'amount',total);
end $$;
revoke all on function public.record_editor_payment(bigint,text,uuid,numeric) from public,anon;
grant execute on function public.record_editor_payment(bigint,text,uuid,numeric) to authenticated;
