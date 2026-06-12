-- ============================================================
-- 0122_enforce_purchase_supplier_and_cost.sql
-- Purchase engine finalisasi:
--   a) Enforce vendor_type = SUPPLIER for purchases (trigger)
--   b) Enforce all purchase items have unit_cost > 0 (RPC guard)
--   c) Prorate discount into inventory avg cost (balanced journal)
--   d) Ensure journal always balanced (debits = credits)
-- ============================================================

-- Ensure discount account 5200 exists
insert into public.accounts (code, name, is_system_account)
values ('5200', 'Purchase Discount', true)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- a) Enforce vendor_type = SUPPLIER on purchases table
-- ------------------------------------------------------------
create or replace function public.trg_check_purchase_vendor_type()
returns trigger language plpgsql as $$
declare
  v_type text;
begin
  select vendor_type into v_type from public.vendors where id = new.vendor_id;
  if v_type is distinct from 'SUPPLIER' then
    raise exception 'Purchase hanya untuk vendor SUPPLIER (vendor % bertipe %)', new.vendor_id, coalesce(v_type, 'UNKNOWN');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_check_purchase_vendor_type on public.purchases;
create trigger trg_check_purchase_vendor_type
  before insert or update of vendor_id on public.purchases
  for each row execute function public.trg_check_purchase_vendor_type();

