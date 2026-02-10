-- ============================================================
-- 0109_add_return_payment_methods.sql
-- Add payment_method_code for returns + use in posting
-- ============================================================

alter table public.sales_returns
  add column if not exists payment_method_code text;

alter table public.purchase_returns
  add column if not exists payment_method_code text;

-- Update RPC: Sales Return (use selected refund method)
create or replace function public.rpc_post_sales_return(p_return_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_ret record; v_sales record; v_ar record; v_total numeric(14,2); v_journal_id uuid; v_line record;
  v_cash_acc_id uuid; v_ar_acc_id uuid; v_ret_acc_id uuid; v_inventory_acc_id uuid; v_rm_inv_acc_id uuid; v_cogs_acc_id uuid;
  v_reduce_ar numeric(14,2); v_refund_cash numeric(14,2);
  v_total_cogs numeric(14,2); v_total_cogs_fg numeric(14,2); v_total_cogs_rm numeric(14,2);
  v_method text;
begin
  select id into v_ar_acc_id from public.accounts where code = '1200';
  select id into v_ret_acc_id from public.accounts where code = '4110';
  select id into v_inventory_acc_id from public.accounts where code = '1300';
  select id into v_rm_inv_acc_id from public.accounts where code = '1310';
  select id into v_cogs_acc_id from public.accounts where code = '5100';

  select * into v_ret from public.sales_returns where id = p_return_id for update;
  if v_ret.status <> 'DRAFT' then raise exception 'Must be DRAFT'; end if;
  if public.is_date_in_closed_period(v_ret.return_date) then raise exception 'Periode CLOSED'; end if;

  select * into v_sales from public.sales where id = v_ret.sales_id;
  if v_sales.status <> 'POSTED' then raise exception 'Sales must be POSTED'; end if;

  v_method := upper(coalesce(v_ret.payment_method_code, v_sales.payment_method_code, 'CASH'));
  select public.get_payment_account_for_method(v_method) into v_cash_acc_id;

  select coalesce(sum(subtotal),0) into v_total from public.sales_return_items where sales_return_id = p_return_id;
  if v_total <= 0 then raise exception 'Total must be > 0'; end if;

  select
    coalesce(sum(ri.qty * coalesce(nullif(ri.cost_snapshot, 0), si.avg_cost_snapshot, i.default_price_buy)), 0)::numeric(14,2),
    coalesce(sum(ri.qty * coalesce(nullif(ri.cost_snapshot, 0), si.avg_cost_snapshot, i.default_price_buy)) filter (where i.type in ('FINISHED_GOOD','TRADED')), 0)::numeric(14,2),
    coalesce(sum(ri.qty * coalesce(nullif(ri.cost_snapshot, 0), si.avg_cost_snapshot, i.default_price_buy)) filter (where i.type = 'RAW_MATERIAL'), 0)::numeric(14,2)
  into v_total_cogs, v_total_cogs_fg, v_total_cogs_rm
  from public.sales_return_items ri
  join public.items i on i.id = ri.item_id
  join public.sales_items si on si.sales_id = v_ret.sales_id and si.item_id = ri.item_id
  where ri.sales_return_id = p_return_id;

  for v_line in select item_id, qty from public.sales_return_items where sales_return_id = p_return_id loop
    perform public.apply_stock_delta(v_line.item_id, v_line.qty);
  end loop;

  update public.sales_returns set status = 'POSTED', total_amount = v_total, updated_at = now() where id = p_return_id;
  v_journal_id := public.create_journal(v_ret.return_date, 'sales_return', p_return_id, 'Return ' || coalesce(v_sales.sales_no,''));

  if v_sales.terms = 'CASH' then
    perform public.add_journal_line(v_journal_id, v_ret_acc_id, v_total, 0, 'Sales Return');
    perform public.add_journal_line(v_journal_id, v_cash_acc_id, 0, v_total, 'Refund');
  else
    select * into v_ar from public.ar_invoices where sales_id = v_sales.id for update;
    if found then
       v_reduce_ar := least(v_ar.outstanding_amount, v_total);
       v_refund_cash := v_total - v_reduce_ar;
       if v_reduce_ar > 0 then
          update public.ar_invoices
          set outstanding_amount = outstanding_amount - v_reduce_ar,
              status = case when (outstanding_amount - v_reduce_ar) = 0 then 'PAID' else 'PARTIAL' end
          where id = v_ar.id;
       end if;
    else
       v_reduce_ar := 0; v_refund_cash := v_total;
    end if;
    perform public.add_journal_line(v_journal_id, v_ret_acc_id, v_total, 0, 'Sales Return');
    if v_reduce_ar > 0 then perform public.add_journal_line(v_journal_id, v_ar_acc_id, 0, v_reduce_ar, 'Reduce AR'); end if;
    if v_refund_cash > 0 then perform public.add_journal_line(v_journal_id, v_cash_acc_id, 0, v_refund_cash, 'Refund'); end if;
  end if;

  if v_total_cogs > 0 then
    if v_total_cogs_fg > 0 then perform public.add_journal_line(v_journal_id, v_inventory_acc_id, v_total_cogs_fg, 0, 'Inventory recovery (FG)'); end if;
    if v_total_cogs_rm > 0 then perform public.add_journal_line(v_journal_id, v_rm_inv_acc_id, v_total_cogs_rm, 0, 'Inventory recovery (RM)'); end if;
    perform public.add_journal_line(v_journal_id, v_cogs_acc_id, 0, v_total_cogs, 'COGS reduction');
  end if;

  return jsonb_build_object('ok', true, 'return_id', p_return_id, 'journal_id', v_journal_id);
end $$;

-- Update RPC: Purchase Return (use selected refund method)
create or replace function public.rpc_post_purchase_return(p_return_id uuid, p_method text default 'CASH')
returns jsonb language plpgsql security definer as $$
declare
  v_ret record; v_pur record; v_ap record; v_total numeric(14,2); v_journal_id uuid; v_line record;
  v_pay_acc uuid; v_inv_acc uuid; v_rm_acc uuid; v_ap_acc uuid;
  v_reduce_ap numeric(14,2) := 0; v_refund_cash numeric(14,2) := 0;
  v_tot_inv_fg numeric(14,2); v_tot_inv_rm numeric(14,2);
  v_method text;
begin
  if not public.is_owner() then raise exception 'Owner only'; end if;

  select * into v_ret from public.purchase_returns where id = p_return_id for update;
  if v_ret.status <> 'DRAFT' then raise exception 'Must be DRAFT'; end if;
  if public.is_date_in_closed_period(v_ret.return_date) then raise exception 'Periode CLOSED'; end if;

  v_method := upper(coalesce(v_ret.payment_method_code, p_method, 'CASH'));
  v_pay_acc := public.get_payment_account_for_method(v_method);
  select id into v_inv_acc from public.accounts where code = '1300';
  select id into v_rm_acc from public.accounts where code = '1310';
  select id into v_ap_acc from public.accounts where code = '2100';

  select * into v_pur from public.purchases where id = v_ret.purchase_id;
  if v_pur.status <> 'POSTED' then raise exception 'Purchase must be POSTED'; end if;

  select coalesce(sum(subtotal), 0),
         coalesce(sum(pr.qty * coalesce(pr.unit_cost, i.default_price_buy)) filter (where i.type in ('FINISHED_GOOD','TRADED')), 0),
         coalesce(sum(pr.qty * coalesce(pr.unit_cost, i.default_price_buy)) filter (where i.type='RAW_MATERIAL'), 0)
  into v_total, v_tot_inv_fg, v_tot_inv_rm
  from public.purchase_return_items pr
  join public.items i on i.id = pr.item_id
  where pr.purchase_return_id = p_return_id;

  if v_total <= 0 then raise exception 'Total > 0 required'; end if;

  for v_line in select item_id, qty from public.purchase_return_items where purchase_return_id = p_return_id loop
    perform public.apply_stock_delta(v_line.item_id, -v_line.qty);
  end loop;

  update public.purchase_returns set status = 'POSTED', total_amount = v_total, updated_at = now() where id = p_return_id;

  if v_pur.terms = 'CASH' then
    v_refund_cash := v_total;
  else
    select * into v_ap from public.ap_bills where purchase_id = v_pur.id for update;
    if found then
      v_reduce_ap := least(v_ap.outstanding_amount, v_total);
      v_refund_cash := v_total - v_reduce_ap;
      update public.ap_bills set
        outstanding_amount = greatest(outstanding_amount - v_reduce_ap, 0),
        status = case when outstanding_amount - v_reduce_ap <= 0 then 'PAID' else 'PARTIAL' end
      where id = v_ap.id;
    else
       v_refund_cash := v_total;
    end if;
  end if;

  v_journal_id := public.create_journal(v_ret.return_date, 'purchase_return', p_return_id, 'Return ' || coalesce(v_pur.purchase_no,''));

  if v_refund_cash > 0 then perform public.add_journal_line(v_journal_id, v_pay_acc, v_refund_cash, 0, 'Vendor refund'); end if;
  if v_reduce_ap > 0 then perform public.add_journal_line(v_journal_id, v_ap_acc, v_reduce_ap, 0, 'Reduce AP'); end if;
  if v_tot_inv_fg > 0 then perform public.add_journal_line(v_journal_id, v_inv_acc, 0, v_tot_inv_fg, 'Inv Return (FG)'); end if;
  if v_tot_inv_rm > 0 then perform public.add_journal_line(v_journal_id, v_rm_acc, 0, v_tot_inv_rm, 'Inv Return (RM)'); end if;

  return jsonb_build_object('ok', true, 'return_id', p_return_id);
end $$;
