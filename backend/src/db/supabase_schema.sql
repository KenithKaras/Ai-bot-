-- ============================================================================
-- Radox AI Studio — Supabase PostgreSQL Schema, Grants & RLS Policies
-- ============================================================================
-- Notice: This schema is designed for version-controlled, controlled deployment.
-- Do NOT execute this against production without testing in staging first.
-- ============================================================================

-- Ensure schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 1. Profiles Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    sync_completed BOOLEAN NOT NULL DEFAULT false,
    sync_lock_until TIMESTAMPTZ,
    sync_lock_owner TEXT,
    migration_run_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Minimal Grants:
-- - Anon has ZERO access
-- - Authenticated clients can ONLY SELECT their own row (preventing state tampering)
-- - Mutations are strictly handled by the Express backend via service_role
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- RLS Policies
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- Indexes for performant lookup
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_migration_run_id ON public.profiles(migration_run_id);

-- ----------------------------------------------------------------------------
-- 2. Providers Table (AI Gateways & Encrypted Keys)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    key_iv TEXT NOT NULL,
    key_tag TEXT NOT NULL,
    key_preview TEXT NOT NULL,
    default_model TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    migration_run_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

-- Minimal Grants:
-- - Direct browser client access is completely revoked (zero exposure of ciphertext/IVs/tags)
-- - All operations go through Express API routes, which scope by verified user ID
REVOKE ALL ON public.providers FROM anon;
REVOKE ALL ON public.providers FROM authenticated;
GRANT ALL ON public.providers TO service_role;

-- Defensive RLS Policies (enforced if direct client grants are ever added in the future)
DROP POLICY IF EXISTS "providers_select_own" ON public.providers;
CREATE POLICY "providers_select_own" ON public.providers
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "providers_insert_own" ON public.providers;
CREATE POLICY "providers_insert_own" ON public.providers
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "providers_update_own" ON public.providers;
CREATE POLICY "providers_update_own" ON public.providers
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "providers_delete_own" ON public.providers;
CREATE POLICY "providers_delete_own" ON public.providers
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- Indexes for ownership lookup and default resolution
CREATE INDEX IF NOT EXISTS idx_providers_user_id ON public.providers(user_id);
CREATE INDEX IF NOT EXISTS idx_providers_is_default ON public.providers(user_id, is_default);
CREATE INDEX IF NOT EXISTS idx_providers_migration_run_id ON public.providers(migration_run_id);
