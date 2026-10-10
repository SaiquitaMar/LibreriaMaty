import { ReactNode, useEffect, useState } from 'react'
import { subscribeToasts } from '../lib/toast'
import { badgeTone } from '../lib/format'

export function Spinner() { return <div className="spinner" role="status" aria-label="Cargando" /> }

export function ErrorBox({ text }: { text: string | null }) {
  return text ? <div className="alert error" role="alert">{text}</div> : null
}

export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div> }

export function Badge({ kind, children }: { kind: string; children: ReactNode }) {
  return <span className={'badge ' + badgeTone(kind)}>{children}</span>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row spread mb">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Cerrar">Cerrar</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; text: string; kind: 'ok' | 'error' }[]>([])
  useEffect(() => subscribeToasts((t) => {
    setItems((prev) => [...prev, t])
    window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.kind === 'error' ? 6000 : 3500)
  }), [])
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className={'toast ' + (t.kind === 'error' ? 'error' : '')}>{t.text}</div>)}
    </div>
  )
}

export function ConfigMissing() {
  return (
    <div className="container section">
      <div className="alert warn">
        <h2>Falta conectar la base de datos</h2>
        <p>La aplicación no encontró las dos variables de conexión. En Netlify ve a <b>Site configuration → Environment variables</b> y crea:</p>
        <p><span className="code">VITE_SUPABASE_URL</span> y <span className="code">VITE_SUPABASE_ANON_KEY</span></p>
        <p>Después ve a <b>Deploys → Trigger deploy → Clear cache and deploy site</b>.</p>
      </div>
    </div>
  )
}