-- ------------------------------------------------------------
-- b) Update RPC: balanced journal with discount prorate
-- ------------------------------------------------------------
create or replace function public.rpc_post_purchase(p_purchase_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_purchase record;
  v_items_total numeric(14,2);
  v_total numeric(14,2);
  v_total_fg numeric(14,2);
  v_total_rm numeric(14,2);
  v_total_fg_gross numeric(14,2);
  v_total_rm_gross numeric(14,2);
  v_discount numeric(14,2);
  v_factor numeric(14,6);
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
  v_dp_acc_id uuid;
  v_disc_acc_id uuid;
  v_method text;
  v_dp_total numeric(14,2) := 0;
  v_vendor_type text;
begin
  -- Vendor must be SUPPLIER
  select v.vendor_type into v_vendor_type
  from public.purchases p
  join public.vendors v on v.id = p.vendor_id
  where p.id = p_purchase_id;
  if v_vendor_type is distinct from 'SUPPLIER' then
    raise exception 'Purchase hanya untuk SUPPLIER, vendor bertipe %', coalesce(v_vendor_type, 'UNKNOWN');
  end if;

  select id into v_ap_acc_id from public.accounts where code = '2100';
  select id into v_inventory_acc_id from public.accounts where code = '1300';
  select id into v_rm_inventory_acc_id from public.accounts where code = '1310';
  select id into v_dp_acc_id from public.accounts where code = '1250';
  select id into v_disc_acc_id from public.accounts where code = '5200';

  if v_ap_acc_id is null or v_inventory_acc_id is null or v_rm_inventory_acc_id is null then
    raise exception 'COA Codes missing (2100, 1300, 1310)';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id for update;
  if not found then raise exception 'Purchase not found'; end if;
  if v_purchase.status <> 'DRAFT' then raise exception 'Purchase must be DRAFT'; end if;
  if public.is_date_in_closed_period(v_purchase.purchase_date) then raise exception 'Periode CLOSED'; end if;

  -- Validate: all purchase items must have unit_cost > 0 and subtotal > 0
  if exists (
    select 1 from public.purchase_items
    where purchase_id = p_purchase_id
      and (unit_cost <= 0 or subtotal <= 0)
  ) then
    raise exception 'All purchase items must have unit_cost > 0 and subtotal > 0';
  end if;

  -- Hitung total DP yang sudah dibayar
  if v_dp_acc_id is not null then
    select coalesce(sum(jl.debit), 0) - coalesce(sum(jl.credit), 0)
    into v_dp_total
    from public.journals j
    join public.journal_lines jl on jl.journal_id = j.id
    where j.ref_type = 'PURCHASE_DP'
      and j.ref_id = p_purchase_id
      and jl.account_id = v_dp_acc_id;
  end if;

  -- Hitung subtotal items (sebelum diskon)
  select
    coalesce(sum(pi.subtotal),0),
    coalesce(sum(pi.subtotal) filter (where i.type in ('FINISHED_GOOD','TRADED')),0),
    coalesce(sum(pi.subtotal) filter (where i.type = 'RAW_MATERIAL'),0)
  into v_items_total, v_total_fg, v_total_rm
  from public.purchase_items pi
  join public.items i on i.id = pi.item_id
  where pi.purchase_id = p_purchase_id;

  -- Hitung diskon dan prorate factor
  v_discount := coalesce(v_purchase.discount_amount, 0);
  if v_discount < 0 then v_discount := 0; end if;
  if v_discount > 0 and v_items_total <= 0 then
    raise exception 'Discount cannot be applied to zero total';
  end if;
  if v_discount > v_items_total then
    raise exception 'Discount exceeds total amount';
  end if;

  v_total := v_items_total - v_discount;
  v_total_fg_gross := v_total_fg;
  v_total_rm_gross := v_total_rm;

  if v_items_total > 0 and v_discount > 0 then
    v_factor := v_total / v_items_total;
  else
    v_factor := 1;
  end if;

  -- Apply prorate factor ke inventory valuation (avg cost)
  -- Ini memastikan inventory debit = total yang dibayarkan
  for v_line in
    select pi.item_id, pi.qty, pi.unit_cost, pi.subtotal
    from public.purchase_items pi
    where pi.purchase_id = p_purchase_id
  loop
    perform public.ensure_stock_row(v_line.item_id);
    select qty_on_hand, avg_cost into v_prev_qty, v_prev_avg
    from public.inventory_stock where item_id = v_line.item_id for update;

    v_new_qty := coalesce(v_prev_qty, 0) + v_line.qty;
    if v_new_qty > 0 then
      -- Apply prorate factor ke unit cost
      v_new_avg := (coalesce(v_prev_qty, 0) * coalesce(v_prev_avg, 0) + v_line.qty * (v_line.unit_cost * v_factor)) / v_new_qty;
    else
      v_new_avg := 0;
    end if;
    update public.inventory_stock set avg_cost = v_new_avg where item_id = v_line.item_id;
    perform public.apply_stock_delta(v_line.item_id, v_line.qty);
  end loop;

  -- Recompute totals setelah prorate
  v_total_fg := round(v_total_fg * v_factor, 2);
  v_total_rm := round(v_total_rm * v_factor, 2);

  update public.purchases set status = 'POSTED', total_amount = v_total, updated_at = now() where id = p_purchase_id;
  v_journal_id := public.create_journal(v_purchase.purchase_date, 'purchase', p_purchase_id, 'POST Purchase ' || coalesce(v_purchase.purchase_no, ''));

  if v_purchase.terms = 'CASH' then
    v_method := upper(coalesce(v_purchase.payment_method_code, 'CASH'));
    v_cash_acc_id := public.get_payment_account_for_method(v_method);

    -- DEBIT: Inventory (Gross)
    if v_total_fg_gross > 0 then 
      perform public.add_journal_line(v_journal_id, v_inventory_acc_id, v_total_fg_gross, 0, 'Inventory purchased (FG/Traded) - Gross'); 
    end if;
    if v_total_rm_gross > 0 then 
      perform public.add_journal_line(v_journal_id, v_rm_inventory_acc_id, v_total_rm_gross, 0, 'Inventory purchased (RM) - Gross'); 
    end if;

    -- CREDIT: Discount
    if v_discount > 0 then
      perform public.add_journal_line(v_journal_id, v_disc_acc_id, 0, v_discount, 'Diskon Pembelian');
    end if;

    -- CREDIT: DP, Cash (balance the debits)
    if v_dp_total > 0 then
      if v_dp_total >= v_total then
        perform public.add_journal_line(v_journal_id, v_dp_acc_id, 0, v_total, 'Penyelesaian Uang Muka');
      else
        perform public.add_journal_line(v_journal_id, v_dp_acc_id, 0, v_dp_total, 'Penyelesaian Uang Muka');
        if v_total - v_dp_total > 0 then
          perform public.add_journal_line(v_journal_id, v_cash_acc_id, 0, v_total - v_dp_total, 'Cash paid (Sisa)');
        end if;
      end if;
    else
      perform public.add_journal_line(v_journal_id, v_cash_acc_id, 0, v_total, 'Cash paid');
    end if;

  else
    -- terms CREDIT
    declare
      v_outstanding numeric(14,2) := v_total;
      v_ap_status text := 'UNPAID';
    begin
      if v_dp_total >= v_total then
        v_outstanding := 0;
        v_ap_status := 'PAID';
      elsif v_dp_total > 0 then
        v_outstanding := v_total - v_dp_total;
        v_ap_status := 'PARTIAL';
      end if;

      insert into public.ap_bills(purchase_id, vendor_id, bill_date, total_amount, outstanding_amount, status)
      values (p_purchase_id, v_purchase.vendor_id, v_purchase.purchase_date, v_total, v_outstanding, v_ap_status)
      returning id into v_ap_id;

      -- DEBIT: Inventory (Gross)
      if v_total_fg_gross > 0 then 
        perform public.add_journal_line(v_journal_id, v_inventory_acc_id, v_total_fg_gross, 0, 'Inventory purchased (FG/Traded) - Gross'); 
      end if;
      if v_total_rm_gross > 0 then 
        perform public.add_journal_line(v_journal_id, v_rm_inventory_acc_id, v_total_rm_gross, 0, 'Inventory purchased (RM) - Gross'); 
      end if;

      -- CREDIT: Discount
      if v_discount > 0 then
        perform public.add_journal_line(v_journal_id, v_disc_acc_id, 0, v_discount, 'Diskon Pembelian');
      end if;

      -- CREDIT: DP, AP (balance)
      if v_dp_total > 0 then
        if v_dp_total >= v_total then
          perform public.add_journal_line(v_journal_id, v_dp_acc_id, 0, v_total, 'Penyelesaian Uang Muka');
        else
          perform public.add_journal_line(v_journal_id, v_dp_acc_id, 0, v_dp_total, 'Penyelesaian Uang Muka');
          perform public.add_journal_line(v_journal_id, v_ap_acc_id, 0, v_total - v_dp_total, 'AP created (Sisa)');
        end if;
      else
        perform public.add_journal_line(v_journal_id, v_ap_acc_id, 0, v_total, 'AP created');
      end if;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', p_purchase_id,
    'journal_id', v_journal_id,
    'ap_bill_id', v_ap_id,
    'discount_applied', v_discount > 0,
    'total_before_discount', v_items_total,
    'discount_amount', v_discount,
    'total_after_discount', v_total
  );
end $$;