import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const rawSupabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const rawSupabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';

const missing: string[] = [];
if (!rawSupabaseUrl) missing.push('VITE_SUPABASE_URL');
if (!rawSupabasePublishableKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');

const isValidUrl = rawSupabaseUrl.startsWith('https://') && rawSupabaseUrl.includes('.supabase.co');
const isValidKey = rawSupabasePublishableKey.length > 20;

const invalid: string[] = [];
if (rawSupabaseUrl && !isValidUrl) invalid.push('VITE_SUPABASE_URL (must be a valid https://*.supabase.co URL)');
if (rawSupabasePublishableKey && !isValidKey) invalid.push('VITE_SUPABASE_PUBLISHABLE_KEY (must be a valid publishable/anon key)');

if (missing.length > 0 || invalid.length > 0) {
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Missing required environment variable(s): ${missing.join(', ')}.`);
  }
  if (invalid.length > 0) {
    parts.push(`Invalid environment variable(s): ${invalid.join(', ')}.`);
  }
  parts.push(
    'Set these as build-time environment variables on the deployment host (Netlify/Vercel) and redeploy. Vite bakes VITE_* variables in at build time, so a local .env file alone is not sufficient for production.'
  );
  throw new Error(`Supabase configuration error: ${parts.join(' ')}`);
}

const getAuthStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
};

export const supabase = createClient<Database>(rawSupabaseUrl, rawSupabasePublishableKey, {
  auth: {
    storage: getAuthStorage(),
    persistSession: true,
    autoRefreshToken: true,
  },
});