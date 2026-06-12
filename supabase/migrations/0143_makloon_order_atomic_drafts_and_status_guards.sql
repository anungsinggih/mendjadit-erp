-- ============================================================
-- 0143_makloon_order_atomic_drafts_and_status_guards.sql
-- Atomic makloon order draft saves + stricter manual status changes
-- ============================================================

create or replace function public.rpc_save_makloon_order_draft(
  p_order_id uuid default null,
  p_vendor_id uuid default null,
  p_order_date date default current_date,
  p_expected_completion_date date default null,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order record;
  v_order_id uuid;
  v_total_jasa numeric(14,2) := 0;
  v_vendor_type text;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  if p_vendor_id is null then
    raise exception 'Vendor wajib diisi';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order harus memiliki minimal 1 item';
  end if;

  select vendor_type into v_vendor_type
  from public.vendors
  where id = p_vendor_id;

  if not found then
    raise exception 'Vendor tidak ditemukan';
  end if;

  if v_vendor_type not in ('KONVEKSI', 'INTERNAL') then
    raise exception 'Makloon Order hanya untuk vendor KONVEKSI atau INTERNAL, vendor ini bertipe %', coalesce(v_vendor_type, 'UNKNOWN');
  end if;

  if p_order_id is null then
    if public.is_date_in_closed_period(p_order_date) then
      raise exception 'Period sudah CLOSED untuk tanggal ini';
    end if;

    insert into public.makloon_orders (
      vendor_id,
      order_date,
      expected_completion_date,
      notes,
      status,
      total_jasa,
      created_by
    ) values (
      p_vendor_id,
      p_order_date,
      p_expected_completion_date,
      nullif(btrim(coalesce(p_notes, '')), ''),
      'DRAFT',
      0,
      auth.uid()
    )
    returning * into v_order;
  else
    select * into v_order
    from public.makloon_orders
    where id = p_order_id
    for update;

    if not found then
      raise exception 'Order tidak ditemukan';
    end if;

    if v_order.status <> 'DRAFT' then
      raise exception 'Hanya draft order yang bisa diedit';
    end if;

    if public.is_date_in_closed_period(v_order.order_date) or public.is_date_in_closed_period(p_order_date) then
      raise exception 'Period sudah CLOSED untuk tanggal ini';
    end if;

    update public.makloon_orders
    set vendor_id = p_vendor_id,
        order_date = p_order_date,
        expected_completion_date = p_expected_completion_date,
        notes = nullif(btrim(coalesce(p_notes, '')), ''),
        updated_at = now()
    where id = p_order_id
    returning * into v_order;
  end if;

  v_order_id := v_order.id;

  if exists (
    with raw as (
      select
        case
          when coalesce(item->>'item_id', '') = '' then null
          else (item->>'item_id')::uuid
        end as item_id,
        coalesce((item->>'qty_ordered')::numeric, 0) as qty_ordered,
        coalesce((item->>'jasa_per_unit')::numeric, 0) as jasa_per_unit
      from jsonb_array_elements(p_items) as item
    )
    select 1
    from raw r
    left join public.items i on i.id = r.item_id
    where r.item_id is null
      or i.id is null
      or r.qty_ordered <= 0
      or r.jasa_per_unit < 0
  ) then
    raise exception 'Item order makloon tidak valid';
  end if;

  delete from public.makloon_order_items
  where makloon_order_id = v_order_id;

  with raw as (
    select
      (item->>'item_id')::uuid as item_id,
      nullif(item->>'uom_snapshot', '') as uom_snapshot_raw,
      nullif(item->>'uom', '') as uom_fallback,
      (item->>'qty_ordered')::numeric as qty_ordered,
      coalesce((item->>'jasa_per_unit')::numeric, 0) as jasa_per_unit
    from jsonb_array_elements(p_items) as item
  ),
  enriched as (
    select
      r.item_id,
      coalesce(r.uom_snapshot_raw, r.uom_fallback, i.uom) as uom_snapshot,
      r.qty_ordered,
      r.jasa_per_unit
    from raw r
    join public.items i on i.id = r.item_id
  ),
  merged as (
    select
      item_id,
      uom_snapshot,
      jasa_per_unit,
      sum(qty_ordered) as qty_ordered
    from enriched
    group by item_id, uom_snapshot, jasa_per_unit
  )
  insert into public.makloon_order_items (
    makloon_order_id,
    item_id,
    uom_snapshot,
    qty_ordered,
    jasa_per_unit,
    subtotal_jasa
  )
  select
    v_order_id,
    item_id,
    uom_snapshot,
    qty_ordered,
    jasa_per_unit,
    round(qty_ordered * jasa_per_unit, 2)
  from merged;

  select coalesce(sum(subtotal_jasa), 0)
  into v_total_jasa
  from public.makloon_order_items
  where makloon_order_id = v_order_id;

  update public.makloon_orders
  set total_jasa = v_total_jasa,
      updated_at = now()
  where id = v_order_id;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'created', p_order_id is null,
    'total_jasa', v_total_jasa
  );
end $$;

create or replace function public.rpc_update_makloon_order_status(p_order_id uuid, p_new_status text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_order record;
  v_item_count integer;
begin
  if not (public.is_admin() or public.is_owner()) then
    raise exception 'Not authorized';
  end if;

  select * into v_order
  from public.makloon_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order tidak ditemukan';
  end if;

  if p_new_status not in ('ISSUED', 'CANCELLED') then
    raise exception 'Status manual tidak didukung: %', p_new_status;
  end if;

  if v_order.status <> 'DRAFT' then
    raise exception 'Hanya draft order yang dapat diubah manual';
  end if;

  if p_new_status = 'ISSUED' then
    select count(*) into v_item_count
    from public.makloon_order_items
    where makloon_order_id = p_order_id;

    if v_item_count = 0 then
      raise exception 'Tidak bisa konfirmasi order: order harus memiliki minimal 1 item';
    end if;
  end if;

  update public.makloon_orders
  set status = p_new_status,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'new_status', p_new_status
  );
end $$;
