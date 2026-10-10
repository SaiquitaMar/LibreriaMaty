import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, configured } from '../lib/supabase'
import type { Profile } from '../types'

interface AuthValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isStaff: boolean
  isAdmin: boolean
  canInventory: boolean
  canVerify: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileFor, setProfileFor] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) { setProfile(null); setLoading(false) }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const loadProfile = async () => {
    if (!userId) return
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile((data as Profile) ?? null)
    setProfileFor(userId)
    setLoading(false)
  }
  useEffect(() => {
    if (!userId) return
    setLoading(true)
    loadProfile()
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<AuthValue>(() => {
    const active = !!profile?.active
    const isAdmin = active && profile?.role === 'admin'
    const isStaff = active && (profile?.role === 'admin' || profile?.role === 'employee')
    return {
      session, profile, loading: loading || (!!session && profileFor !== session.user.id), isStaff, isAdmin,
      canInventory: isAdmin || (isStaff && !!profile?.can_manage_inventory),
      canVerify: isAdmin || (isStaff && !!profile?.can_verify_payments),
      signOut: async () => { await supabase.auth.signOut() },
      refreshProfile: loadProfile,
    }
  }, [session, profile, loading, profileFor]) // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return v
}
