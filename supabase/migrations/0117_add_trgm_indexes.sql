-- ============================================================
-- 0117_add_trgm_indexes.sql
-- Add trigram indexes for optimized search performance
-- ============================================================

-- Enable pg_trgm extension for trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram indexes for case-insensitive search on items table
CREATE INDEX IF NOT EXISTS idx_items_name_trgm ON public.items USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_items_sku_trgm ON public.items USING gin (sku gin_trgm_ops);

-- Optional: Add trigram indexes for other searchable fields if needed
-- CREATE INDEX IF NOT EXISTS idx_items_brand_name_trgm ON public.items USING gin (brand_name gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_items_category_name_trgm ON public.items USING gin (category_name gin_trgm_ops);

COMMENT ON INDEX idx_items_name_trgm IS 'Optimize name search with trigram matching';
COMMENT ON INDEX idx_items_sku_trgm IS 'Optimize SKU search with trigram matching';
