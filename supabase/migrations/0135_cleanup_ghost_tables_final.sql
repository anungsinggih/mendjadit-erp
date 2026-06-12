-- ============================================================
-- 0135_cleanup_ghost_tables_final.sql
-- Final cleanup of ghost tables with proper order
-- ============================================================

-- Cleanup ghost table vendor_item_costs
-- This table was created in 0129 but never used in production
-- All vendor HPP data is stored in vendor_items table

-- Drop related policies (if they exist)
drop policy if exists "vendor_item_costs_rw" on public.vendor_item_costs;

-- Drop related triggers (if they exist)
drop trigger if exists trg_vendor_item_costs_updated_at on public.vendor_item_costs;

-- Drop related indexes (if they exist)
drop index if exists public.idx_vendor_item_costs_vendor;
drop index if exists public.idx_vendor_item_costs_item;
drop index if exists public.idx_vendor_item_costs_vendor_item_active;
drop index if exists public.idx_vendor_item_costs_vendor_item_preferred;

-- Drop the ghost table and all related objects
drop table if exists public.vendor_item_costs cascade;
