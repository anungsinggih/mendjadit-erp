-- ============================================================
-- 0129_item_bom_schema.sql
-- Makloon Module: Bill of Materials (BOM) / Recipe
-- ============================================================

create table if not exists public.item_boms (
  id uuid primary key default gen_random_uuid(),
  finished_good_id uuid not null references public.items(id) on delete cascade,
  raw_material_id uuid not null references public.items(id) on delete restrict,
  qty_per_fg numeric(14,4) not null default 0,
  created_at timestamptz not null default now(),
  constraint ck_item_bom_qty_positive check (qty_per_fg > 0)
);

create index if not exists idx_item_boms_fg on public.item_boms(finished_good_id);
create unique index if not exists idx_item_boms_fg_rm on public.item_boms(finished_good_id, raw_material_id);

alter table public.item_boms enable row level security;

drop policy if exists "item_boms_rw" on public.item_boms;
create policy "item_boms_rw" on public.item_boms
  for all to authenticated
  using (public.is_admin() or public.is_owner())
  with check (public.is_admin() or public.is_owner());