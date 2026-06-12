-- ============================================================
-- 0147_harden_makloon_receipt_create.sql
-- Harden makloon receipt create RPC to match order/issue contract guards
-- ============================================================

create or replace function public.rpc_create_makloon_receipt(
  p_makloon_order_id uuid,
  p_receipt_date date,
  p_notes text,
  p_lines jsonb,
  p_post boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_receipt_id uuid;
  v_order record;
  v_line jsonb;
  v_post_result jsonb;
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

  select * into v_order
  from public.makloon_orders
  where id = p_makloon_order_id;

  if not found then
    raise exception 'Order tidak ditemukan';
  end if;

  if v_order.status <> 'IN_PRODUCTION' then
    raise exception 'Tidak bisa terima FG: status order harus IN_PRODUCTION (status sekarang %)', v_order.status;
  end if;

  if public.is_date_in_closed_period(p_receipt_date) then
    raise exception 'Period sudah CLOSED untuk tanggal ini';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Receipt harus memiliki minimal 1 item';
  end if;

  insert into public.makloon_receipts (
    makloon_order_id,
    vendor_id,
    receipt_date,
    notes,
    status,
    terms,
    created_by
  ) values (
    p_makloon_order_id,
    v_order.vendor_id,
    p_receipt_date,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'DRAFT',
    'CREDIT',
    auth.uid()
  )
  returning id into v_receipt_id;

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
      where moi.makloon_order_id = p_makloon_order_id
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
      v_receipt_id,
      v_item_id,
      v_qty_received,
      v_jasa_per_unit,
      v_material_cost_per_unit,
      coalesce(nullif(v_line->>'uom_snapshot', ''), 'PCS'),
      round(v_qty_received * v_jasa_per_unit, 2)
    );
  end loop;

  if p_post then
    v_post_result := public.rpc_post_makloon_receipt(v_receipt_id);
  end if;

  return jsonb_build_object(
    'success', true,
    'id', v_receipt_id,
    'posted', p_post,
    'post_result', v_post_result
  );
end $$;
