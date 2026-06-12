-- ============================================================
-- 0124_makloon_orders.sql
-- Makloon Module: Work Order ke Vendor Konveksi
-- Makloon = bahan dari owner, vendor konveksi yang mengerjakan
-- ============================================================

-- Makloon Order (PO ke vendor konveksi)
create table if not exists public.makloon_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  order_date date not null default current_date,
  expected_completion_date date,
  status text not null default 'DRAFT',
  notes text,
  total_jasa numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint ck_makloon_order_status check (status in ('DRAFT','ISSUED','IN_PRODUCTION','COMPLETED','CANCELLED')),
  constraint ck_makloon_order_total_nonneg check (total_jasa >= 0)
);

create index if not exists idx_makloon_orders_vendor on public.makloon_orders(vendor_id);
create index if not exists idx_makloon_orders_date on public.makloon_orders(order_date desc);
create index if not exists idx_makloon_orders_status on public.makloon_orders(status);

create trigger trg_makloon_orders_updated_at
  before update on public.makloon_orders
  for each row execute function set_updated_at();

-- Auto-number trigger
create or replace function public.set_makloon_order_document_number()
returns trigger language plpgsql as $$
begin
  if coalesce(trim(new.order_no), '') = '' then
    new.order_no := public.generate_tx_doc_no('MKL', now());
  end if;
  return new;
end $$;

create trigger trg_makloon_orders_auto_no
  before insert on public.makloon_orders
  for each row execute function public.set_makloon_order_document_number();

-- Makloon Order Items (FG yang ingin diproduksi + biaya jasa per unit)
create table if not exists public.makloon_order_items (
  id uuid primary key default gen_random_uuid(),
  makloon_order_id uuid not null references public.makloon_orders(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  uom_snapshot text not null,
  qty_ordered numeric(14,3) not null,
  jasa_per_unit numeric(14,2) not null default 0,
  subtotal_jasa numeric(14,2) not null default 0,
  constraint ck_makloon_order_item_nonneg check (qty_ordered > 0 and jasa_per_unit >= 0 and subtotal_jasa >= 0)
);

create index if not exists idx_makloon_order_items_order on public.makloon_order_items(makloon_order_id);
create index if not exists idx_makloon_order_items_item on public.makloon_order_items(item_id);

-- Enforce vendor must be KONVEKSI or INTERNAL
create or replace function public.trg_check_makloon_vendor_type()
returns trigger language plpgsql as $$
declare
  v_type text;
begin
  select vendor_type into v_type from public.vendors where id = new.vendor_id;
  if v_type not in ('KONVEKSI', 'INTERNAL') then
    raise exception 'Makloon Order hanya untuk vendor KONVEKSI atau INTERNAL, vendor ini bertipe %', coalesce(v_type, 'UNKNOWN');
  end if;
  return new;
end $$;

create trigger trg_makloon_order_vendor_type
  before insert or update of vendor_id on public.makloon_orders
  for each row execute function public.trg_check_makloon_vendor_type();

-- RLS
alter table public.makloon_orders enable row level security;
alter table public.makloon_order_items enable row level security;

drop policy if exists "makloon_orders_rw" on public.makloon_orders;
create policy "makloon_orders_rw" on public.makloon_orders
  for all to authenticated
  using (public.is_admin() or public.is_owner())
  with check (public.is_admin() or public.is_owner());

drop policy if exists "makloon_order_items_rw" on public.makloon_order_items;
create policy "makloon_order_items_rw" on public.makloon_order_items
  for all to authenticated
  using (public.is_admin() or public.is_owner())
  with check (public.is_admin() or public.is_owner());