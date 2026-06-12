-- ============================================================
-- 0141_hardening_makloon_flow_additional.sql
-- Additional hardening for makloon flow
-- ============================================================

-- 1. Hardening: create_makloon_order - tidak boleh konfirmasi order tanpa item
create or replace function public.rpc_create_makloon_order(
  p_vendor_id uuid,
  p_order_date date,
  p_expected_completion_date date,
  p_notes text,
  p_lines jsonb[],
  p_post boolean
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order_id uuid;
  v_order_no text;
  v_total_jasa numeric(14,2) := 0;
  v_item_count integer;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  -- HARDENING: cek apakah ada item
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'Order harus memiliki minimal 1 item';
  end if;

  -- HARDENING: cek apakah vendor valid
  if not exists (select 1 from public.vendors where id = p_vendor_id) then
    raise exception 'Vendor tidak ditemukan';
  end if;

  -- Generate order number
  select public.generate_tx_doc_no('MAKLOON_ORDER', p_order_date) into v_order_no;

  -- Insert order
  insert into public.makloon_orders (
    vendor_id,
    order_no,
    order_date,
    expected_completion_date,
    notes,
    status,
    total_jasa
  ) values (
    p_vendor_id,
    v_order_no,
    p_order_date,
    p_expected_completion_date,
    p_notes,
    case when p_post then 'ISSUED' else 'DRAFT' end,
    0
  )
  returning id into v_order_id;

  -- Insert order items
  for i in 0..jsonb_array_length(p_lines) - 1 loop
    declare
      line jsonb := p_lines[i];
      item_id uuid;
      uom_snapshot text;
      qty_ordered numeric;
      jasa_per_unit numeric;
      subtotal_jasa numeric;
      item_name text;
    begin
      item_id := (line->>'item_id')::uuid;
      uom_snapshot := line->>'uom_snapshot';
      qty_ordered := (line->>'qty_ordered')::numeric;
      jasa_per_unit := (line->>'jasa_per_unit')::numeric;
      item_name := line->>'item_name';

      -- HARDENING: cek apakah item valid
      if not exists (select 1 from public.items where id = item_id) then
        raise exception 'Item tidak ditemukan: %', item_name;
      end if;

      subtotal_jasa := qty_ordered * jasa_per_unit;
      v_total_jasa := v_total_jasa + subtotal_jasa;

      insert into public.makloon_order_items (
        makloon_order_id,
        item_id,
        uom_snapshot,
        qty_ordered,
        jasa_per_unit,
        subtotal_jasa
      ) values (
        v_order_id,
        item_id,
        uom_snapshot,
        qty_ordered,
        jasa_per_unit,
        subtotal_jasa
      );
    end;
  end loop;

  -- Update total jasa
  update public.makloon_orders
  set total_jasa = v_total_jasa
  where id = v_order_id;

  return jsonb_build_object(
    'id', v_order_id,
    'order_no', v_order_no,
    'success', true
  );
end $$;

-- 2. Hardening: update_makloon_order_status - tidak boleh konfirmasi order tanpa item
create or replace function public.rpc_update_makloon_order_status(p_order_id uuid, p_new_status text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order record;
  v_item_count integer;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select * into v_order
  from public.makloon_orders
  where id = p_order_id;

  if not found then
    raise exception 'Order tidak ditemukan';
  end if;

  -- HARDENING: cek apakah order punya item sebelum konfirmasi
  if p_new_status = 'ISSUED' and v_order.status = 'DRAFT' then
    select count(*) into v_item_count
    from public.makloon_order_items
    where makloon_order_id = p_order_id;

    if v_item_count = 0 then
      raise exception 'Tidak bisa konfirmasi order: order harus memiliki minimal 1 item';
    end if;
  end if;

  -- HARDENING: tidak boleh batalkan order yang sudah ISSUED atau lebih tinggi
  if p_new_status = 'CANCELLED' and v_order.status in ('ISSUED', 'IN_PRODUCTION', 'COMPLETED') then
    raise exception 'Tidak bisa batalkan order: status order sudah %', v_order.status;
  end if;

  update public.makloon_orders
  set status = p_new_status, updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'new_status', p_new_status
  );
end $$;

-- 3. Hardening: create_makloon_issue - tidak boleh post issue tanpa item
create or replace function public.rpc_create_makloon_issue(
  p_makloon_order_id uuid,
  p_issue_date date,
  p_notes text,
  p_lines jsonb[],
  p_post boolean
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_issue_id uuid;
  v_issue_no text;
  v_order record;
  v_item_count integer;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  -- HARDENING: cek apakah order valid
  select * into v_order
  from public.makloon_orders
  where id = p_makloon_order_id;

  if not found then
    raise exception 'Makloon Order tidak ditemukan';
  end if;

  -- HARDENING: cek apakah order sudah dikonfirmasi sebelum kirim bahan
  if v_order.status = 'DRAFT' then
    raise exception 'Tidak bisa kirim bahan: order belum dikonfirmasi';
  end if;

  -- HARDENING: cek apakah ada item
  if jsonb_array_length(p_lines) = 0 then
    raise exception 'Issue harus memiliki minimal 1 item';
  end if;

  -- Generate issue number
  select public.generate_tx_doc_no('MAKLOON_ISSUE', p_issue_date) into v_issue_no;

  -- Insert issue
  insert into public.makloon_material_issues (
    makloon_order_id,
    issue_no,
    issue_date,
    notes,
    status
  ) values (
    p_makloon_order_id,
    v_issue_no,
    p_issue_date,
    p_notes,
    case when p_post then 'POSTED' else 'DRAFT' end
  )
  returning id into v_issue_id;

  -- Insert issue items
  for i in 0..jsonb_array_length(p_lines) - 1 loop
    declare
      line jsonb := p_lines[i];
      item_id uuid;
      item_name text;
      uom_snapshot text;
      qty numeric;
      item_exists boolean;
    begin
      item_id := (line->>'item_id')::uuid;
      item_name := line->>'item_name';
      uom_snapshot := line->>'uom_snapshot';
      qty := (line->>'qty')::numeric;

      -- HARDENING: cek apakah item valid
      select exists (select 1 from public.items where id = item_id) into item_exists;
      if not item_exists then
        raise exception 'Item tidak ditemukan: %', item_name;
      end if;

      insert into public.makloon_issue_items (
        issue_id,
        item_id,
        uom_snapshot,
        qty,
        avg_cost_snapshot,
        subtotal
      ) values (
        v_issue_id,
        item_id,
        uom_snapshot,
        qty,
        0,
        0
      );
    end;
  end loop;

  -- Jika post, update status order menjadi IN_PRODUCTION
  if p_post then
    update public.makloon_orders
    set status = 'IN_PRODUCTION', updated_at = now()
    where id = p_makloon_order_id;
  end if;

  return jsonb_build_object(
    'id', v_issue_id,
    'issue_no', v_issue_no,
    'success', true
  );
end $$;

-- 4. Hardening: rpc_post_makloon_material_issue - tidak boleh post issue tanpa item
create or replace function public.rpc_post_makloon_material_issue(p_issue_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_issue record;
  v_item record;
  v_journal_id uuid;
  v_wip_acc_id uuid;
  v_inv_acc_id uuid;
  v_total_cost numeric(14,2) := 0;
  v_item_count integer;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select * into v_issue
  from public.makloon_material_issues
  where id = p_issue_id;

  if not found then
    raise exception 'Issue tidak ditemukan';
  end if;

  if v_issue.status = 'POSTED' then
    raise exception 'Issue sudah POSTED';
  end if;

  if public.is_date_in_closed_period(v_issue.issue_date) then
    raise exception 'Period sudah CLOSED untuk tanggal ini';
  end if;

  -- HARDENING: cek apakah issue punya item
  select count(*) into v_item_count
  from public.makloon_issue_items
  where issue_id = p_issue_id;

  if v_item_count = 0 then
    raise exception 'Tidak bisa post issue: issue harus memiliki minimal 1 item';
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

  select id into v_inv_acc_id
  from public.accounts
  where code = '1400';

  if not found then
    raise exception 'Akun Persediaan Bahan (1400) tidak ditemukan';
  end if;

  insert into public.journals (journal_date, ref_type, ref_id, memo, created_by)
  values (
    v_issue.issue_date,
    'MAKLOON_ISSUE',
    v_issue.id,
    'Pengiriman bahan Makloon ' || v_issue.issue_no,
    auth.uid()
  )
  returning id into v_journal_id;

  for v_item in
    select ii.*, i.name as item_name
    from public.makloon_issue_items ii
    join public.items i on i.id = ii.item_id
    where ii.issue_id = p_issue_id
  loop
    declare
      v_prev_qty numeric(14,3);
      v_prev_avg numeric(14,4);
      v_new_qty numeric(14,3);
      v_new_avg numeric(14,4);
      v_item_cost numeric(14,2);
    begin
      select qty_on_hand, avg_cost into v_prev_qty, v_prev_avg
      from public.inventory_stock
      where item_id = v_item.item_id;

      v_prev_qty := coalesce(v_prev_qty, 0);
      v_prev_avg := coalesce(v_prev_avg, 0);

      -- HARDENING: cek stok cukup
      if v_prev_qty < v_item.qty then
        raise exception 'Stok tidak cukup untuk item %: tersedia %, dibutuhkan %', v_item.item_name, v_prev_qty, v_item.qty;
      end if;

      v_item_cost := v_item.qty * v_prev_avg;
      v_total_cost := v_total_cost + v_item_cost;

      v_new_qty := v_prev_qty - v_item.qty;
      if v_new_qty > 0 then
        v_new_avg := ((v_prev_qty * v_prev_avg) - v_item_cost) / v_new_qty;
      else
        v_new_avg := 0;
      end if;

      -- Update inventory stock
      insert into public.inventory_stock (item_id, qty_on_hand, avg_cost, updated_at)
      values (v_item.item_id, -v_item.qty, v_prev_avg, now())
      on conflict (item_id) do update
      set qty_on_hand = v_new_qty,
          avg_cost = v_new_avg,
          updated_at = now();

      -- Update issue item with cost snapshot
      update public.makloon_issue_items
      set avg_cost_snapshot = v_prev_avg,
          subtotal = v_item_cost
      where id = v_item.id;

      -- Journal lines
      insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
      values (v_journal_id, v_wip_acc_id, v_item_cost, 0, v_item.item_name || ' (bahan dikirim)');

      insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
      values (v_journal_id, v_inv_acc_id, 0, v_item_cost, v_item.item_name || ' (bahan keluar)');
    end;
  end loop;

  update public.makloon_material_issues
  set status = 'POSTED', updated_at = now()
  where id = p_issue_id;

  update public.makloon_orders
  set status = 'IN_PRODUCTION', updated_at = now()
  where id = v_issue.makloon_order_id;

  return jsonb_build_object(
    'success', true,
    'journal_id', v_journal_id,
    'total_cost', v_total_cost
  );
end $$;