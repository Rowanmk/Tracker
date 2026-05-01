import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const FALLBACK_SUPABASE_URL = 'https://placeholder.supabase.co';
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'placeholder-anon-key';

const configuredSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const configuredSupabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim();

const SUPABASE_URL =
  configuredSupabaseUrl && configuredSupabaseUrl.startsWith('https://')
    ? configuredSupabaseUrl
    : FALLBACK_SUPABASE_URL;

const SUPABASE_PUBLISHABLE_KEY =
  configuredSupabasePublishableKey && configuredSupabasePublishableKey.length > 20
    ? configuredSupabasePublishableKey
    : FALLBACK_SUPABASE_PUBLISHABLE_KEY;

const getAuthStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
};

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: getAuthStorage(),
    persistSession: true,
    autoRefreshToken: true,
  },
});