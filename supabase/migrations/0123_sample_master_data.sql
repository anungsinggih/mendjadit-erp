-- ============================================================
-- 0123_sample_master_data.sql
-- Sample master data untuk development & testing
-- Runs AFTER 0110 (vendor_type) and 0118 (vendor_items)
-- ============================================================

-- 1) SAMPLE VENDORS
-- vendor_type: 'SUPPLIER', 'KONVEKSI', 'INTERNAL' (from 0110 constraint)
INSERT INTO vendors (name, phone, address, vendor_type, is_active)
SELECT x.name, x.phone, x.address, x.vendor_type, x.is_active
FROM (
  VALUES
    ('Supplier Kain Premium', '081234567890', 'Jl. Tekstil No. 10, Surabaya', 'SUPPLIER', true),
    ('Konveksi Maju Abadi', '085678901234', 'Jl. Industri Garmen No. 25, Malang', 'KONVEKSI', true),
    ('Supplier Benang Jaya', '081122334455', 'Jl. Raya Perkebunan No. 5, Solo', 'SUPPLIER', true)
) AS x(name, phone, address, vendor_type, is_active)
WHERE NOT EXISTS (
  SELECT 1
  FROM vendors v
  WHERE v.name = x.name
);

-- 2) SAMPLE CUSTOMERS
INSERT INTO customers (name, phone, address, is_active)
SELECT x.name, x.phone, x.address, x.is_active
FROM (
  VALUES
    ('Toko Baju ABC', '021-5551234', 'Jl. Merdeka No. 100, Jakarta', true),
    ('Butik Fashionista', '021-5559876', 'Jl. Gatot Subroto No. 50, Jakarta', true),
    ('Grosir Pakaian Murah', '031-5558888', 'Jl. Basuki Rachmat No. 20, Surabaya', true)
) AS x(name, phone, address, is_active)
WHERE NOT EXISTS (
  SELECT 1
  FROM customers c
  WHERE c.name = x.name
);

-- 3) SAMPLE ITEMS (RAW, FG, TRADED)
INSERT INTO items (
  sku,
  name,
  type,
  uom,
  default_price_buy,
  min_stock,
  is_active
)
SELECT
  x.sku,
  x.name,
  x.type::item_type,
  x.uom,
  x.default_price_buy,
  x.min_stock,
  x.is_active
FROM (
  VALUES
    -- RAW Materials
    ('RAW-KAIN-001', 'Kain Katun 30s (per meter)', 'RAW_MATERIAL', 'METER', 25000, 100, true),
    ('RAW-BENANG-001', 'Benang Jahit Polyester (per rol)', 'RAW_MATERIAL', 'PCS', 15000, 50, true),

    -- FINISHED Goods
    ('FG-KAOS-001', 'Kaos Polos Cotton Combed 30s (S)', 'FINISHED_GOOD', 'PCS', 45000, 20, true),
    ('FG-KAOS-002', 'Kaos Polos Cotton Combed 30s (M)', 'FINISHED_GOOD', 'PCS', 45000, 20, true),
    ('FG-CELANA-001', 'Celana Chinos Pendek (L)', 'FINISHED_GOOD', 'PCS', 65000, 10, true),

    -- TRADED Goods
    ('TRD-JAKET-001', 'Jaket Bomber Premium (All Size)', 'TRADED', 'PCS', 150000, 5, true),
    ('TRD-TOPI-001', 'Topi Baseball Snapback', 'TRADED', 'PCS', 35000, 10, true)
) AS x(
  sku,
  name,
  type,
  uom,
  default_price_buy,
  min_stock,
  is_active
)
WHERE NOT EXISTS (
  SELECT 1
  FROM items i
  WHERE i.sku = x.sku
);

-- 4) BIND ITEMS TO VENDORS (via vendor_items)

-- Kaos Polos S diproduksi oleh Konveksi Maju Abadi
INSERT INTO vendor_items (vendor_id, item_id, unit_cost, is_preferred, notes)
SELECT v.id, i.id, 45000, true, 'Produsen utama kaos S'
FROM vendors v
JOIN items i ON i.sku = 'FG-KAOS-001'
WHERE v.name = 'Konveksi Maju Abadi'
  AND NOT EXISTS (
    SELECT 1
    FROM vendor_items vi
    WHERE vi.vendor_id = v.id
      AND vi.item_id = i.id
  );

