-- ============================================================
-- 0107_fix_reset_testing_data.sql
-- Fix rpc_reset_testing_data deletion order + triggers + return payload
-- ============================================================

create or replace function public.rpc_reset_testing_data(
  p_confirmation_text text,
  p_reset_mode text default 'TRANSACTIONS_ONLY',
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role app_role;
  v_affected_count int := 0;
  v_temp_count int;
  v_env text := lower(coalesce(current_setting('app.environment', true), ''));
  v_now timestamptz := now();
begin
  if v_env in ('production', 'prod') then
    raise exception 'PRODUCTION_BLOCKED: Cannot reset data in production environment.' using hint = 'Set app.environment to non-production for testing reset.';
  end if;

  if p_confirmation_text != 'RESET' then
    raise exception 'CONFIRMATION_FAILED: You must type "RESET" exactly to proceed.' using hint = 'Prevent accidental data loss.';
  end if;

  select role into v_caller_role
  from public.user_profiles
  where id = auth.uid();

  if v_caller_role != 'OWNER' then
    raise exception 'PERMISSION_DENIED: Only OWNER can reset testing data.' using hint = 'Restricted to system administrators.';
  end if;

  -- Disable user triggers on transactional tables (posted immutability)
  alter table public.sales disable trigger user;
  alter table public.sales_items disable trigger user;
  alter table public.sales_returns disable trigger user;
  alter table public.sales_return_items disable trigger user;
  alter table public.purchases disable trigger user;
  alter table public.purchase_items disable trigger user;
  alter table public.purchase_returns disable trigger user;
  alter table public.purchase_return_items disable trigger user;

  if p_reset_mode = 'TRANSACTIONS_ONLY' then
    -- Clear transactional data in FK-safe order
    delete from public.journal_lines where true;
    delete from public.journals where true;

    delete from public.receipts where true;
    delete from public.payments where true;

    delete from public.sales_return_items where true;
    delete from public.sales_returns where true;

    delete from public.purchase_return_items where true;
    delete from public.purchase_returns where true;

    delete from public.sales_items where true;
    delete from public.ar_invoices where true;
    delete from public.sales where true;

    delete from public.purchase_items where true;
    delete from public.ap_bills where true;
    delete from public.purchases where true;

    delete from public.inventory_adjustments where true;
    update public.inventory_stock set qty_on_hand = 0, avg_cost = 0 where true;

    delete from public.period_exports where true;
    delete from public.accounting_periods where true;
    delete from public.opening_balances where true;

    -- Reset payment methods (CASH/BCA/BRI)
    delete from public.payment_methods where true;
    insert into public.accounts (code, name, is_system_account)
    values
      ('1100', 'Kas', true),
      ('1111', 'Bank BCA', true),
      ('1110', 'Bank BRI', true)
    on conflict (code) do update
    set name = excluded.name,
        is_system_account = excluded.is_system_account;

    insert into public.payment_methods (code, name, account_id)
    select 'CASH', 'Kas Tunai', id from public.accounts where code = '1100'
    union all
    select 'BCA', 'Bank BCA', id from public.accounts where code = '1111'
    union all
    select 'BRI', 'Bank BRI', id from public.accounts where code = '1110'
    on conflict (code) do update
    set name = excluded.name,
        account_id = excluded.account_id,
        is_active = true;

    update public.payment_methods set is_active = false where code = 'BANK';

  elsif p_reset_mode = 'FULL' then
    -- Clear transactional data
    delete from public.journal_lines where true;
    delete from public.journals where true;

    delete from public.receipts where true;
    delete from public.payments where true;

    delete from public.sales_return_items where true;
    delete from public.sales_returns where true;

    delete from public.purchase_return_items where true;
    delete from public.purchase_returns where true;

    delete from public.sales_items where true;
    delete from public.ar_invoices where true;
    delete from public.sales where true;

    delete from public.purchase_items where true;
    delete from public.ap_bills where true;
    delete from public.purchases where true;

    delete from public.inventory_adjustments where true;
    delete from public.inventory_stock where true;

    delete from public.period_exports where true;
    delete from public.accounting_periods where true;
    delete from public.opening_balances where true;

    delete from public.customer_item_prices where true;
    delete from public.company_banks where true;

    delete from public.items where true;
    delete from public.customers where true;
    delete from public.vendors where true;

    delete from public.payment_methods where true;

    -- Delete non-system accounts
    delete from public.accounts
    where is_system_account = false
      and code not in ('1100', '1200', '1300', '2100', '4100', '5100', '1110', '1111', '4120', '5200');

    -- Re-seed default payment methods (CASH/BCA/BRI)
    insert into public.accounts (code, name, is_system_account)
    values
      ('1100', 'Kas', true),
      ('1111', 'Bank BCA', true),
      ('1110', 'Bank BRI', true)
    on conflict (code) do update
    set name = excluded.name,
        is_system_account = excluded.is_system_account;

    insert into public.payment_methods (code, name, account_id)
    select 'CASH', 'Kas Tunai', id from public.accounts where code = '1100'
    union all
    select 'BCA', 'Bank BCA', id from public.accounts where code = '1111'
    union all
    select 'BRI', 'Bank BRI', id from public.accounts where code = '1110'
    on conflict (code) do update
    set name = excluded.name,
        account_id = excluded.account_id,
        is_active = true;

    update public.payment_methods set is_active = false where code = 'BANK';

  else
    raise exception 'INVALID_MODE: p_reset_mode must be "TRANSACTIONS_ONLY" or "FULL"';
  end if;

  -- Re-enable triggers
  alter table public.sales enable trigger user;
  alter table public.sales_items enable trigger user;
  alter table public.sales_returns enable trigger user;
  alter table public.sales_return_items enable trigger user;
  alter table public.purchases enable trigger user;
  alter table public.purchase_items enable trigger user;
  alter table public.purchase_returns enable trigger user;
  alter table public.purchase_return_items enable trigger user;

  insert into public.reset_audit_log (reset_by, reset_mode, environment_check, notes)
  values (
    auth.uid(),
    p_reset_mode,
    current_setting('app.environment', true),
    p_notes
  );

  get diagnostics v_temp_count = row_count;
  v_affected_count := v_affected_count + v_temp_count;

  return jsonb_build_object(
    'ok', true,
    'affected', v_affected_count,
    'mode', p_reset_mode,
    'reset_at', v_now
  );
end;
$$;
