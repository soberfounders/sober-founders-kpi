import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

const supabaseUrl = SUPABASE_URL
const supabaseAnonKey = SUPABASE_ANON_KEY
const looksLikeJwt = (value) => value.split('.').length === 3

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey && looksLikeJwt(supabaseAnonKey))
export const supabaseConfigError = hasSupabaseConfig
  ? ''
  : 'Missing or invalid VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY in deployment environment.'

// Keep a valid client object so imports are stable even when env vars are missing.
const fallbackUrl = 'https://ldnucnghzpkuixmnfjbs.supabase.co'
const fallbackAnonKey = 'missing-supabase-anon-key'

export const supabase = createClient(
  hasSupabaseConfig ? supabaseUrl : fallbackUrl,
  hasSupabaseConfig ? supabaseAnonKey : fallbackAnonKey
)
