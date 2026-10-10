import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../hooks/useCart'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { rpc, errText } from '../lib/api'
import { money } from '../lib/format'
import { Empty, ErrorBox, Field } from '../components/ui'

export default function Checkout() {
  const cart = useCart()
  const { profile } = useAuth()
  const s = useSettings()
  const nav = useNavigate()
  const [f, setF] = useState({ name: '', phone: '', email: '', note: '', method: 'pickup', address: '', dnotes: '', pay: 'transfer' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (profile) setF((p) => ({ ...p, name: p.name || profile.full_name || '', phone: p.phone || profile.phone || '', email: p.email || profile.email || '' }))
  }, [profile])

  if (cart.lines.length === 0) {
    return <div className="container section"><Empty>No tienes productos en el carrito. <Link to="/catalogo">Ir al catálogo</Link></Empty></div>
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await rpc<{ code: string }>('create_order', {
        p_items: cart.lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        p_customer: { name: f.name, phone: f.phone, email: f.email, note: f.note },
        p_delivery: { method: f.method, address: f.address, notes: f.dnotes },
        p_payment_method: f.pay,
      })
      try {
        const prev = JSON.parse(localStorage.getItem('maty-orders') || '[]') as string[]
        localStorage.setItem('maty-orders', JSON.stringify([res.code, ...prev.filter((c) => c !== res.code)].slice(0, 10)))
      } catch { /* sin almacenamiento local */ }
      cart.clear()
      nav(`/pedido/${res.code}`, { replace: true })
    } catch (err) {
      setError(errText(err))
    } finally { setBusy(false) }
  }

  return (
    <div className="container section">
      <h1 style={{ fontSize: '2rem' }}>Confirma tu pedido</h1>
      <form className="twocol" onSubmit={submit}>
        <div className="stack">
          <div className="panel">
            <h3>Tus datos de contacto</h3>
            <div className="grid2">
              <Field label="Nombre completo"><input className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" /></Field>
              <Field label="Teléfono o WhatsApp"><input className="input" required inputMode="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" /></Field>
            </div>
            <Field label="Correo (opcional)"><input className="input" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" /></Field>
            <Field label="Nota para la librería (opcional)"><textarea className="input" value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>
          </div>
          <div className="panel">
            <h3>¿Cómo recibirás tu pedido?</h3>
            <label className="check"><input type="radio" name="m" checked={f.method === 'pickup'} onChange={() => set('method', 'pickup')} /> Recojo en la librería{s.pickup_address ? ` (${s.pickup_address})` : ''}</label>
            <label className="check"><input type="radio" name="m" checked={f.method === 'delivery'} onChange={() => set('method', 'delivery')} /> Delivery de mi confianza (yo lo coordino)</label>
            {f.method === 'delivery' && (
              <>
                <Field label="Dirección o referencia de entrega"><textarea className="input" required value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
                <Field label="Servicio de delivery que usarás (opcional)" hint="Te contactaremos por teléfono para coordinar la entrega.">
                  <input className="input" value={f.dnotes} onChange={(e) => set('dnotes', e.target.value)} />
                </Field>
              </>
            )}
          </div>
          <div className="panel">
            <h3>Forma de pago</h3>
            <label className="check"><input type="radio" name="p" checked={f.pay === 'transfer'} onChange={() => set('pay', 'transfer')} /> Transferencia bancaria</label>
            <label className="check"><input type="radio" name="p" checked={f.pay === 'qr'} onChange={() => set('pay', 'qr')} /> Pago con QR</label>
            <p className="small muted">Al confirmar verás los datos para pagar. Después subirás tu comprobante y el personal verificará el ingreso antes de preparar tu pedido.</p>
          </div>
        </div>
        <aside className="panel">
          <h3>Resumen</h3>
          {cart.lines.map((l) => <div key={l.product_id} className="row spread small"><span>{l.quantity} × {l.name}</span><span>{money(l.price * l.quantity)}</span></div>)}
          <hr style={{ border: 0, borderTop: '1px solid var(--line)' }} />
          <div className="row spread"><span>Total</span><span className="total">{money(cart.total)}</span></div>
          <ErrorBox text={error} />
          <button className="btn marker" style={{ width: '100%' }} disabled={busy}>{busy ? 'Creando pedido…' : 'Confirmar pedido'}</button>
          <p className="small muted mt">Reservamos tus productos mientras pagas. Si no pagas a tiempo, la reserva se libera.</p>
        </aside>
      </form>
    </div>
  )
}
