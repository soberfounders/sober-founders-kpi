import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './env'
import { demoSupabase } from './demoSupabaseClient'

// Runtime demo-mode check: URL param (?demo=true) OR build-time env var.
// Duplicated here (not just re-exported from env.js) because Vite's production
// build can inline import.meta.env values and fold the env.js constant to false
// before the runtime window.location check has a chance to run.
const urlHasDemo = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('demo') === 'true'
const envHasDemo = String(
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEMO_MODE) ?? ''
).toLowerCase() === 'true'
export const isDemoMode = urlHasDemo || envHasDemo

const supabaseUrl = SUPABASE_URL
const supabaseAnonKey = SUPABASE_ANON_KEY
const looksLikeJwt = (value) => value.split('.').length === 3

const hasRealConfig = Boolean(supabaseUrl && supabaseAnonKey && looksLikeJwt(supabaseAnonKey))

// In demo mode, pretend Supabase is configured so SupabaseGate lets views through.
export const hasSupabaseConfig = isDemoMode || hasRealConfig
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

export const supabase = isDemoMode ? demoSupabase : realSupabase
