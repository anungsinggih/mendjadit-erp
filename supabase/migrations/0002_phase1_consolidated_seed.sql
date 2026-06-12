-- ============================================================
-- 0002_phase1_consolidated_seed.sql
-- PHASE 1 SEED DATA (Minimal & Idempotent)
-- Merges: 0002, 020 (payment methods), 027 (master defaults), 024 (company profile)
-- ============================================================

set search_path = public;

-- 1) COA SEED (Minimal)
insert into public.accounts (code, name, is_system_account)
values
  ('1100', 'Kas', true),
  ('1110', 'Bank', true),
  ('1200', 'Piutang Usaha', true),
  ('1250', 'Uang Muka Pembelian', true),
  ('1300', 'Persediaan Barang Jadi', true),
  ('1310', 'Persediaan Bahan Baku', true), -- Added for separation
  ('2100', 'Hutang Usaha', true),
  ('4100', 'Penjualan', true),
  ('4110', 'Retur Penjualan', true), -- Added for returns
  ('5100', 'Harga Pokok Penjualan', true),
  ('5200', 'Diskon Pembelian', true),
  ('6100', 'Beban Operasional', true) -- Adjustment Expense
on conflict (code) do update
set name = excluded.name,
    is_system_account = excluded.is_system_account;

-- 2) MASTER DEFAULTS (UoM, Size, Color)
insert into public.uoms (code, name)
select 'PCS', 'Pieces'
where not exists (select 1 from public.uoms where code = 'PCS');

insert into public.sizes (code, name)
select 'ALL', 'All'
where not exists (select 1 from public.sizes where code = 'ALL');

insert into public.colors (code, name)
select 'N/A', 'No Color'
where not exists (select 1 from public.colors where code = 'NA');

-- 3) PAYMENT METHODS
insert into public.payment_methods (code, name, account_id)
values
  ('CASH', 'Kas Tunai', (select id from public.accounts where code = '1100')),
  ('BANK', 'Bank Utama', (select id from public.accounts where code = '1110'))
on conflict (code) do update
set name = excluded.name,
    account_id = excluded.account_id,
    is_active = true;

-- 4) COMPANY PROFILE (Default Mock)
insert into public.company_profile (name, address, phone, email, bank_name, bank_account, bank_holder)
select 
    'Mendjahit',
    'Jl. Industri No. 123, Malang, Jawa Timur 65141',
    '(021) 555-0123',
    'admin@mendjahit.com ',
    'BCA',
    '883-098-7766',
    'Mendjahit'
where not exists (select 1 from public.company_profile);

-- Note: Sizes and Colors sorting is now handled by application constants (src/lib/constants.ts)

-- ============================================================
-- 6) COMPREHENSIVE MASTER DATA SEEDS (Consolidated from 0011)
-- ============================================================

-- Seed UoMs
INSERT INTO uoms (code, name, is_active) VALUES
('PCS', 'PCS', true),
('SET', 'SET', true),
('METER', 'METER', true),
('PACK', 'PACK', true),
('YARD', 'YARD', true)
ON CONFLICT (code) DO NOTHING;

-- Seed Colors
INSERT INTO colors (code, name, is_active) VALUES
('PUTIH', 'Putih', true),
('HIJAU', 'Hijau', true),
('BIRU', 'Biru', true),
('COKLAT', 'Cokelat', true),
('HITAM', 'Hitam', true),
('N/A', 'N/A', true)
ON CONFLICT (code) DO NOTHING;

-- Seed Sizes
INSERT INTO sizes (code, name, is_active) VALUES
('N/A', 'N/A', true),
('S', 'S', true),
('M', 'M', true),
('L', 'L', true),
('XL', 'XL', true),
('2XL', 'XXL', true),
('3XL', 'XXXL', true)
ON CONFLICT (code) DO NOTHING;

