import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
const projectRef = supabaseUrl ? new URL(supabaseUrl).hostname.split(".")[0] : "trading-terminal";
const storageKey = `sb-${projectRef}-auth-token`;
const authOptions = {
  autoRefreshToken: true,
  detectSessionInUrl: true,
  persistSession: true,
};

const persistentStorage = typeof window === "undefined" ? null : window.localStorage;
const tabStorage = typeof window === "undefined" ? null : window.sessionStorage;
let activeStorage = persistentStorage ?? tabStorage;

if (persistentStorage && tabStorage) {
  const hasPersistentSession = persistentStorage.getItem(storageKey) !== null;
  const hasTabSession = tabStorage.getItem(storageKey) !== null;
  activeStorage = hasTabSession && !hasPersistentSession ? tabStorage : persistentStorage;
}

const storageAdapter = activeStorage ? {
  getItem: (key: string) => activeStorage?.getItem(key) ?? null,
  setItem: (key: string, value: string) => activeStorage?.setItem(key, value),
  removeItem: (key: string) => activeStorage?.removeItem(key),
} : undefined;

export const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        ...authOptions,
        storageKey,
        storage: storageAdapter,
      },
    })
  : null;

export const isSupabaseConfigured = Boolean(supabase);

export function setSessionPersistence(rememberMe: boolean): void {
  if (!persistentStorage || !tabStorage) return;
  persistentStorage.removeItem(storageKey);
  tabStorage.removeItem(storageKey);
  activeStorage = rememberMe ? persistentStorage : tabStorage;
}

export function clearStoredSupabaseSession(): void {
  persistentStorage?.removeItem(storageKey);
  tabStorage?.removeItem(storageKey);
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session?.access_token) {
    return data.session.access_token;
  }
  return null;
}
