import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

const getSupabaseUrlValidationError = (urlValue: string): string | null => {
  if (!urlValue) return null;

  try {
    const parsed = new URL(urlValue);
    const hasInvalidPath = parsed.pathname && parsed.pathname !== '/';
    const hasInvalidQuery = !!parsed.search;
    const hasInvalidHash = !!parsed.hash;

    if (hasInvalidPath || hasInvalidQuery || hasInvalidHash) {
      return (
        'NEXT_PUBLIC_SUPABASE_URL must be the base project URL only ' +
        '(for example: https://your-project-ref.supabase.co), without /auth/v1 or /rest/v1.'
      );
    }
  } catch {
    return 'NEXT_PUBLIC_SUPABASE_URL is not a valid URL.';
  }

  return null;
};

const supabaseUrlValidationError = getSupabaseUrlValidationError(supabaseUrl);

const missingSupabaseEnvVars = [
  !supabaseUrl ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
  !supabaseAnonKey ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY' : null,
].filter(Boolean) as string[];

export const isSupabaseConfigured = missingSupabaseEnvVars.length === 0 && !supabaseUrlValidationError;

export const getSupabaseConfigErrorMessage = (): string | null => {
  if (supabaseUrlValidationError) return supabaseUrlValidationError;
  if (isSupabaseConfigured) return null;
  return (
    `Supabase is not configured. Missing ${missingSupabaseEnvVars.join(' and ')} in .env.local. ` +
    'After updating env vars, restart the Next.js dev server.'
  );
};

if (!isSupabaseConfigured) {
  console.warn('Supabase environment variables are not fully set');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseAnonKey || 'public-anon-key-placeholder',
);
