-- ============================================================
-- 0096_add_unique_line_item_constraints.sql
-- Deduplicate line items and enforce unique composite keys
-- ============================================================

-- SALES ITEMS: dedupe by (sales_id, item_id, unit_price, uom_snapshot)
alter table public.sales_items disable trigger user;
with ranked as (
  select
    id,
    sales_id,
    item_id,
    unit_price,
    uom_snapshot,
    avg_cost_snapshot,
    qty,
    subtotal,
    row_number() over (
      partition by sales_id, item_id, unit_price, uom_snapshot
      order by id
    ) as rn,
    sum(qty) over (
      partition by sales_id, item_id, unit_price, uom_snapshot
    ) as total_qty,
    sum(subtotal) over (
      partition by sales_id, item_id, unit_price, uom_snapshot
    ) as total_subtotal,
    sum(qty * avg_cost_snapshot) over (
      partition by sales_id, item_id, unit_price, uom_snapshot
    ) as total_cost_qty
  from public.sales_items
)
update public.sales_items si
set
  qty = r.total_qty,
  subtotal = r.total_subtotal,
  avg_cost_snapshot = case
    when r.total_qty > 0 then r.total_cost_qty / r.total_qty
    else si.avg_cost_snapshot
  end
from ranked r
where si.id = r.id and r.rn = 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by sales_id, item_id, unit_price, uom_snapshot
      order by id
    ) as rn
  from public.sales_items
)
delete from public.sales_items
where id in (select id from ranked where rn > 1);

alter table public.sales_items
  drop constraint if exists uq_sales_items_line;

alter table public.sales_items
  add constraint uq_sales_items_line
  unique (sales_id, item_id, unit_price, uom_snapshot);
alter table public.sales_items enable trigger user;


-- PURCHASE ITEMS: dedupe by (purchase_id, item_id, unit_cost, uom_snapshot)
alter table public.purchase_items disable trigger user;
with ranked as (
  select
    id,
    purchase_id,
    item_id,
    unit_cost,
    uom_snapshot,
    qty,
    subtotal,
    row_number() over (
      partition by purchase_id, item_id, unit_cost, uom_snapshot
      order by id
    ) as rn,
    sum(qty) over (
      partition by purchase_id, item_id, unit_cost, uom_snapshot
    ) as total_qty,
    sum(subtotal) over (
      partition by purchase_id, item_id, unit_cost, uom_snapshot
    ) as total_subtotal
  from public.purchase_items
)
update public.purchase_items pi
set
  qty = r.total_qty,
  subtotal = r.total_subtotal
from ranked r
where pi.id = r.id and r.rn = 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by purchase_id, item_id, unit_cost, uom_snapshot
      order by id
    ) as rn
  from public.purchase_items
)
delete from public.purchase_items
where id in (select id from ranked where rn > 1);

alter table public.purchase_items
  drop constraint if exists uq_purchase_items_line;

alter table public.purchase_items
  add constraint uq_purchase_items_line
  unique (purchase_id, item_id, unit_cost, uom_snapshot);
alter table public.purchase_items enable trigger user;


-- SALES RETURN ITEMS: dedupe by (sales_return_id, item_id, unit_price, uom_snapshot, cost_snapshot)
alter table public.sales_return_items disable trigger user;
with ranked as (
  select
    id,
    sales_return_id,
    item_id,
    unit_price,
    uom_snapshot,
    cost_snapshot,
    qty,
    subtotal,
    row_number() over (
      partition by sales_return_id, item_id, unit_price, uom_snapshot, cost_snapshot
      order by id
    ) as rn,
    sum(qty) over (
      partition by sales_return_id, item_id, unit_price, uom_snapshot, cost_snapshot
    ) as total_qty,
    sum(subtotal) over (
      partition by sales_return_id, item_id, unit_price, uom_snapshot, cost_snapshot
    ) as total_subtotal
  from public.sales_return_items
)
update public.sales_return_items sri
set
  qty = r.total_qty,
  subtotal = r.total_subtotal
from ranked r
where sri.id = r.id and r.rn = 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by sales_return_id, item_id, unit_price, uom_snapshot, cost_snapshot
      order by id
    ) as rn
  from public.sales_return_items
)
delete from public.sales_return_items
where id in (select id from ranked where rn > 1);

alter table public.sales_return_items
  drop constraint if exists uq_sales_return_items_line;

alter table public.sales_return_items
  add constraint uq_sales_return_items_line
  unique (sales_return_id, item_id, unit_price, uom_snapshot, cost_snapshot);
alter table public.sales_return_items enable trigger user;


-- PURCHASE RETURN ITEMS: dedupe by (purchase_return_id, item_id, unit_cost, uom_snapshot)
alter table public.purchase_return_items disable trigger user;
with ranked as (
  select
    id,
    purchase_return_id,
    item_id,
    unit_cost,
    uom_snapshot,
    qty,
    subtotal,
    row_number() over (
      partition by purchase_return_id, item_id, unit_cost, uom_snapshot
      order by id
    ) as rn,
    sum(qty) over (
      partition by purchase_return_id, item_id, unit_cost, uom_snapshot
    ) as total_qty,
    sum(subtotal) over (
      partition by purchase_return_id, item_id, unit_cost, uom_snapshot
    ) as total_subtotal
  from public.purchase_return_items
)
update public.purchase_return_items pri
set
  qty = r.total_qty,
  subtotal = r.total_subtotal
from ranked r
where pri.id = r.id and r.rn = 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by purchase_return_id, item_id, unit_cost, uom_snapshot
      order by id
    ) as rn
  from public.purchase_return_items
)
delete from public.purchase_return_items
where id in (select id from ranked where rn > 1);

alter table public.purchase_return_items
  drop constraint if exists uq_purchase_return_items_line;

alter table public.purchase_return_items
  add constraint uq_purchase_return_items_line
  unique (purchase_return_id, item_id, unit_cost, uom_snapshot);
alter table public.purchase_return_items enable trigger user;
