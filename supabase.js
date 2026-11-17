import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : undefined;

export function getSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase isn't configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
    );
  }
  return supabase;
}

export async function isAdmin() {
  const { data, error } = await getSupabase().rpc("is_admin");
  if (error) throw error;
  return data === true;
}
