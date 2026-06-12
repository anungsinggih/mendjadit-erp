-- ============================================================
-- 0142_purchase_atomic_drafts_and_return_guards.sql
-- Atomic purchase draft saves + restore purchase return guards
-- ============================================================

create or replace function public.rpc_save_purchase_draft(
  p_purchase_id uuid default null,
  p_vendor_id uuid default null,
  p_purchase_date date default current_date,
  p_terms terms_type default 'CASH',
  p_payment_method_code text default null,
  p_notes text default null,
  p_discount_amount numeric default 0,
  p_items jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer as $$
declare
  v_purchase record;
  v_purchase_id uuid;
  v_items_total numeric(14,2);
  v_total_amount numeric(14,2);
  v_discount numeric(14,2) := greatest(coalesce(p_discount_amount, 0), 0);
  v_method text := nullif(upper(btrim(coalesce(p_payment_method_code, ''))), '');
  v_vendor_type text;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Auth failed: Admin or Owner required';
  end if;

  if p_vendor_id is null then
    raise exception 'Vendor is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Purchase must contain at least one item';
  end if;

  if p_terms = 'CASH' and v_method is null then
    raise exception 'Payment method is required for CASH purchase';
  end if;

  select vendor_type into v_vendor_type
  from public.vendors
  where id = p_vendor_id;

  if not found then
    raise exception 'Vendor not found';
  end if;

  if v_vendor_type is distinct from 'SUPPLIER' then
    raise exception 'Purchase hanya untuk vendor SUPPLIER (vendor bertipe %)', coalesce(v_vendor_type, 'UNKNOWN');
  end if;

  if p_purchase_id is null then
    if public.is_date_in_closed_period(p_purchase_date) then
      raise exception 'Periode CLOSED';
    end if;

    insert into public.purchases (
      vendor_id,
      purchase_date,
      terms,
      status,
      notes,
      total_amount,
      discount_amount,
      payment_method_code,
      created_by
    )
    values (
      p_vendor_id,
      p_purchase_date,
      p_terms,
      'DRAFT',
      nullif(btrim(coalesce(p_notes, '')), ''),
      0,
      v_discount,
      case when p_terms = 'CASH' then v_method else null end,
      auth.uid()
    )
    returning * into v_purchase;
  else
    select * into v_purchase
    from public.purchases
    where id = p_purchase_id
    for update;

    if not found then
      raise exception 'Purchase not found';
    end if;
    if v_purchase.status <> 'DRAFT' then
      raise exception 'Purchase must be DRAFT';
    end if;
    if public.is_date_in_closed_period(v_purchase.purchase_date) or public.is_date_in_closed_period(p_purchase_date) then
      raise exception 'Periode CLOSED';
    end if;

    update public.purchases
    set vendor_id = p_vendor_id,
        purchase_date = p_purchase_date,
        terms = p_terms,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        discount_amount = v_discount,
        payment_method_code = case when p_terms = 'CASH' then v_method else null end,
        updated_at = now()
    where id = p_purchase_id
    returning * into v_purchase;
  end if;

  v_purchase_id := v_purchase.id;

  perform public.rpc_update_purchase_draft_items(v_purchase_id, p_items);

  update public.purchase_items
  set subtotal = round(qty * unit_cost, 2)
  where purchase_id = v_purchase_id;

  if exists (
    select 1
    from public.purchase_items
    where purchase_id = v_purchase_id
      and (qty <= 0 or unit_cost <= 0 or subtotal <= 0)
  ) then
    raise exception 'All purchase items must have unit_cost > 0 and subtotal > 0';
  end if;

  select coalesce(sum(subtotal), 0)
  into v_items_total
  from public.purchase_items
  where purchase_id = v_purchase_id;

  if v_discount > v_items_total then
    raise exception 'Discount exceeds total amount';
  end if;

  v_total_amount := round(v_items_total - v_discount, 2);

  if v_total_amount < 0 then
    raise exception 'Purchase total invalid';
  end if;

  update public.purchases
  set total_amount = v_total_amount,
      discount_amount = v_discount,
      updated_at = now()
  where id = v_purchase_id;

  insert into public.vendor_items (vendor_id, item_id, unit_cost, last_purchase_at, is_active)
  select v_purchase.vendor_id, pi.item_id, pi.unit_cost, v_purchase.purchase_date, true
  from public.purchase_items pi
  where pi.purchase_id = v_purchase_id
  on conflict (vendor_id, item_id)
  do update set
    unit_cost = excluded.unit_cost,
    last_purchase_at = excluded.last_purchase_at,
    is_active = true,
    updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase_id,
    'created', p_purchase_id is null,
    'total_amount', v_total_amount
  );
