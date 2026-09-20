import { supabase } from './supabase';

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

export const sendMagicLink = async (email: string) => {
  if (!supabase) {
    return { demo: true };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: 'readynedy://auth/callback' },
  });
  if (error) {
    throw error;
  }
  return { demo: false };
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

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      onSignedIn();
    } else {
      onSignedOut();
    }
  });

  return () => data.subscription.unsubscribe();
};
