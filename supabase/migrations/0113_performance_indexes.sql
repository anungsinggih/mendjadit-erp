-- ============================================================
-- 0113_performance_indexes.sql
-- Add database indexes for performance optimization
-- ============================================================

-- Sales table indexes
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_status_date ON sales(status, sales_date DESC);

-- Purchase table indexes
CREATE INDEX IF NOT EXISTS idx_purchases_vendor ON purchases(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_status_date ON purchases(status, purchase_date DESC);

-- Journal indexes (already exist in schema, kept here as no-ops with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(journal_date DESC);
CREATE INDEX IF NOT EXISTS idx_journals_ref ON journals(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal ON journal_lines(journal_id);

-- Items indexes
CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku);
CREATE INDEX IF NOT EXISTS idx_items_active ON items(is_active);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

-- Sales items indexes
CREATE INDEX IF NOT EXISTS idx_sales_items_sale ON sales_items(sales_id);
CREATE INDEX IF NOT EXISTS idx_sales_items_item ON sales_items(item_id);

-- Purchase items indexes
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_item ON purchase_items(item_id);

-- Return items indexes
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return ON sales_return_items(sales_return_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_item ON sales_return_items(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return ON purchase_return_items(purchase_return_id);
CREATE INDEX IF NOT EXISTS idx_purchase_return_items_item ON purchase_return_items(item_id);

-- Customer indexes
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(customer_type) WHERE customer_type IS NOT NULL;

-- Vendor indexes
CREATE INDEX IF NOT EXISTS idx_vendors_name ON vendors(name);

COMMENT ON INDEX idx_sales_status_date IS 'Optimize sales history queries by status + date';
COMMENT ON INDEX idx_purchases_status_date IS 'Optimize purchase history queries by status + date';
COMMENT ON INDEX idx_journals_date IS 'Optimize journal queries by date';
COMMENT ON INDEX idx_sales_return_items_item IS 'Optimize sales return item lookups';
COMMENT ON INDEX idx_purchase_return_items_item IS 'Optimize purchase return item lookups';
