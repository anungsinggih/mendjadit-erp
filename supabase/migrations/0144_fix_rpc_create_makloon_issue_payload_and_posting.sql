-- ============================================================
-- 0144_fix_rpc_create_makloon_issue_payload_and_posting.sql
-- Fix makloon issue create RPC payload type and posting path
-- ============================================================

drop function if exists public.rpc_create_makloon_issue(uuid, date, text, jsonb[], boolean);

create or replace function public.rpc_create_makloon_issue(
  p_makloon_order_id uuid,
  p_issue_date date,
  p_notes text,
  p_lines jsonb,
  p_post boolean default false
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_issue_id uuid;
  v_issue_no text;
  v_order record;
  v_line jsonb;
  v_item_id uuid;
  v_item_name text;
  v_uom_snapshot text;
  v_qty numeric;
  v_post_result jsonb;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select * into v_order
  from public.makloon_orders
  where id = p_makloon_order_id;

  if not found then
    raise exception 'Makloon Order tidak ditemukan';
  end if;

  if v_order.status = 'DRAFT' then
    raise exception 'Tidak bisa kirim bahan: order belum dikonfirmasi';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Issue harus memiliki minimal 1 item';
  end if;

  select public.generate_tx_doc_no('MAKLOON_ISSUE', p_issue_date) into v_issue_no;

  insert into public.makloon_material_issues (
    makloon_order_id,
    vendor_id,
    issue_no,
    issue_date,
    notes,
    status,
    created_by
  ) values (
    p_makloon_order_id,
    v_order.vendor_id,
    v_issue_no,
    p_issue_date,
    nullif(btrim(coalesce(p_notes, '')), ''),
    'DRAFT',
    auth.uid()
  )
  returning id into v_issue_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item_id := (v_line->>'item_id')::uuid;
    v_item_name := coalesce(v_line->>'item_name', '');
    v_uom_snapshot := coalesce(nullif(v_line->>'uom_snapshot', ''), 'PCS');
    v_qty := coalesce((v_line->>'qty')::numeric, 0);

    if v_item_id is null or not exists (select 1 from public.items where id = v_item_id) then
      raise exception 'Item tidak ditemukan: %', nullif(v_item_name, '');
    end if;

    if v_qty <= 0 then
      raise exception 'Qty issue harus lebih besar dari 0';
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
      v_item_id,
      v_uom_snapshot,
      v_qty,
      0,
      0
    );
  end loop;

  if p_post then
    v_post_result := public.rpc_post_makloon_material_issue(v_issue_id);
  end if;

  return jsonb_build_object(
    'id', v_issue_id,
    'issue_no', v_issue_no,
    'success', true,
    'posted', p_post,
    'post_result', v_post_result
  );
end $$;
