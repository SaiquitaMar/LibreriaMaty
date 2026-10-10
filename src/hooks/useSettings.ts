import { useEffect, useState } from 'react'
import { supabase, configured } from '../lib/supabase'

let cache: Record<string, string> | null = null

export function useSettings() {
  const [settings, setSettings] = useState<Record<string, string>>(cache ?? {})
  useEffect(() => {
    if (!configured || cache) return
    supabase.from('settings').select('key,value').then(({ data }) => {
      const map: Record<string, string> = {}
      ;(data ?? []).forEach((r: any) => { map[r.key] = r.value })
      cache = map
      setSettings(map)
    })
  }, [])
  return settings
}

export function clearSettingsCache() { cache = null }
