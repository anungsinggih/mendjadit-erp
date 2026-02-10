-- ============================================================
-- 0114_update_stock_card_view.sql
-- Update view_stock_card to include size_name and color_name
-- ============================================================

drop view if exists public.view_stock_card;

create or replace view public.view_stock_card as
select
  i.id as item_id,
  i.sku,
  i.name as item_name,
  sz.name as size_name,
  cl.name as color_name,
  t.trx_date,
  t.trx_type,
  t.ref_no,
  t.qty_change,
  t.uom,
  t.created_at
from public.items i
left join public.sizes sz on i.size_id = sz.id
left join public.colors cl on i.color_id = cl.id
cross join lateral (
  -- Sales (Decrease)
  select
    s.sales_date as trx_date,
    'SALES' as trx_type,
    s.sales_no as ref_no,
    (si.qty * -1) as qty_change,
    si.uom_snapshot as uom,
    s.created_at
  from public.sales_items si
  join public.sales s on s.id = si.sales_id
  where si.item_id = i.id and s.status = 'POSTED'
 
  union all
 
  -- Purchases (Increase)
  select
    p.purchase_date as trx_date,
    'PURCHASE' as trx_type,
    p.purchase_no as ref_no,
    pi.qty as qty_change,
    pi.uom_snapshot as uom,
    p.created_at
  from public.purchase_items pi
  join public.purchases p on p.id = pi.purchase_id
  where pi.item_id = i.id and p.status = 'POSTED'
 
  union all
 
  -- Sales Returns (Increase)
  select
    r.return_date as trx_date,
    'RETURN_SALES' as trx_type,
    s.sales_no || '-RET' as ref_no, -- or r.return_no
    ri.qty as qty_change,
    ri.uom_snapshot as uom,
    r.created_at
  from public.sales_return_items ri
  join public.sales_returns r on r.id = ri.sales_return_id
  join public.sales s on s.id = r.sales_id
  where ri.item_id = i.id and r.status = 'POSTED'
 
  union all
  
  -- Purchase Returns (Decrease)
  select
    pr.return_date as trx_date,
    'RETURN_PURCHASE' as trx_type,
    p.purchase_no || '-RET' as ref_no, -- or pr.return_no
    (pri.qty * -1) as qty_change,
    pri.uom_snapshot as uom,
    pr.created_at
  from public.purchase_return_items pri
  join public.purchase_returns pr on pr.id = pri.purchase_return_id
  join public.purchases p on p.id = pr.purchase_id
  where pri.item_id = i.id and pr.status = 'POSTED'
 
  union all
 
  -- Adjustments (Delta) + Opening (from opening stock/import)
  select
    a.adjusted_at::date as trx_date,
    case
      when a.reason ilike 'opening%' or a.reason ilike 'import initial stock%' then 'OPENING'
      else 'ADJUSTMENT'
    end as trx_type,
    case
      when a.reason ilike 'opening%' or a.reason ilike 'import initial stock%' then '-'
      else a.reason
    end as ref_no,
    a.qty_delta as qty_change,
    i.uom as uom,
    a.adjusted_at as created_at
  from public.inventory_adjustments a
  where a.item_id = i.id
) t;
