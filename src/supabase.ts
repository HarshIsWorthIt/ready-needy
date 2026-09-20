import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './config';

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export const usesSupabase = Boolean(supabase);

/**
 * Resolves the signed-in user id from the Supabase session.
 * Row Level Security policies key off `auth.uid()`, so every remote call
 * must use the session user instead of a static environment value.
 */
export const getAuthenticatedUserId = async (): Promise<string | null> => {
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session?.user?.id ?? null;
};
