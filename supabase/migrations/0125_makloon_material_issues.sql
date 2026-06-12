-- ============================================================
-- 0125_makloon_material_issues.sql
-- Makloon Module: Pengiriman Bahan Baku ke Vendor Konveksi
-- Bahan dikirim dari gudang owner ke vendor untuk diproses
-- ============================================================

-- Makloon Material Issue (dokumen pengiriman bahan)
create table if not exists public.makloon_material_issues (
  id uuid primary key default gen_random_uuid(),
  issue_no text unique,
  makloon_order_id uuid not null references public.makloon_orders(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  issue_date date not null default current_date,
  status text not null default 'DRAFT',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint ck_makloon_issue_status check (status in ('DRAFT','POSTED'))
);

create index if not exists idx_makloon_issues_order on public.makloon_material_issues(makloon_order_id);
create index if not exists idx_makloon_issues_vendor on public.makloon_material_issues(vendor_id);
create index if not exists idx_makloon_issues_date on public.makloon_material_issues(issue_date desc);

create trigger trg_makloon_material_issues_updated_at
  before update on public.makloon_material_issues
  for each row execute function set_updated_at();

-- Auto-number
create or replace function public.set_makloon_issue_document_number()
returns trigger language plpgsql as $$
begin
  if coalesce(trim(new.issue_no), '') = '' then
    new.issue_no := public.generate_tx_doc_no('MIS', now());
  end if;
  return new;
end $$;

create trigger trg_makloon_issue_auto_no
  before insert on public.makloon_material_issues
  for each row execute function public.set_makloon_issue_document_number();

-- Makloon Issue Items (bahan yang dikirim)
create table if not exists public.makloon_issue_items (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.makloon_material_issues(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete restrict,
  uom_snapshot text not null,
  qty numeric(14,3) not null,
  avg_cost_snapshot numeric(14,4) not null default 0,
  subtotal numeric(14,2) not null default 0,
  constraint ck_makloon_issue_item_nonneg check (qty > 0 and avg_cost_snapshot >= 0 and subtotal >= 0)
);

create index if not exists idx_makloon_issue_items_issue on public.makloon_issue_items(issue_id);
create index if not exists idx_makloon_issue_items_item on public.makloon_issue_items(item_id);

-- RLS
alter table public.makloon_material_issues enable row level security;
alter table public.makloon_issue_items enable row level security;

drop policy if exists "makloon_material_issues_rw" on public.makloon_material_issues;
create policy "makloon_material_issues_rw" on public.makloon_material_issues
  for all to authenticated
  using (public.is_admin() or public.is_owner())
  with check (public.is_admin() or public.is_owner());

drop policy if exists "makloon_issue_items_rw" on public.makloon_issue_items;
create policy "makloon_issue_items_rw" on public.makloon_issue_items
  for all to authenticated
  using (public.is_admin() or public.is_owner())
  with check (public.is_admin() or public.is_owner());

-- RPC: Post Material Issue (kurangi stok bahan, catat jurnal keluar bahan)
create or replace function public.rpc_post_makloon_material_issue(p_issue_id uuid)
returns jsonb language plpgsql security definer as $$
declare
  v_issue record;
  v_item record;
  v_inventory record;
  v_journal_id uuid;
  v_raw_inv_acc_id uuid;
  v_wip_acc_id uuid;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select * into v_issue from public.makloon_material_issues where id = p_issue_id;
  if not found then raise exception 'Material Issue tidak ditemukan'; end if;
  if v_issue.status = 'POSTED' then raise exception 'Material Issue sudah POSTED'; end if;
  if public.is_date_in_closed_period(v_issue.issue_date) then
    raise exception 'Period sudah CLOSED untuk tanggal ini';
  end if;

  -- Get accounts
  select id into v_raw_inv_acc_id from public.accounts where code = '1310'; -- RAW Inventory
  if not found then raise exception 'Akun Persediaan Bahan Baku (1310) tidak ditemukan'; end if;

  select id into v_wip_acc_id from public.accounts where code = '1320'; -- WIP / Bahan di Konveksi
  if not found then
    -- Auto-create WIP account if not exists
    insert into public.accounts (code, name, account_type, is_system_account)
    values ('1320', 'Bahan di Vendor Konveksi', 'ASSET', true)
    on conflict (code) do nothing;
    select id into v_wip_acc_id from public.accounts where code = '1320';
  end if;

  -- Create journal header
  insert into public.journals (journal_date, ref_type, ref_id, memo, created_by)
  values (
    v_issue.issue_date,
    'MAKLOON_ISSUE',
    v_issue.id,
    'Pengiriman Bahan ke Konveksi ' || v_issue.issue_no,
    auth.uid()
  ) returning id into v_journal_id;

  -- Process each item: reduce RAW stock, journal Debit WIP / Credit RAW Inventory
  for v_item in
    select ii.*, i.name as item_name, i.uom
    from public.makloon_issue_items ii
    join public.items i on i.id = ii.item_id
    where ii.issue_id = p_issue_id
  loop
    -- Get current avg cost
    select * into v_inventory
    from public.inventory_stock
    where item_id = v_item.item_id;

    if not found or v_inventory.qty_on_hand < v_item.qty then
      raise exception 'Stok tidak cukup untuk item %: tersedia %, dibutuhkan %',
        v_item.item_name,
        coalesce(v_inventory.qty_on_hand, 0),
        v_item.qty;
    end if;

    -- Update avg_cost_snapshot
    update public.makloon_issue_items
    set avg_cost_snapshot = v_inventory.avg_cost,
        subtotal = v_item.qty * v_inventory.avg_cost
    where id = v_item.id;

    -- Reduce inventory
    update public.inventory_stock
    set qty_on_hand = qty_on_hand - v_item.qty,
        updated_at = now()
    where item_id = v_item.item_id;

    -- Journal lines: Debit WIP, Credit RAW Inventory
    insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
    values (v_journal_id, v_wip_acc_id, v_item.qty * v_inventory.avg_cost, 0, v_item.item_name);

    insert into public.journal_lines (journal_id, account_id, debit, credit, line_memo)
    values (v_journal_id, v_raw_inv_acc_id, 0, v_item.qty * v_inventory.avg_cost, v_item.item_name);
  end loop;

  -- Mark POSTED
  update public.makloon_material_issues
  set status = 'POSTED', updated_at = now()
  where id = p_issue_id;

  return jsonb_build_object('success', true, 'journal_id', v_journal_id);
end $$;