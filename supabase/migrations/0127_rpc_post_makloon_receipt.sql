-- ============================================================
-- 0127_rpc_post_makloon_receipt.sql
-- Makloon Module: RPC Posting Penerimaan FG
--
-- Journal Logic:
-- CASH:
--   Dr FG Inventory  (HPP bahan + jasa)
--   Cr WIP/Bahan di Konveksi  (bahan kembali sebagai FG)
--   Cr Cash/Bank  (jasa dibayar tunai)
--
-- CREDIT:
--   Dr FG Inventory  (HPP bahan + jasa)
--   Cr WIP/Bahan di Konveksi  (bahan kembali sebagai FG)
--   Cr AP Jasa Konveksi  (hutang jasa ke vendor)
-- ============================================================

create or replace function public.rpc_post_makloon_receipt(p_receipt_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_receipt record;
  v_item record;
  v_inventory record;
  v_journal_id uuid;
  v_fg_inv_acc_id uuid;
  v_wip_acc_id uuid;
  v_cash_acc_id uuid;
  v_ap_acc_id uuid;
  v_payment_acc_id uuid;
  v_total_jasa numeric(14,2) := 0;
  v_total_material numeric(14,2) := 0;
  v_prev_qty numeric(14,3);
  v_prev_avg numeric(14,4);
  v_new_qty numeric(14,3);
  v_new_avg numeric(14,4);
  v_item_total_cost numeric(14,2);
  v_item_material_cost numeric(14,2);
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select * into v_receipt from public.makloon_receipts where id = p_receipt_id;
  if not found then raise exception 'Makloon Receipt tidak ditemukan'; end if;
  if v_receipt.status = 'POSTED' then raise exception 'Makloon Receipt sudah POSTED'; end if;
  if public.is_date_in_closed_period(v_receipt.receipt_date) then
    raise exception 'Period sudah CLOSED untuk tanggal ini';
  end if;
  if v_receipt.terms = 'CASH' and coalesce(trim(v_receipt.payment_method_code), '') = '' then
    raise exception 'CASH membutuhkan metode pembayaran';
  end if;

  -- Validate items exist
  if not exists (select 1 from public.makloon_receipt_items where receipt_id = p_receipt_id) then
    raise exception 'Tidak ada item dalam Makloon Receipt ini';
  end if;

  -- Get required accounts
  select id into v_fg_inv_acc_id from public.accounts where code = '1300'; -- FG Inventory
  if not found then raise exception 'Akun Persediaan Barang Jadi (1300) tidak ditemukan'; end if;

  select id into v_wip_acc_id from public.accounts where code = '1320'; -- WIP / Bahan di Konveksi
  if not found then raise exception 'Akun Bahan di Vendor Konveksi (1320) tidak ditemukan'; end if;

  if v_receipt.terms = 'CASH' then
    select pm.account_id into v_payment_acc_id
    from public.payment_methods pm
    where pm.code = v_receipt.payment_method_code;
    if not found then raise exception 'Akun pembayaran tidak ditemukan untuk metode %', v_receipt.payment_method_code; end if;
  else
    -- CREDIT: use AP konveksi account
    insert into public.accounts (code, name, account_type, is_system_account)
    values ('2110', 'Hutang Jasa Konveksi', 'LIABILITY', true)
    on conflict (code) do nothing;
    select id into v_ap_acc_id from public.accounts where code = '2110';
  end if;

  -- Create journal header
  insert into public.journals (journal_date, ref_type, ref_id, memo, created_by)
  values (
    v_receipt.receipt_date,
    'MAKLOON_RECEIPT',
    v_receipt.id,
    'Penerimaan FG Makloon ' || v_receipt.receipt_no,
    auth.uid()
  ) returning id into v_journal_id;

  -- Get total material cost from posted issues for this order
  select coalesce(sum(mi.qty * mi.material_cost_per_unit), 0) into v_total_material
  from public.makloon_issues mi
  where mi.makloon_order_id = v_receipt.makloon_order_id
    and mi.status = 'POSTED';

  -- Process each FG item received
  for v_item in
    select ri.*, i.name as item_name, i.uom
    from public.makloon_receipt_items ri
    join public.items i on i.id = ri.item_id
    where ri.receipt_id = p_receipt_id
  loop
    -- Get current FG avg cost
    select qty_on_hand, avg_cost into v_prev_qty, v_prev_avg
    from public.inventory_stock
    where item_id = v_item.item_id;

    v_prev_qty := coalesce(v_prev_qty, 0);
    v_prev_avg := coalesce(v_prev_avg, 0);

    -- Allocate material cost proportionally to FG items
    -- If no material cost from issues, use 0 (jasa only)
    v_item_material_cost := 0;
    if v_total_material > 0 then
      -- Get total qty FG received in this receipt
      select coalesce(sum(qty_received), 0) into v_new_qty
      from public.makloon_receipt_items
      where receipt_id = p_receipt_id;

      if v_new_qty > 0 then
        -- Allocate material cost proportionally
        v_item_material_cost := (v_item.qty_received / v_new_qty) * v_total_material;
      end if;
    end if;

    -- Total cost per unit = jasa + allocated material cost
    v_item_total_cost := v_item.qty_received * v_item.jasa_per_unit + v_item_material_cost;
    v_total_jasa := v_total_jasa + (v_item.qty_received * v_item.jasa_per_unit);

    -- Update FG avg cost using weighted average
    v_new_qty := v_prev_qty + v_item.qty_received;
    if v_new_qty > 0 then
      v_new_avg := ((v_prev_qty * v_prev_avg) + v_item_total_cost) / v_new_qty;
    else
      v_new_avg := v_item.jasa_per_unit + v_item.material_cost_per_unit;
    end if;

    -- Update FG inventory
    insert into public.inventory_stock (item_id, qty_on_hand, avg_cost, updated_at)
    values (v_item.item_id, v_item.qty_received, v_new_avg, now())
    on conflict (item_id) do update
    set qty_on_hand = v_new_qty,
        avg_cost = v_new_avg,
        updated_at = now();

    -- Journal: Dr FG Inventory
    insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
    values (v_journal_id, v_fg_inv_acc_id, v_item_total_cost, 0, v_item.item_name || ' (FG masuk)');

    -- Journal: Cr WIP — bahan kembali sebagai FG (nilai bahan)
    insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
    values (v_journal_id, v_wip_acc_id, 0, v_item_material_cost, v_item.item_name || ' (bahan)');
  end loop;

  -- Journal: Cr Cash/Bank atau AP (untuk jasa konveksi)
  if v_total_jasa > 0 then
    if v_receipt.terms = 'CASH' then
      insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
      values (v_journal_id, v_payment_acc_id, 0, v_total_jasa, 'Pembayaran jasa konveksi');
    else
      insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
      values (v_journal_id, v_ap_acc_id, 0, v_total_jasa, 'Hutang jasa konveksi');

      -- Create AP bill
      insert into public.makloon_ap_bills (receipt_id, vendor_id, bill_date, total_amount, outstanding_amount, status)
      values (p_receipt_id, v_receipt.vendor_id, v_receipt.receipt_date, v_total_jasa, v_total_jasa, 'UNPAID');
    end if;
  end if;

  -- Update makloon_orders status to COMPLETED
  update public.makloon_orders
  set status = 'COMPLETED', updated_at = now()
  where id = v_receipt.makloon_order_id;

  -- Mark receipt POSTED
  update public.makloon_receipts
  set status = 'POSTED', total_jasa = v_total_jasa, updated_at = now()
  where id = p_receipt_id;

  return jsonb_build_object(
    'success', true,
    'journal_id', v_journal_id,
    'total_jasa', v_total_jasa,
    'total_material', v_total_material
  );
end $$;