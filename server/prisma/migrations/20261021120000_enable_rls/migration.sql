-- Enable row level security on every table in the public schema, with no policies.
--
-- The server connects as the table owner (`postgres` on Supabase), which bypasses
-- RLS, so app queries are unaffected. This only locks out Supabase's `anon` and
-- `authenticated` roles, which would otherwise have full access through the
-- auto-generated Data API. Tenant isolation stays in the Prisma extension
-- (src/lib/prisma.ts).
--
-- Do NOT use FORCE ROW LEVEL SECURITY: it applies RLS to the owner too and the
-- server would see zero rows. New tables need their own
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` in the migration that creates them.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
