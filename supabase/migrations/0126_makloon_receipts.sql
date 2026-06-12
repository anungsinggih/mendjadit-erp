-- ============================================================
-- 0126_makloon_receipts.sql
-- Makloon Module: Penerimaan Hasil Produksi (FG) dari Vendor Konveksi
-- FG masuk ke gudang, biaya jasa konveksi diakui sebagai HPP/AP
-- ============================================================

-- Makloon Receipt (dokumen penerimaan FG hasil produksi)
create table if not exists public.makloon_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text unique,
  makloon_order_id uuid not null references public.makloon_orders(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  receipt_date date not null default current_date,
  terms text not null default 'CASH',
  payment_method_code text references public.payment_methods(code) on delete set null,
  status text not null default 'DRAFT',
  notes text,
  total_jasa numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint ck_makloon_receipt_status check (status in ('DRAFT','POSTED')),
  constraint ck_makloon_receipt_terms check (terms in ('CASH','CREDIT')),
  constraint ck_makloon_receipt_total_nonneg check (total_jasa >= 0)
);

create index if not exists idx_makloon_receipts_order on public.makloon_receipts(makloon_order_id);
create index if not exists idx_makloon_receipts_vendor on public.makloon_receipts(vendor_id);
create index if not exists idx_makloon_receipts_date on public.makloon_receipts(receipt_date desc);
create index if not exists idx_makloon_receipts_status on public.makloon_receipts(status);

create trigger trg_makloon_receipts_updated_at
  before update on public.makloon_receipts
  for each row execute function set_updated_at();

-- Auto-number
create or replace function public.set_makloon_receipt_document_number()
returns trigger language plpgsql as $$
begin
  if coalesce(trim(new.receipt_no), '') = '' then
    new.receipt_no := public.generate_tx_doc_no('MRC', now());
  end if;
  return new;
end $$;

create trigger trg_makloon_receipt_auto_no
  before insert on public.makloon_receipts
  for each row execute function public.set_makloon_receipt_document_number();

-- Makloon Receipt Items (FG yang diterima)
create table if not exists public.makloon_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.makloon_receipts(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  uom_snapshot text not null,
  qty_received numeric(14,3) not null,
  jasa_per_unit numeric(14,2) not null default 0,
  material_cost_per_unit numeric(14,4) not null default 0,
  total_cost_per_unit numeric(14,4) generated always as (jasa_per_unit + material_cost_per_unit) stored,
  subtotal_jasa numeric(14,2) not null default 0,
  constraint ck_makloon_receipt_item_nonneg check (qty_received > 0 and jasa_per_unit >= 0 and material_cost_per_unit >= 0 and subtotal_jasa >= 0)
);

create index if not exists idx_makloon_receipt_items_receipt on public.makloon_receipt_items(receipt_id);
create index if not exists idx_makloon_receipt_items_item on public.makloon_receipt_items(item_id);

-- Validate CASH requires payment_method_code
create or replace function public.trg_validate_makloon_receipt_payment()
returns trigger language plpgsql as $$
begin
  if new.terms = 'CASH' and coalesce(trim(new.payment_method_code), '') = '' then
    raise exception 'Makloon Receipt CASH harus memilih metode pembayaran';
  end if;
  if new.terms = 'CREDIT' then
    new.payment_method_code := null;
  end if;
  return new;
end $$;

create trigger trg_makloon_receipt_payment
  before insert or update on public.makloon_receipts
  for each row execute function public.trg_validate_makloon_receipt_payment();

-- RLS
alter table public.makloon_receipts enable row level security;
alter table public.makloon_receipt_items enable row level security;

drop policy if exists "makloon_receipts_rw" on public.makloon_receipts;
create policy "makloon_receipts_rw" on public.makloon_receipts
  for all to authenticated
  using (public.is_admin() or public.is_owner())
  with check (public.is_admin() or public.is_owner());

drop policy if exists "makloon_receipt_items_rw" on public.makloon_receipt_items;
create policy "makloon_receipt_items_rw" on public.makloon_receipt_items
  for all to authenticated
  using (public.is_admin() or public.is_owner())
  with check (public.is_admin() or public.is_owner());

-- AP Jasa Konveksi table (for CREDIT terms)
create table if not exists public.makloon_ap_bills (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null unique references public.makloon_receipts(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  bill_date date not null,
  total_amount numeric(14,2) not null,
  outstanding_amount numeric(14,2) not null,
  status text not null default 'UNPAID',
  created_at timestamptz not null default now(),
  constraint ck_makloon_ap_amounts check (
    total_amount >= 0
    and outstanding_amount >= 0
    and outstanding_amount <= total_amount
  )
);

alter table public.makloon_ap_bills enable row level security;

drop policy if exists "makloon_ap_bills_rw" on public.makloon_ap_bills;
create policy "makloon_ap_bills_rw" on public.makloon_ap_bills
  for all to authenticated
  using (public.is_admin() or public.is_owner())
  with check (public.is_admin() or public.is_owner());