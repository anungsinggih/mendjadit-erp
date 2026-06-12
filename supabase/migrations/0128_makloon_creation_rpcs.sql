-- ============================================================
-- 0128_makloon_creation_rpcs.sql
-- Wrapper RPCs for creating and optionally posting Makloon docs
-- ============================================================

drop function if exists public.create_makloon_issue(uuid, date, text, jsonb, boolean);
drop function if exists public.create_makloon_receipt(uuid, date, text, jsonb, boolean);

-- Create Makloon Material Issue
create or replace function public.create_makloon_issue(
  makloon_order_id uuid,
  issue_date date,
  notes text,
  lines jsonb, -- array of {item_id, qty, uom_snapshot}
  post boolean default false
)
returns jsonb language plpgsql security definer as $$
declare
  v_issue_id uuid;
  v_vendor_id uuid;
  v_line jsonb;
  v_res jsonb;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select vendor_id into v_vendor_id from public.makloon_orders where id = makloon_order_id;
  if not found then raise exception 'Order tidak ditemukan'; end if;

  insert into public.makloon_material_issues (
    makloon_order_id, vendor_id, issue_date, notes, status
  ) values (
    makloon_order_id, v_vendor_id, issue_date, notes, 'DRAFT'
  ) returning id into v_issue_id;

  for v_line in select * from jsonb_array_elements(lines) loop
    insert into public.makloon_issue_items (
      issue_id, item_id, qty, uom_snapshot
    ) values (
      v_issue_id, 
      (v_line->>'item_id')::uuid, 
      (v_line->>'qty')::numeric, 
      v_line->>'uom_snapshot'
    );
  end loop;

  if post then
    v_res := public.rpc_post_makloon_material_issue(v_issue_id);
    
    -- Update order status to IN_PRODUCTION
    update public.makloon_orders
    set status = 'IN_PRODUCTION', updated_at = now()
    where id = makloon_order_id;
  end if;

  return jsonb_build_object('success', true, 'id', v_issue_id);
end $$;

-- Create Makloon Receipt
create or replace function public.create_makloon_receipt(
  makloon_order_id uuid,
  receipt_date date,
  notes text,
  lines jsonb, -- array of {item_id, qty_received, jasa_per_unit, material_cost_per_unit}
  post boolean default false
)
returns jsonb language plpgsql security definer as $$
declare
  v_receipt_id uuid;
  v_vendor_id uuid;
  v_line jsonb;
  v_res jsonb;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select vendor_id into v_vendor_id from public.makloon_orders where id = makloon_order_id;
  if not found then raise exception 'Order tidak ditemukan'; end if;

  insert into public.makloon_receipts (
    makloon_order_id, vendor_id, receipt_date, notes, status, terms
  ) values (
    makloon_order_id, v_vendor_id, receipt_date, notes, 'DRAFT', 'CREDIT'
  ) returning id into v_receipt_id;

  for v_line in select * from jsonb_array_elements(lines) loop
    insert into public.makloon_receipt_items (
      receipt_id, item_id, qty_received, jasa_per_unit, material_cost_per_unit, uom_snapshot, subtotal_jasa
    ) values (
      v_receipt_id, 
      (v_line->>'item_id')::uuid, 
      (v_line->>'qty_received')::numeric, 
      (v_line->>'jasa_per_unit')::numeric, 
      coalesce((v_line->>'material_cost_per_unit')::numeric, 0),
      v_line->>'uom_snapshot',
      ((v_line->>'qty_received')::numeric * (v_line->>'jasa_per_unit')::numeric)
    );
  end loop;

  if post then
    v_res := public.rpc_post_makloon_receipt(v_receipt_id);
  end if;

  return jsonb_build_object('success', true, 'id', v_receipt_id);
end $$;