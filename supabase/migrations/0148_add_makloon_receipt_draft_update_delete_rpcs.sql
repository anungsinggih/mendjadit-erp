-- ============================================================
-- 0148_add_makloon_receipt_draft_update_delete_rpcs.sql
-- Guarded update/delete RPCs for makloon receipt drafts
-- ============================================================

create or replace function public.rpc_update_makloon_receipt_draft(
  p_receipt_id uuid,
  p_receipt_date date,
  p_notes text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_receipt record;
  v_order record;
  v_line jsonb;
  v_item_id_text text;
  v_item_id uuid;
  v_item_name text;
  v_qty_received numeric;
  v_jasa_per_unit numeric;
  v_material_cost_per_unit numeric;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select * into v_receipt
  from public.makloon_receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'Receipt tidak ditemukan';
  end if;

  if v_receipt.status <> 'DRAFT' then
    raise exception 'Hanya draft receipt yang bisa diedit';
  end if;

  if public.is_date_in_closed_period(v_receipt.receipt_date) or public.is_date_in_closed_period(p_receipt_date) then
    raise exception 'Period sudah CLOSED untuk tanggal ini';
  end if;

  select * into v_order
  from public.makloon_orders
  where id = v_receipt.makloon_order_id;

  if not found then
    raise exception 'Order tidak ditemukan';
  end if;

  if v_order.status <> 'IN_PRODUCTION' then
    raise exception 'Tidak bisa ubah receipt: status order harus IN_PRODUCTION (status sekarang %)', v_order.status;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Receipt harus memiliki minimal 1 item';
  end if;

  update public.makloon_receipts
  set receipt_date = p_receipt_date,
      notes = nullif(btrim(coalesce(p_notes, '')), ''),
      updated_at = now()
  where id = p_receipt_id;

  delete from public.makloon_receipt_items
  where receipt_id = p_receipt_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item_id_text := btrim(coalesce(v_line->>'item_id', ''));
    v_item_name := coalesce(v_line->>'item_name', '');
    v_qty_received := coalesce((v_line->>'qty_received')::numeric, 0);
    v_jasa_per_unit := coalesce((v_line->>'jasa_per_unit')::numeric, 0);
    v_material_cost_per_unit := coalesce((v_line->>'material_cost_per_unit')::numeric, 0);

    if v_item_id_text = '' or v_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Item tidak valid: %', coalesce(nullif(v_item_name, ''), nullif(v_item_id_text, ''), '<kosong>');
    end if;

    v_item_id := v_item_id_text::uuid;

    if not exists (
      select 1
      from public.items
      where id = v_item_id
    ) then
      raise exception 'Item tidak ditemukan: %', coalesce(nullif(v_item_name, ''), v_item_id_text);
    end if;

    if not exists (
      select 1
      from public.makloon_order_items moi
      join public.items i on i.id = moi.item_id
      where moi.makloon_order_id = v_receipt.makloon_order_id
        and moi.item_id = v_item_id
        and i.type = 'FINISHED_GOOD'
    ) then
      raise exception 'Item tidak termasuk FG pada order makloon ini: %', coalesce(nullif(v_item_name, ''), v_item_id_text);
    end if;

    if v_qty_received <= 0 then
      raise exception 'Qty receipt harus lebih besar dari 0';
    end if;

    if v_jasa_per_unit < 0 then
      raise exception 'Jasa per unit tidak boleh negatif';
    end if;

    if v_material_cost_per_unit < 0 then
      raise exception 'Material cost per unit tidak boleh negatif';
    end if;

    insert into public.makloon_receipt_items (
      receipt_id,
      item_id,
      qty_received,
      jasa_per_unit,
      material_cost_per_unit,
      uom_snapshot,
      subtotal_jasa
    ) values (
      p_receipt_id,
      v_item_id,
      v_qty_received,
      v_jasa_per_unit,
      v_material_cost_per_unit,
      coalesce(nullif(v_line->>'uom_snapshot', ''), 'PCS'),
      round(v_qty_received * v_jasa_per_unit, 2)
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'id', p_receipt_id
  );
end $$;

create or replace function public.rpc_delete_makloon_receipt_draft(p_receipt_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_receipt record;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select * into v_receipt
  from public.makloon_receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'Receipt tidak ditemukan';
  end if;

  if v_receipt.status <> 'DRAFT' then
    raise exception 'Hanya draft receipt yang dapat dihapus';
  end if;

  if public.is_date_in_closed_period(v_receipt.receipt_date) then
    raise exception 'Period sudah CLOSED untuk tanggal ini';
  end if;

  delete from public.makloon_receipts
  where id = p_receipt_id;

  return jsonb_build_object(
    'success', true,
    'id', p_receipt_id
  );
end $$;
