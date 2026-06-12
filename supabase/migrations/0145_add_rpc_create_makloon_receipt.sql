-- ============================================================
-- 0145_add_rpc_create_makloon_receipt.sql
-- Canonical receipt-create RPC for makloon flow
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
    if coalesce((v_line->>'qty_received')::numeric, 0) <= 0 then
      raise exception 'Qty receipt harus lebih besar dari 0';
    end if;

    if coalesce((v_line->>'jasa_per_unit')::numeric, 0) < 0 then
      raise exception 'Jasa per unit tidak boleh negatif';
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
      (v_line->>'item_id')::uuid,
      (v_line->>'qty_received')::numeric,
      (v_line->>'jasa_per_unit')::numeric,
      coalesce((v_line->>'material_cost_per_unit')::numeric, 0),
      coalesce(nullif(v_line->>'uom_snapshot', ''), 'PCS'),
      round(((v_line->>'qty_received')::numeric * (v_line->>'jasa_per_unit')::numeric), 2)
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
