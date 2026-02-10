-- ============================================================
-- 0112_add_account_type.sql
-- Add account_type to accounts and update reporting to use it
-- ============================================================

do $$ begin
  create type account_type_enum as enum ('ASSET','LIABILITY','EQUITY','REVENUE','COGS','EXPENSE');
exception when duplicate_object then null; end $$;

alter table public.accounts
  add column if not exists account_type account_type_enum;

-- Backfill based on code prefix
update public.accounts
set account_type = case
  when code like '1%' then 'ASSET'::account_type_enum
  when code like '2%' then 'LIABILITY'::account_type_enum
  when code like '3%' then 'EQUITY'::account_type_enum
  when code like '4%' then 'REVENUE'::account_type_enum
  when code like '5%' then 'COGS'::account_type_enum
  when code like '6%' or code like '7%' or code like '8%' or code like '9%' then 'EXPENSE'::account_type_enum
  else account_type
end
where account_type is null;

-- Fallback for any remaining NULLs
update public.accounts
set account_type = 'ASSET'::account_type_enum
where account_type is null;

alter table public.accounts
  alter column account_type set default 'ASSET',
  alter column account_type set not null;

-- Update report RPC to use account_type (no prefix dependency)
create or replace function public.rpc_get_account_balances(p_start_date date, p_end_date date)
returns setof report_account_balance language plpgsql security definer as $$
begin
  if not public.is_owner() then raise exception 'Owner only'; end if;
  return query
  with 
  opening as (
    select account_id, sum(debit - credit) as net_val
    from (
      select account_id, debit, credit from public.journal_lines jl join public.journals j on j.id = jl.journal_id where j.journal_date < p_start_date
      union all
      select account_id, debit, credit from public.opening_balances where as_of_date < p_start_date
    ) o group by account_id
  ),
  movements as (
     select jl.account_id, sum(jl.debit) as dry, sum(jl.credit) as cry
     from public.journal_lines jl join public.journals j on j.id = jl.journal_id
     where j.journal_date between p_start_date and p_end_date
     group by jl.account_id
  ),
  movements_ob as (
      select account_id, debit, credit from public.opening_balances
      where as_of_date between p_start_date and p_end_date
  ),
  combined_movements as (
     select account_id, sum(debit) as dry, sum(credit) as cry
     from (select account_id, dry as debit, cry as credit from movements union all select account_id, debit, credit from movements_ob) m
     group by account_id
  )
  select a.id, a.code, a.name, a.account_type::text, coalesce(op.net_val, 0), coalesce(mv.dry, 0), coalesce(mv.cry, 0), (coalesce(op.net_val, 0) + coalesce(mv.dry, 0) - coalesce(mv.cry, 0))
  from public.accounts a
  left join opening op on op.account_id = a.id
  left join combined_movements mv on mv.account_id = a.id
  order by a.code;
end $$;

