-- ============================================================
-- 0106_fix_cashflow_include_banks.sql
-- Cashflow should include cash + bank accounts and opening_balances
-- ============================================================

create or replace function public.rpc_get_cashflow(p_start_date date, p_end_date date)
returns table (category text, description text, amount numeric(14,2))
language plpgsql security definer as $$
declare
  v_account_ids uuid[];
  v_opening_ob numeric(14,2);
  v_opening_jr numeric(14,2);
  v_receipts_total numeric(14,2);
  v_payments_total numeric(14,2);
  v_closing_cash numeric(14,2);
begin
  if not public.is_owner() then raise exception 'Owner only'; end if;

  -- Use active payment method accounts + always include Cash (1100) if present
  select array_agg(distinct account_id)
    into v_account_ids
  from public.payment_methods
  where is_active = true and account_id is not null;

  select array_agg(distinct id)
    into v_account_ids
  from public.accounts
  where (id = any(coalesce(v_account_ids, '{}'))) or code = '1100';

  if v_account_ids is null or array_length(v_account_ids, 1) is null then
    raise exception 'Cash/Bank accounts missing';
  end if;

  -- Opening from opening_balances (before period)
  select coalesce(sum(debit - credit), 0)
    into v_opening_ob
  from public.opening_balances
  where account_id = any(v_account_ids) and as_of_date < p_start_date;

  -- Opening from journals (before period)
  select coalesce(sum(case when jl.debit > 0 then jl.debit else -jl.credit end), 0)
    into v_opening_jr
  from public.journal_lines jl
  join public.journals j on j.id = jl.journal_id
  where jl.account_id = any(v_account_ids) and j.journal_date < p_start_date;

  -- Period receipts/payments (exclude pure cash<->bank internal transfers)
  with internal_journals as (
    select journal_id
    from public.journal_lines
    group by journal_id
    having bool_and(account_id = any(v_account_ids))
  )
  select coalesce(sum(jl.debit), 0)
    into v_receipts_total
  from public.journal_lines jl
  join public.journals j on j.id = jl.journal_id
  where jl.account_id = any(v_account_ids)
    and j.journal_date between p_start_date and p_end_date
    and jl.debit > 0
    and jl.journal_id not in (select journal_id from internal_journals);

  with internal_journals as (
    select journal_id
    from public.journal_lines
    group by journal_id
    having bool_and(account_id = any(v_account_ids))
  )
  select coalesce(sum(jl.credit), 0)
    into v_payments_total
  from public.journal_lines jl
  join public.journals j on j.id = jl.journal_id
  where jl.account_id = any(v_account_ids)
    and j.journal_date between p_start_date and p_end_date
    and jl.credit > 0
    and jl.journal_id not in (select journal_id from internal_journals);

  v_closing_cash := (v_opening_ob + v_opening_jr) + v_receipts_total - v_payments_total;

  return query
  select 'Opening'::text, 'Cash & Bank at beginning'::text, (v_opening_ob + v_opening_jr)
  union all
  select 'Inflow'::text, 'Total cash/bank receipts'::text, v_receipts_total
  union all
  select 'Outflow'::text, 'Total cash/bank payments'::text, -v_payments_total
  union all
  select 'Closing'::text, 'Cash & Bank at end'::text, v_closing_cash;
end $$;
