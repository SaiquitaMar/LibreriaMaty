import { supabase } from './supabase'

export function friendly(message: string): string {
  const m = message || ''
  if (m.includes('duplicate key')) return 'Ya existe un registro con ese código o nombre.'
  if (m.includes('violates row-level security')) return 'No tienes permiso para hacer esto.'
  if (m.includes('violates foreign key')) return 'No se puede completar: este registro está en uso en otras operaciones.'
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'No hay conexión con el servidor. Revisa tu internet.'
  if (m.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (m.includes('Email not confirmed')) return 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.'
  if (m.includes('already registered')) return 'Ese correo ya está registrado.'
  if (m.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.'
  if (m.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
  return m
}

export async function rpc<T = any>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(friendly(error.message))
  return data as T
}

export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(friendly(res.error.message))
  return res.data as T
}

export function errText(e: unknown): string {
  return friendly(e instanceof Error ? e.message : String(e))
}

export function one<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null
  return Array.isArray(x) ? x[0] ?? null : x
}

export function extOf(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  return file.type === 'application/pdf' ? 'pdf' : 'jpg'
}

export function randomId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
