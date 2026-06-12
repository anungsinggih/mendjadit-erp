-- Vendor-specific item costs for makloon orders
create table if not exists public.vendor_item_costs (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  cost numeric(14,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_vendor_item_cost_nonneg check (cost >= 0),
  constraint uq_vendor_item_cost unique (vendor_id, item_id)
);

create index if not exists idx_vendor_item_costs_vendor on public.vendor_item_costs(vendor_id);
create index if not exists idx_vendor_item_costs_item on public.vendor_item_costs(item_id);

drop trigger if exists trg_vendor_item_costs_updated_at on public.vendor_item_costs;
create trigger trg_vendor_item_costs_updated_at
before update on public.vendor_item_costs
for each row execute function set_updated_at();