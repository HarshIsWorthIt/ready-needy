import { paymentsEnabled } from './config';
import { supabase } from './supabase';

export const paymentsConfigured = paymentsEnabled;

export const createRewardCheckout = async (requestId: string) => {
  if (!paymentsConfigured || !supabase) {
    return { configured: false, checkoutUrl: null };
  }

  const { data, error } = await supabase.functions.invoke('create-reward-checkout', {
    body: { requestId },
  });
  if (error) {
    throw error;
  }

  return { configured: true, checkoutUrl: data?.checkoutUrl ?? null };
};
