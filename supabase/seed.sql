-- USERS SEED (Owner & Admin)
-- Use this to maintain consistent dev accounts across resets.

-- Ensure correct search path for pgcrypto (extensions schema)
SET search_path = public, extensions;

-- 1. Whitelist (Required by Trigger)
INSERT INTO public.signup_whitelist (email, invited_role, notes)
VALUES 
  ('owner@mendjahit.com', 'OWNER', 'Seeded via SQL'),
  ('admin@mendjahit.com', 'ADMIN', 'Seeded via SQL')
ON CONFLICT (email) DO UPDATE SET invited_role = excluded.invited_role;

-- 2. Auth Users (pgcrypto required) - IDEMPOTENT via DO block
DO $$
DECLARE
  v_owner_id uuid := gen_random_uuid();
  v_admin_id uuid := gen_random_uuid();
BEGIN
  -- Owner
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'owner@mendjahit.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, recovery_sent_at, last_sign_in_at, 
      raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', 
      v_owner_id, 
      'authenticated', 
      'authenticated', 
      'owner@mendjahit.com', 
      crypt('mendjahitownpass'::text, gen_salt('bf'::text)), 
      now(), now(), now(), 
      '{"provider":"email","providers":["email"]}', 
      '{"full_name":"Owner Mendjahit","role":"OWNER"}', 
      now(), now(), '', '', '', ''
    );
    
    -- Identity for Owner
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_owner_id, format('{"sub":"%s","email":"%s"}', v_owner_id, 'owner@mendjahit.com')::jsonb, 'email', v_owner_id::text, now(), now(), now()
    );
  END IF;

  -- Admin
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@mendjahit.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password, 
      email_confirmed_at, recovery_sent_at, last_sign_in_at, 
      raw_app_meta_data, raw_user_meta_data, 
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', 
      v_admin_id, 
      'authenticated', 
      'authenticated', 
      'admin@mendjahit.com', 
      crypt('admin1mendjahit'::text, gen_salt('bf'::text)), 
      now(), now(), now(), 
      '{"provider":"email","providers":["email"]}', 
      '{"full_name":"Admin Mendjahit","role":"ADMIN"}', 
      now(), now(), '', '', '', ''
    );

     -- Identity for Admin
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(), v_admin_id, format('{"sub":"%s","email":"%s"}', v_admin_id, 'admin@mendjahit.com')::jsonb, 'email', v_admin_id::text, now(), now(), now()
    );
  END IF;
END $$;
