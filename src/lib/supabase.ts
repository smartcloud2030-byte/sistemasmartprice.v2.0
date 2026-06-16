import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Use a dummy URL if missing to avoid crash on initialization
const effectiveUrl = supabaseUrl || 'https://placeholder-project.supabase.co';
const effectiveKey = supabaseAnonKey || 'placeholder-key';

export const supabase = createClient(effectiveUrl, effectiveKey);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
