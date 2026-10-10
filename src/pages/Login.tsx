import { FormEvent, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { errText, friendly } from '../lib/api'
import { ErrorBox, Field } from '../components/ui'

export default function Login() {
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null); setInfo(null)
    try {
      if (mode === 'in') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        const { data: p } = await supabase.from('profiles').select('role,active').eq('id', data.user.id).maybeSingle()
        const staff = p && p.active && (p.role === 'admin' || p.role === 'employee')
        nav(loc.state?.from ?? (staff ? '/admin' : '/'), { replace: true })
      } else {
        if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.')
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() }, emailRedirectTo: window.location.origin + '/login' } })
        if (error) throw error
        if (data.session) nav('/', { replace: true })
        else setInfo('Cuenta creada. Revisa tu correo para confirmarla y luego ingresa.')
      }
    } catch (err) { setError(errText(err)) } finally { setBusy(false) }
  }

  const forgot = async () => {
    if (!email.trim()) { setError('Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".'); return }
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/restablecer' })
    if (error) setError(friendly(error.message)); else setInfo('Si el correo existe, te enviamos un enlace para crear una nueva contraseña.')
  }

  return (
    <div className="container section" style={{ maxWidth: 460 }}>
      <h1 style={{ fontSize: '2rem' }}>{mode === 'in' ? 'Ingresar' : 'Crear cuenta de cliente'}</h1>
      <p className="muted">{mode === 'in' ? 'Para el personal de la librería y clientes con cuenta. Comprar no requiere cuenta.' : 'Opcional: te permite ver el historial de tus pedidos.'}</p>
      <form className="panel" onSubmit={submit}>
        {mode === 'up' && <Field label="Nombre completo"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>}
        <Field label="Correo"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Contraseña"><input className="input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></Field>
        <ErrorBox text={error} />
        {info && <div className="alert ok">{info}</div>}
        <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Un momento…' : mode === 'in' ? 'Ingresar' : 'Crear cuenta'}</button>
        <div className="row spread mt">
          <button type="button" className="btn ghost small" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null); setInfo(null) }}>{mode === 'in' ? 'Crear cuenta de cliente' : 'Ya tengo cuenta'}</button>
          {mode === 'in' && <button type="button" className="btn ghost small" onClick={forgot}>Olvidé mi contraseña</button>}
        </div>
      </form>
    </div>
  )
}
