import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { errText } from '../lib/api'
import { ErrorBox, Field, Spinner } from '../components/ui'
import { notify } from '../lib/toast'

export default function ResetPassword() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <Spinner />
  if (!session) return <div className="container section"><div className="alert warn">El enlace venció o ya fue usado. Vuelve a pedir uno desde “Olvidé mi contraseña”.</div></div>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) { setError(errText(error)); return }
    notify('Contraseña actualizada.')
    nav('/', { replace: true })
  }
  return (
    <div className="container section" style={{ maxWidth: 460 }}>
      <h1 style={{ fontSize: '2rem' }}>Nueva contraseña</h1>
      <form className="panel" onSubmit={submit}>
        <Field label="Escribe tu nueva contraseña (mínimo 6 caracteres)"><input className="input" type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <ErrorBox text={error} />
        <button className="btn" disabled={busy}>Guardar contraseña</button>
      </form>
    </div>
  )
}
