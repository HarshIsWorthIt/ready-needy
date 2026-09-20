const env: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const readString = (key: string): string | null => {
  const value = env[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

const readBool = (key: string, fallback = false): boolean => {
  const value = env[key];
  return value === undefined ? fallback : value.trim().toLowerCase() === 'true';
};

export const supabaseUrl = readString('EXPO_PUBLIC_SUPABASE_URL');
export const supabaseAnonKey = readString('EXPO_PUBLIC_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const paymentsEnabled = readBool('EXPO_PUBLIC_PAYMENTS_ENABLED');

export const appScheme = 'readynedy';

export const dispatchLimits = {
  maxHelpers: 20,
  minHelpers: 1,
  defaultHelpers: 3,
  minReward: 1,
  defaultReward: 300,
  minRadiusKm: 0.1,
  maxRadiusKm: 25,
  defaultRadiusKm: 1,
} as const;

export const APP_VERSION = '1.0.0';
