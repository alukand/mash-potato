import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to ' +
      '.env and fill them in from `npx supabase status` (local) or your project settings.',
  )
}

// The anon key is safe to ship in the client binary — RLS is what protects the
// data. NEVER put the service_role key or the TMDB key here; proxy those through
// a Supabase Edge Function.
export const supabase = createClient<Database>(url, anonKey)
