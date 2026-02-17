import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://f10ce314dfbf3dc0a86752229ebc7bb4703448a3562814ad88bee35a732ab27d.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '08e0d25eb636817dbeb251d1fcde974809019af3c5d3d99076603b204c1cad1a'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
