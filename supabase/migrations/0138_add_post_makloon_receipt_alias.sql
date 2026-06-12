-- ============================================================
-- 0138_add_post_makloon_receipt_alias.sql
-- Add alias function for post_makloon_receipt to call rpc_post_makloon_receipt
-- ============================================================

create or replace function public.post_makloon_receipt(p_receipt_id uuid)
returns jsonb language plpgsql security definer as $$
begin
  return public.rpc_post_makloon_receipt(p_receipt_id);
end $$;