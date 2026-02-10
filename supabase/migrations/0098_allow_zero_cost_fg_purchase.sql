-- ============================================================
-- 0098_allow_zero_cost_fg_purchase.sql
-- Allow posting FG purchases with zero total (skip journal/AP)
-- ============================================================

create or replace function public.rpc_post_purchase(p_purchase_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_purchase record;
  v_total numeric(14,2);
  v_total_fg numeric(14,2);
  v_total_rm numeric(14,2);
  v_journal_id uuid;
  v_ap_id uuid;
  v_line record;
  v_prev_qty numeric(14,3);
  v_prev_avg numeric(14,4);
  v_new_qty numeric(14,3);
  v_new_avg numeric(14,4);
  v_cash_acc_id uuid;
  v_ap_acc_id uuid;
  v_inventory_acc_id uuid;
  v_rm_inventory_acc_id uuid;
  v_method text;
  v_non_fg_count int;
  v_costed_count int;
begin
  select id into v_ap_acc_id from public.accounts where code = '2100';
  select id into v_inventory_acc_id from public.accounts where code = '1300';
  select id into v_rm_inventory_acc_id from public.accounts where code = '1310';
  
  if v_ap_acc_id is null or v_inventory_acc_id is null or v_rm_inventory_acc_id is null then
    raise exception 'COA Codes missing (2100, 1300, 1310)';
  end if;
  
  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  if v_purchase.status <> 'DRAFT' then raise exception 'Purchase must be DRAFT'; end if;
  if public.is_date_in_closed_period(v_purchase.purchase_date) then raise exception 'Periode CLOSED'; end if;
  
  select
    coalesce(sum(pi.subtotal),0),
    coalesce(sum(pi.subtotal) filter (where i.type in ('FINISHED_GOOD','TRADED')),0),
    coalesce(sum(pi.subtotal) filter (where i.type = 'RAW_MATERIAL'),0),
    count(*) filter (where i.type <> 'FINISHED_GOOD'),
    count(*) filter (where pi.unit_cost > 0)
  into v_total, v_total_fg, v_total_rm, v_non_fg_count, v_costed_count
  from public.purchase_items pi
  join public.items i on i.id = pi.item_id
  where pi.purchase_id = p_purchase_id;

  if v_total <= 0 then
    -- Allow zero-total only if ALL lines are FINISHED_GOOD with zero cost
    if v_non_fg_count > 0 or v_costed_count > 0 then
      raise exception 'Purchase total must > 0';
    end if;
  end if;

  -- Inventory Increase + Avg Cost
  for v_line in select item_id, qty, unit_cost from public.purchase_items where purchase_id = p_purchase_id loop
    perform public.ensure_stock_row(v_line.item_id);
    select qty_on_hand, avg_cost into v_prev_qty, v_prev_avg from public.inventory_stock where item_id = v_line.item_id for update;
    v_new_qty := coalesce(v_prev_qty, 0) + v_line.qty;
    if v_new_qty > 0 then
      v_new_avg := (coalesce(v_prev_qty, 0) * coalesce(v_prev_avg, 0) + v_line.qty * v_line.unit_cost) / v_new_qty;
    else
      v_new_avg := 0;
    end if;
    update public.inventory_stock set avg_cost = v_new_avg where item_id = v_line.item_id;
    perform public.apply_stock_delta(v_line.item_id, v_line.qty);
  end loop;

  update public.purchases set status = 'POSTED', total_amount = v_total, updated_at = now() where id = p_purchase_id;

  -- Skip journal/AP if total is zero (FG manufactured intake)
  if v_total <= 0 then
    return jsonb_build_object(
      'ok', true,
      'purchase_id', p_purchase_id,
      'journal_id', null,
      'ap_bill_id', null,
      'journal_skipped', true
    );
  end if;

  v_journal_id := public.create_journal(v_purchase.purchase_date, 'purchase', p_purchase_id, 'POST Purchase ' || coalesce(v_purchase.purchase_no, ''));

  if v_purchase.terms = 'CASH' then
    v_method := upper(coalesce(v_purchase.payment_method_code, 'CASH'));
    v_cash_acc_id := public.get_payment_account_for_method(v_method);
    if v_total_fg > 0 then perform public.add_journal_line(v_journal_id, v_inventory_acc_id, v_total_fg, 0, 'Inventory purchased (FG/Traded)'); end if;
    if v_total_rm > 0 then perform public.add_journal_line(v_journal_id, v_rm_inventory_acc_id, v_total_rm, 0, 'Inventory purchased (RM)'); end if;
    perform public.add_journal_line(v_journal_id, v_cash_acc_id, 0, v_total, 'Cash paid');
  else
    insert into public.ap_bills(purchase_id, vendor_id, bill_date, total_amount, outstanding_amount, status)
    values (p_purchase_id, v_purchase.vendor_id, v_purchase.purchase_date, v_total, v_total, 'UNPAID')
    returning id into v_ap_id;
    if v_total_fg > 0 then perform public.add_journal_line(v_journal_id, v_inventory_acc_id, v_total_fg, 0, 'Inventory purchased (FG/Traded)'); end if;
    if v_total_rm > 0 then perform public.add_journal_line(v_journal_id, v_rm_inventory_acc_id, v_total_rm, 0, 'Inventory purchased (RM)'); end if;
    perform public.add_journal_line(v_journal_id, v_ap_acc_id, 0, v_total, 'AP created');
  end if;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', p_purchase_id,
    'journal_id', v_journal_id,
    'ap_bill_id', v_ap_id
  );
end $$;
