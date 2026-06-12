-- ============================================================
-- 0140_hardening_makloon_flow.sql
-- Hardening makloon flow: validasi receipt hanya bisa dipost jika ada issue bahan
-- ============================================================

create or replace function public.rpc_post_makloon_receipt(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_receipt record;
  v_item record;
  v_bom record;
  v_journal_id uuid;
  v_fg_inv_acc_id uuid;
  v_wip_acc_id uuid;
  v_ap_acc_id uuid;
  v_payment_acc_id uuid;
  v_total_jasa numeric(14,2) := 0;
  v_total_material numeric(14,2) := 0;
  v_total_received_qty numeric(14,3) := 0;
  v_prev_qty numeric(14,3);
  v_prev_avg numeric(14,4);
  v_new_qty numeric(14,3);
  v_new_avg numeric(14,4);
  v_item_total_cost numeric(14,2);
  v_item_material_cost numeric(14,2);
  v_bom_qty numeric(14,4);
  v_bom_material_cost numeric(14,2);
  v_issue_count integer;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select *
  into v_receipt
  from public.makloon_receipts
  where id = p_receipt_id;

  if not found then
    raise exception 'Makloon Receipt tidak ditemukan';
  end if;

  if v_receipt.status = 'POSTED' then
    raise exception 'Makloon Receipt sudah POSTED';
  end if;

  if public.is_date_in_closed_period(v_receipt.receipt_date) then
    raise exception 'Period sudah CLOSED untuk tanggal ini';
  end if;

  if v_receipt.terms = 'CASH' and coalesce(trim(v_receipt.payment_method_code), '') = '' then
    raise exception 'CASH membutuhkan metode pembayaran';
  end if;

  if not exists (
    select 1
    from public.makloon_receipt_items
    where receipt_id = p_receipt_id
  ) then
    raise exception 'Tidak ada item dalam Makloon Receipt ini';
  end if;

  -- HARDENING: cek apakah ada material issue yang sudah POSTED untuk order ini
  select count(*) into v_issue_count
  from public.makloon_material_issues
  where makloon_order_id = v_receipt.makloon_order_id
    and status = 'POSTED';

  if v_issue_count = 0 then
    raise exception 'Tidak bisa post receipt: belum ada Material Issue yang dipost untuk order ini';
  end if;

  select id into v_fg_inv_acc_id
  from public.accounts
  where code = '1300';

  if not found then
    raise exception 'Akun Persediaan Barang Jadi (1300) tidak ditemukan';
  end if;

  select id into v_wip_acc_id
  from public.accounts
  where code = '1320';

  if not found then
    insert into public.accounts (code, name, account_type, is_system_account)
    values ('1320', 'Bahan di Vendor Konveksi', 'ASSET', true)
    on conflict (code) do nothing;

    select id into v_wip_acc_id
    from public.accounts
    where code = '1320';
  end if;

  if v_receipt.terms = 'CASH' then
    select pm.account_id into v_payment_acc_id
    from public.payment_methods pm
    where pm.code = v_receipt.payment_method_code;

    if not found then
      raise exception 'Akun pembayaran tidak ditemukan untuk metode %', v_receipt.payment_method_code;
    end if;
  else
    insert into public.accounts (code, name, account_type, is_system_account)
    values ('2110', 'Hutang Jasa Konveksi', 'LIABILITY', true)
    on conflict (code) do nothing;

    select id into v_ap_acc_id
    from public.accounts
    where code = '2110';
  end if;

  insert into public.journals (journal_date, ref_type, ref_id, memo, created_by)
  values (
    v_receipt.receipt_date,
    'MAKLOON_RECEIPT',
    v_receipt.id,
    'Penerimaan FG Makloon ' || v_receipt.receipt_no,
    auth.uid()
  )
  returning id into v_journal_id;

  select coalesce(sum(qty_received), 0)
  into v_total_received_qty
  from public.makloon_receipt_items
  where receipt_id = p_receipt_id;

  for v_item in
    select ri.*, i.name as item_name, i.uom
    from public.makloon_receipt_items ri
    join public.items i on i.id = ri.item_id
    where ri.receipt_id = p_receipt_id
  loop
    select qty_on_hand, avg_cost
    into v_prev_qty, v_prev_avg
    from public.inventory_stock
    where item_id = v_item.item_id;

    v_prev_qty := coalesce(v_prev_qty, 0);
    v_prev_avg := coalesce(v_prev_avg, 0);

    v_item_material_cost := 0;

    for v_bom in
      select
        ib.raw_material_id,
        ib.qty_per_fg,
        mii.avg_cost_snapshot as material_cost
      from public.item_boms ib
      join public.makloon_material_issues mi
        on mi.makloon_order_id = v_receipt.makloon_order_id
      join public.makloon_issue_items mii
        on mii.issue_id = mi.id
       and mii.item_id = ib.raw_material_id
      where ib.finished_good_id = v_item.item_id
        and mi.status = 'POSTED'
    loop
      v_bom_qty := v_bom.qty_per_fg * v_item.qty_received;
      v_bom_material_cost := coalesce(v_bom.material_cost, 0) * v_bom_qty;
      v_item_material_cost := v_item_material_cost + v_bom_material_cost;
    end loop;

    v_total_material := v_total_material + v_item_material_cost;
    v_item_total_cost := round((v_item.qty_received * v_item.jasa_per_unit) + v_item_material_cost, 2);
    v_total_jasa := v_total_jasa + round(v_item.qty_received * v_item.jasa_per_unit, 2);

    v_new_qty := v_prev_qty + v_item.qty_received;
    if v_new_qty > 0 then
      v_new_avg := ((v_prev_qty * v_prev_avg) + v_item_total_cost) / v_new_qty;
    else
      if v_item.qty_received > 0 then
        v_new_avg := v_item_total_cost / v_item.qty_received;
      else
        v_new_avg := 0;
      end if;
    end if;

    insert into public.inventory_stock (item_id, qty_on_hand, avg_cost, updated_at)
    values (v_item.item_id, v_item.qty_received, v_new_avg, now())
    on conflict (item_id) do update
    set qty_on_hand = v_new_qty,
        avg_cost = v_new_avg,
        updated_at = now();

    insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
    values (v_journal_id, v_fg_inv_acc_id, v_item_total_cost, 0, v_item.item_name || ' (FG masuk)');

    if v_item_material_cost > 0 then
      insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
      values (v_journal_id, v_wip_acc_id, 0, v_item_material_cost, v_item.item_name || ' (bahan)');
    end if;
  end loop;

  if v_total_jasa > 0 then
    if v_receipt.terms = 'CASH' then
      insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
      values (v_journal_id, v_payment_acc_id, 0, v_total_jasa, 'Pembayaran jasa konveksi');
    else
      insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
      values (v_journal_id, v_ap_acc_id, 0, v_total_jasa, 'Hutang jasa konveksi');

      insert into public.makloon_ap_bills (receipt_id, vendor_id, bill_date, total_amount, outstanding_amount, status)
      values (p_receipt_id, v_receipt.vendor_id, v_receipt.receipt_date, v_total_jasa, v_total_jasa, 'UNPAID');
    end if;
  end if;

  update public.makloon_orders
  set status = 'COMPLETED', updated_at = now()
  where id = v_receipt.makloon_order_id;

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