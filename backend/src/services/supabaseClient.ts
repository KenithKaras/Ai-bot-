import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let adminClientInstance: SupabaseClient | null = null;

/**
 * Returns the server-side Supabase client with administrative service_role privileges.
 * Note: service_role bypasses RLS in PostgreSQL; all queries must be explicitly scoped
 * by verified user ID at the application layer.
 */
export const getSupabaseAdmin = (): SupabaseClient => {
  if (adminClientInstance) {
    return adminClientInstance;
  }

  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error('Supabase configuration missing: SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
  }

  adminClientInstance = createClient(config.supabaseUrl, config.supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return adminClientInstance;
};

/**
 * Creates an ephemeral, isolated Supabase client instance for a single authentication operation.
 * Guarantees zero session bleed or shared in-memory token state across concurrent server requests.
 */
export const createIsolatedAuthClient = (): SupabaseClient => {
  const url = config.supabaseUrl;
  const key = config.supabasePublishableKey || config.supabaseSecretKey;

  if (!url || !key) {
    throw new Error('Supabase client credentials missing.');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};
