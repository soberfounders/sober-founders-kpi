import { createClient } from '@supabase/supabase-js'
import { DEMO_MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import { demoSupabase } from './demoSupabaseClient'

const supabaseUrl = SUPABASE_URL
const supabaseAnonKey = SUPABASE_ANON_KEY
const looksLikeJwt = (value) => value.split('.').length === 3

const hasRealConfig = Boolean(supabaseUrl && supabaseAnonKey && looksLikeJwt(supabaseAnonKey))

// In demo mode, pretend Supabase is configured so SupabaseGate lets views through.
export const hasSupabaseConfig = DEMO_MODE || hasRealConfig
export const supabaseConfigError = hasSupabaseConfig
  ? ''
  : 'Missing or invalid VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY in deployment environment.'

// Keep a valid client object so imports are stable even when env vars are missing.
const fallbackUrl = 'https://ldnucnghzpkuixmnfjbs.supabase.co'
const fallbackAnonKey = 'missing-supabase-anon-key'

const realSupabase = createClient(
  hasRealConfig ? supabaseUrl : fallbackUrl,
  hasRealConfig ? supabaseAnonKey : fallbackAnonKey
)

export const supabase = DEMO_MODE ? demoSupabase : realSupabase