-- Kaos Polos M diproduksi oleh Konveksi Maju Abadi
INSERT INTO vendor_items (vendor_id, item_id, unit_cost, is_preferred, notes)
SELECT v.id, i.id, 45000, true, 'Produsen utama kaos M'
FROM vendors v
JOIN items i ON i.sku = 'FG-KAOS-002'
WHERE v.name = 'Konveksi Maju Abadi'
  AND NOT EXISTS (
    SELECT 1
    FROM vendor_items vi
    WHERE vi.vendor_id = v.id
      AND vi.item_id = i.id
  );

-- Celana diproduksi oleh Konveksi Maju Abadi
INSERT INTO vendor_items (vendor_id, item_id, unit_cost, is_preferred, notes)
SELECT v.id, i.id, 65000, true, 'Produsen celana chinos'
FROM vendors v
JOIN items i ON i.sku = 'FG-CELANA-001'
WHERE v.name = 'Konveksi Maju Abadi'
  AND NOT EXISTS (
    SELECT 1
    FROM vendor_items vi
    WHERE vi.vendor_id = v.id
      AND vi.item_id = i.id
  );

-- Jaket dibeli dari Supplier Kain Premium
INSERT INTO vendor_items (vendor_id, item_id, unit_cost, is_preferred, notes)
SELECT v.id, i.id, 150000, true, 'Supplier utama jaket import'
FROM vendors v
JOIN items i ON i.sku = 'TRD-JAKET-001'
WHERE v.name = 'Supplier Kain Premium'
  AND NOT EXISTS (
    SELECT 1
    FROM vendor_items vi
    WHERE vi.vendor_id = v.id
      AND vi.item_id = i.id
  );

-- Topi dibeli dari Supplier Kain Premium
INSERT INTO vendor_items (vendor_id, item_id, unit_cost, is_preferred, notes)
SELECT v.id, i.id, 35000, true, 'Supplier utama topi'
FROM vendors v
JOIN items i ON i.sku = 'TRD-TOPI-001'
WHERE v.name = 'Supplier Kain Premium'
  AND NOT EXISTS (
    SELECT 1
    FROM vendor_items vi
    WHERE vi.vendor_id = v.id
      AND vi.item_id = i.id
  );

-- Kain dibeli dari Supplier Kain Premium
INSERT INTO vendor_items (vendor_id, item_id, unit_cost, is_preferred, notes)
SELECT v.id, i.id, 25000, true, 'Supplier utama kain'
FROM vendors v
JOIN items i ON i.sku = 'RAW-KAIN-001'
WHERE v.name = 'Supplier Kain Premium'
  AND NOT EXISTS (
    SELECT 1
    FROM vendor_items vi
    WHERE vi.vendor_id = v.id
      AND vi.item_id = i.id
  );

-- Kain juga bisa dari Supplier Benang Jaya (alternative)
INSERT INTO vendor_items (vendor_id, item_id, unit_cost, is_preferred, notes)
SELECT v.id, i.id, 26000, false, 'Alternative supplier kain'
FROM vendors v
JOIN items i ON i.sku = 'RAW-KAIN-001'
WHERE v.name = 'Supplier Benang Jaya'
  AND NOT EXISTS (
    SELECT 1
    FROM vendor_items vi
    WHERE vi.vendor_id = v.id
      AND vi.item_id = i.id
  );

-- Benang dibeli dari Supplier Benang Jaya
INSERT INTO vendor_items (vendor_id, item_id, unit_cost, is_preferred, notes)
SELECT v.id, i.id, 15000, true, 'Supplier utama benang'
FROM vendors v
JOIN items i ON i.sku = 'RAW-BENANG-001'
WHERE v.name = 'Supplier Benang Jaya'
  AND NOT EXISTS (
    SELECT 1
    FROM vendor_items vi
    WHERE vi.vendor_id = v.id
      AND vi.item_id = i.id
  );