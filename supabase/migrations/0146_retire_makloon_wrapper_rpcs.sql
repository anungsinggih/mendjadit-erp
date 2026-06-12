-- ============================================================
-- 0146_retire_makloon_wrapper_rpcs.sql
-- Retire stale makloon wrapper RPCs after frontend moved to canonical rpc_* APIs
-- ============================================================

drop function if exists public.create_makloon_issue(uuid, date, text, jsonb, boolean);
drop function if exists public.create_makloon_receipt(uuid, date, text, jsonb, boolean);
drop function if exists public.post_makloon_receipt(uuid);
