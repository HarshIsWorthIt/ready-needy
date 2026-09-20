import { appScheme } from './config';
import { reportError } from './errors';
import { getAuthenticatedUserId, supabase } from './supabase';

export type AuthProfile = {
  id: string;
  email: string | null;
  name: string;
};

export const getAuthSession = async () => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session;
};

/**
 * Sends a Supabase magic link. Returns `demo: true` when Supabase is not
 * configured so the prototype flow keeps working without credentials.
 */
export const sendMagicLink = async (email: string) => {
  if (!supabase) {
    return { demo: true as const };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${appScheme}://auth/callback` },
  });
  if (error) {
    throw error;
  }
  return { demo: false as const };
};

/**
 * Ensures a matching row exists in `public.users` for the signed-in auth user.
 * The dispatch schema keys every table off this profile row.
 */
export const ensureUserProfile = async (): Promise<AuthProfile | null> => {
  if (!supabase) {
    return null;
  }

  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return null;
  }

  const { data: session } = await supabase.auth.getSession();
  const email = session.session?.user?.email ?? null;
  const fallbackName =
    (session.session?.user?.user_metadata as { full_name?: string; name?: string } | null)?.full_name ??
    (session.session?.user?.user_metadata as { name?: string } | null)?.name ??
    email?.split('@')[0] ??
    'Neighbour';

  const { data: existing, error: selectError } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('id', userId)
    .maybeSingle();

  if (selectError) {
    reportError('ensureUserProfile.select', selectError);
    throw selectError;
  }

  if (existing) {
    return { id: existing.id, email: existing.email ?? email, name: existing.name };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('users')
    .insert({ id: userId, name: fallbackName, email: email ?? `${userId}@users.noreply.app` })
    .select('id, name, email')
    .single();

  if (insertError) {
    reportError('ensureUserProfile.insert', insertError);
    throw insertError;
  }

  return { id: inserted.id, email: inserted.email ?? email, name: inserted.name };
};

export const signOut = async () => {
  if (!supabase) {
    return;
  }
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
};

export const subscribeToAuthChanges = (onSignedIn: () => void, onSignedOut: () => void) => {
  if (!supabase) {
    return () => undefined;
  }

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (session && event !== 'SIGNED_OUT') {
      onSignedIn();
    } else {
      onSignedOut();
    }
  });

  return () => data.subscription.unsubscribe();
};
