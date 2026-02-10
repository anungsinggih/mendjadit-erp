-- ============================================================
-- 0110_add_vendor_type.sql
-- Add vendor_type to classify supplier vs internal konveksi
-- ============================================================

alter table public.vendors
  add column if not exists vendor_type text not null default 'SUPPLIER';

update public.vendors
set vendor_type = 'SUPPLIER'
where vendor_type is null;

alter table public.vendors
  drop constraint if exists vendors_vendor_type_check;

alter table public.vendors
  add constraint vendors_vendor_type_check
  check (vendor_type in ('SUPPLIER','KONVEKSI','INTERNAL'));
