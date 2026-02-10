-- ============================================================
-- 0099_fix_sales_draft_dedupe.sql
-- Dedupe draft items before insert to satisfy unique constraint
-- ============================================================

create or replace function public.rpc_update_sales_draft_items(
  p_sales_id uuid,
  p_items jsonb
)
returns jsonb language plpgsql security definer as $$
declare
  v_sale record;
begin
  -- 1. Auth Check
  if not (public.is_admin() or public.is_owner()) then 
    raise exception 'Auth failed: Admin or Owner required'; 
  end if;

  -- 2. Validate Sales Header
  select * into v_sale from public.sales where id = p_sales_id for update;
  if not found then raise exception 'Sales not found'; end if;
  if v_sale.status <> 'DRAFT' then raise exception 'Sales must be DRAFT to update items'; end if;
  if public.is_date_in_closed_period(v_sale.sales_date) then raise exception 'Periode CLOSED'; end if;

  -- 3. Delete Existing Items
  delete from public.sales_items where sales_id = p_sales_id;

  -- 4. Insert New Items (dedup by item_id+unit_price+uom_snapshot)
  if jsonb_array_length(p_items) > 0 then
    with raw as (
      select
        (item->>'item_id')::uuid as item_id,
        nullif(item->>'uom_snapshot','') as uom_snapshot_raw,
        nullif(item->>'uom','') as uom_fallback,
        (item->>'qty')::numeric as qty,
        (item->>'unit_price')::numeric as unit_price,
        (item->>'subtotal')::numeric as subtotal
      from jsonb_array_elements(p_items) as item
    ),
    enriched as (
      select
        r.item_id,
        coalesce(r.uom_snapshot_raw, r.uom_fallback, i.uom) as uom_snapshot,
        r.qty,
        r.unit_price,
        r.subtotal
      from raw r
      left join public.items i on i.id = r.item_id
    ),
    merged as (
      select
        item_id,
        unit_price,
        uom_snapshot,
        sum(qty) as qty,
        sum(subtotal) as subtotal
      from enriched
      group by item_id, unit_price, uom_snapshot
    )
    insert into public.sales_items (sales_id, item_id, qty, unit_price, subtotal, uom_snapshot)
    select p_sales_id, item_id, qty, unit_price, subtotal, uom_snapshot
    from merged;
  end if;

  -- 5. Return success
  return jsonb_build_object('ok', true);
end $$;
