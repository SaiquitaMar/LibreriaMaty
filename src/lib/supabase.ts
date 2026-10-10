import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

// Falso si las dos variables de conexión todavía no están puestas en Netlify
export const configured = Boolean(url && key && url.startsWith('http'))

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

// Cliente temporal que NO toca la sesión del administrador (se usa para registrar personal nuevo)
export function makeEphemeralClient() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