end $$;

create or replace function public.rpc_save_purchase_return_draft(
  p_return_id uuid default null,
  p_purchase_id uuid default null,
  p_return_date date default current_date,
  p_payment_method_code text default 'CASH',
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer as $$
declare
  v_ret record;
  v_return_id uuid;
  v_total_amount numeric(14,2);
  v_purchase_status doc_status;
  v_method text := coalesce(nullif(upper(btrim(coalesce(p_payment_method_code, ''))), ''), 'CASH');
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Auth failed: Admin or Owner required';
  end if;

  if p_purchase_id is null then
    raise exception 'Original purchase is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Return must contain at least one item';
  end if;

  select status into v_purchase_status
  from public.purchases
  where id = p_purchase_id;

  if not found then
    raise exception 'Purchase not found';
  end if;
  if v_purchase_status <> 'POSTED' then
    raise exception 'Purchase must be POSTED';
  end if;

  if p_return_id is null then
    if public.is_date_in_closed_period(p_return_date) then
      raise exception 'Periode CLOSED';
    end if;

    insert into public.purchase_returns (
      purchase_id,
      return_date,
      status,
      notes,
      total_amount,
      payment_method_code,
      created_by
    )
    values (
      p_purchase_id,
      p_return_date,
      'DRAFT',
      nullif(btrim(coalesce(p_notes, '')), ''),
      0,
      v_method,
      auth.uid()
    )
    returning * into v_ret;
  else
    select * into v_ret
    from public.purchase_returns
    where id = p_return_id
    for update;

    if not found then
      raise exception 'Purchase return not found';
    end if;
    if v_ret.status <> 'DRAFT' then
      raise exception 'Return must be DRAFT';
    end if;
    if public.is_date_in_closed_period(v_ret.return_date) or public.is_date_in_closed_period(p_return_date) then
      raise exception 'Periode CLOSED';
    end if;

    update public.purchase_returns
    set purchase_id = p_purchase_id,
        return_date = p_return_date,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        payment_method_code = v_method,
        updated_at = now()
    where id = p_return_id
    returning * into v_ret;
  end if;

  v_return_id := v_ret.id;

  perform public.rpc_update_purchase_return_draft_items(v_return_id, p_items);

  update public.purchase_return_items
  set subtotal = round(qty * unit_cost, 2)
  where purchase_return_id = v_return_id;

  if exists (
    select 1
    from public.purchase_return_items
    where purchase_return_id = v_return_id
      and (qty <= 0 or unit_cost < 0 or subtotal <= 0)
  ) then
    raise exception 'Return items invalid';
  end if;

  select coalesce(sum(subtotal), 0)
  into v_total_amount
  from public.purchase_return_items
  where purchase_return_id = v_return_id;

  if v_total_amount <= 0 then
    raise exception 'Return total must be > 0';
  end if;

  update public.purchase_returns
  set total_amount = v_total_amount,
      updated_at = now()
  where id = v_return_id;

  return jsonb_build_object(
    'ok', true,
    'return_id', v_return_id,
    'created', p_return_id is null,
    'total_amount', v_total_amount
  );
end $$;

create or replace function public.rpc_post_purchase_return(p_return_id uuid, p_method text default 'CASH')
returns jsonb language plpgsql security definer as $$
declare
  v_ret record;
  v_pur record;
  v_ap record;
  v_total numeric(14,2);
  v_journal_id uuid;
  v_line record;
  v_pay_acc uuid;
  v_inv_acc uuid;
  v_rm_acc uuid;
  v_ap_acc uuid;
  v_reduce_ap numeric(14,2) := 0;
  v_refund_cash numeric(14,2) := 0;
  v_tot_inv_fg numeric(14,2);
  v_tot_inv_rm numeric(14,2);
  v_method text;
  v_bought_qty numeric(14,3);
  v_returned_qty numeric(14,3);
  v_remaining_qty numeric(14,3);
  v_on_hand numeric(14,3);
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Auth failed';
  end if;

  select * into v_ret from public.purchase_returns where id = p_return_id for update;
  if not found then raise exception 'Purchase return not found'; end if;
  if v_ret.status <> 'DRAFT' then raise exception 'Must be DRAFT'; end if;
  if public.is_date_in_closed_period(v_ret.return_date) then raise exception 'Periode CLOSED'; end if;

  v_method := upper(coalesce(v_ret.payment_method_code, nullif(trim(p_method), ''), 'CASH'));
  v_pay_acc := public.get_payment_account_for_method(v_method);
  select id into v_inv_acc from public.accounts where code = '1300';
  select id into v_rm_acc from public.accounts where code = '1310';
  select id into v_ap_acc from public.accounts where code = '2100';

  select * into v_pur from public.purchases where id = v_ret.purchase_id;
  if not found then raise exception 'Purchase not found'; end if;
  if v_pur.status <> 'POSTED' then raise exception 'Purchase must be POSTED'; end if;

  for v_line in
    select item_id, qty
    from public.purchase_return_items
    where purchase_return_id = p_return_id
  loop
    select coalesce(sum(qty),0)
    into v_bought_qty
    from public.purchase_items
    where purchase_id = v_ret.purchase_id
      and item_id = v_line.item_id;

    if v_bought_qty = 0 then
      raise exception 'Item not found in original purchase';
    end if;

    select coalesce(sum(ri.qty),0)
    into v_returned_qty
    from public.purchase_return_items ri
    join public.purchase_returns r on r.id = ri.purchase_return_id
    where r.purchase_id = v_ret.purchase_id
      and r.status = 'POSTED'
      and ri.item_id = v_line.item_id
      and r.id <> p_return_id;

    v_remaining_qty := v_bought_qty - v_returned_qty;
    if v_line.qty > v_remaining_qty then
      raise exception 'Return qty exceeds remaining purchased qty';
    end if;

    perform public.ensure_stock_row(v_line.item_id);
    select qty_on_hand into v_on_hand
    from public.inventory_stock
    where item_id = v_line.item_id
    for update;

    if coalesce(v_on_hand, 0) < v_line.qty then
      raise exception 'Insufficient stock for return';
    end if;
  end loop;

  select coalesce(sum(subtotal), 0),
         coalesce(sum(pr.qty * coalesce(pr.unit_cost, i.default_price_buy)) filter (where i.type in ('FINISHED_GOOD','TRADED')), 0),
         coalesce(sum(pr.qty * coalesce(pr.unit_cost, i.default_price_buy)) filter (where i.type = 'RAW_MATERIAL'), 0)
  into v_total, v_tot_inv_fg, v_tot_inv_rm
  from public.purchase_return_items pr
  join public.items i on i.id = pr.item_id
  where pr.purchase_return_id = p_return_id;

  if v_total <= 0 then raise exception 'Total > 0 required'; end if;

  for v_line in
    select item_id, qty
    from public.purchase_return_items
    where purchase_return_id = p_return_id
  loop
    perform public.apply_stock_delta(v_line.item_id, -v_line.qty);
  end loop;

  update public.purchase_returns
  set status = 'POSTED',
      total_amount = v_total,
      updated_at = now(),
      payment_method_code = v_method
  where id = p_return_id;

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

  return jsonb_build_object('ok', true, 'return_id', p_return_id, 'journal_id', v_journal_id);
end $$;
