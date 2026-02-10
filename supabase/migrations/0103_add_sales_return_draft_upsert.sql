-- ============================================================
-- 0103_add_sales_return_draft_upsert.sql
-- Update sales return draft items with dedupe + upsert
-- ============================================================

create or replace function public.rpc_update_sales_return_draft_items(
  p_return_id uuid,
  p_items jsonb
)
returns jsonb language plpgsql security definer as $$
declare
  v_ret record;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Auth failed: Admin or Owner required';
  end if;

  select * into v_ret from public.sales_returns where id = p_return_id for update;
  if not found then raise exception 'Sales return not found'; end if;
  if v_ret.status <> 'DRAFT' then raise exception 'Return must be DRAFT to update items'; end if;
  if public.is_date_in_closed_period(v_ret.return_date) then raise exception 'Periode CLOSED'; end if;

  delete from public.sales_return_items where sales_return_id = p_return_id;

  if jsonb_array_length(p_items) > 0 then
    with raw as (
      select
        (item->>'item_id')::uuid as item_id,
        nullif(item->>'uom_snapshot','') as uom_snapshot_raw,
        nullif(item->>'uom','') as uom_fallback,
        (item->>'qty')::numeric as qty,
        (item->>'unit_price')::numeric as unit_price,
        (item->>'cost_snapshot')::numeric as cost_snapshot,
        (item->>'subtotal')::numeric as subtotal
      from jsonb_array_elements(p_items) as item
    ),
    enriched as (
      select
        r.item_id,
        coalesce(r.uom_snapshot_raw, r.uom_fallback, i.uom) as uom_snapshot,
        r.qty,
        r.unit_price,
        r.cost_snapshot,
        r.subtotal
      from raw r
      left join public.items i on i.id = r.item_id
    ),
    merged as (
      select
        item_id,
        unit_price,
        uom_snapshot,
        cost_snapshot,
        sum(qty) as qty,
        sum(subtotal) as subtotal
      from enriched
      group by item_id, unit_price, uom_snapshot, cost_snapshot
    )
    insert into public.sales_return_items (sales_return_id, item_id, qty, unit_price, subtotal, uom_snapshot, cost_snapshot)
    select p_return_id, item_id, qty, unit_price, subtotal, uom_snapshot, cost_snapshot
    from merged
    on conflict (sales_return_id, item_id, unit_price, uom_snapshot, cost_snapshot)
    do update set
      qty = excluded.qty,
      subtotal = excluded.subtotal,
      unit_price = excluded.unit_price,
      uom_snapshot = excluded.uom_snapshot,
      cost_snapshot = excluded.cost_snapshot;
  end if;

  return jsonb_build_object('ok', true);
end $$;
