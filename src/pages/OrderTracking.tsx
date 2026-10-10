import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { rpc, errText, extOf, randomId } from '../lib/api'
import { useAsync } from '../hooks/useAsync'
import { useSettings } from '../hooks/useSettings'
import { Badge, ErrorBox, Field, Spinner } from '../components/ui'
import { money, dateTime, ORDER_STATUS, PAYMENT_STATUS, PREP_STATUS, DELIVERY_STATUS, DELIVERY_METHOD } from '../lib/format'
import { notify } from '../lib/toast'
import type { PublicOrder } from '../types'

function Lookup() {
  const nav = useNavigate()
  const [code, setCode] = useState('')
  let saved: string[] = []
  try { saved = JSON.parse(localStorage.getItem('maty-orders') || '[]') } catch { /* nada */ }
  const go = (e: FormEvent) => { e.preventDefault(); if (code.trim()) nav(`/pedido/${code.trim().toUpperCase()}`) }
  return (
    <div className="container section" style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: '2rem' }}>Seguir mi pedido</h1>
      <form className="panel" onSubmit={go}>
        <Field label="Código de pedido" hint="Lo recibiste al confirmar tu compra. Empieza con MATY-"><input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MATY-XXXXXXXXXXXX" /></Field>
        <button className="btn">Ver estado</button>
      </form>
      {saved.length > 0 && (
        <div className="panel mt"><h3>Pedidos recientes en este dispositivo</h3>
          {saved.map((c) => <p key={c} style={{ margin: '.3rem 0' }}><Link to={`/pedido/${c}`}>{c}</Link></p>)}
        </div>
      )}
    </div>
  )
}

function stepClass(kind: 'done' | 'now' | 'wait' | 'bad') { return 'step ' + kind }

export default function OrderTracking() {
  const { codigo } = useParams()
  return codigo ? <Detail code={codigo.toUpperCase()} /> : <Lookup />
}

function Detail({ code }: { code: string }) {
  const s = useSettings()
  const order = useAsync(() => rpc<PublicOrder | null>('get_order_public', { p_code: code }), [code])
  const [file, setFile] = useState<File | null>(null)
  const [ref, setRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => order.reload(), 30000)
    return () => window.clearInterval(t)
  }, [order.reload]) // eslint-disable-line react-hooks/exhaustive-deps

  if (order.loading && !order.data) return <Spinner />
  const o = order.data
  if (!o) return <div className="container section"><ErrorBox text={order.error} /><div className="alert warn">No encontramos un pedido con el código <span className="code">{code}</span>. Revisa que esté bien escrito.</div><Link to="/pedido">Probar con otro código</Link></div>

  const cancelled = o.status === 'cancelled'
  const canPay = o.status === 'pending' && (o.payment_status === 'unpaid' || o.payment_status === 'rejected')
  const pay = cancelled ? 'bad' : o.payment_status === 'approved' ? 'done' : o.payment_status === 'rejected' ? 'bad' : 'now'
  const prep = o.prep_status === 'prepared' ? 'done' : o.prep_status === 'preparing' || o.status === 'confirmed' ? 'now' : 'wait'
  const del = o.delivery_status === 'delivered' ? 'done' : o.delivery_status === 'ready_pickup' || o.delivery_status === 'coordinating' ? 'now' : 'wait'

  const upload = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) { setErr('Elige la imagen o el PDF de tu comprobante.'); return }
    if (file.size > 5 * 1024 * 1024) { setErr('El archivo pesa más de 5 MB. Sube una foto más liviana.'); return }
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type)) { setErr('Solo se aceptan fotos (JPG, PNG, WEBP) o PDF.'); return }
    setBusy(true); setErr(null)
    try {
      const path = `${o.code}/${randomId()}.${extOf(file)}`
      const up = await supabase.storage.from('payment-receipts').upload(path, file, { contentType: file.type })
      if (up.error) throw new Error(up.error.message.includes('row-level') ? 'Ya no puedes subir comprobantes para este pedido.' : up.error.message)
      await rpc('submit_receipt', { p_code: o.code, p_reference: ref, p_path: path })
      notify('Comprobante enviado. Lo revisaremos pronto.')
      setFile(null); setRef('')
      order.reload()
    } catch (e2) { setErr(errText(e2)) } finally { setBusy(false) }
  }

  const cancel = async () => {
    if (!window.confirm('¿Seguro que quieres cancelar este pedido?')) return
    try { await rpc('customer_cancel_order', { p_code: o.code }); notify('Pedido cancelado.'); order.reload() } catch (e2) { setErr(errText(e2)) }
  }

  return (
    <div className="container section">
      <h1 style={{ fontSize: '2rem' }}>Tu pedido</h1>
      <p>Código: <span className="code">{o.code}</span> <span className="small muted">Guárdalo para consultar el estado.</span></p>
      {cancelled && <div className="alert error"><b>Pedido cancelado.</b> {o.cancel_reason}</div>}
      <div className="steps" aria-label="Avance del pedido">
        <div className={stepClass(cancelled ? 'bad' : 'done')}><b>Pedido</b><br />{ORDER_STATUS[o.status]}</div>
        <div className={stepClass(pay)}><b>Pago</b><br />{PAYMENT_STATUS[o.payment_status]}</div>
        <div className={stepClass(prep)}><b>Preparación</b><br />{PREP_STATUS[o.prep_status]}</div>
        <div className={stepClass(del)}><b>Entrega</b><br />{DELIVERY_STATUS[o.delivery_status ?? 'pending']}</div>
      </div>
      <div className="twocol">
        <div className="stack">
          {o.payment_status === 'in_review' && <div className="alert info">Recibimos tu comprobante. El personal está verificando que el dinero haya ingresado. Tu pedido <b>aún no está pagado</b> hasta esa verificación.</div>}
          {o.payment_status === 'rejected' && o.status === 'pending' && <div className="alert error"><b>Rechazamos tu comprobante.</b> Motivo: {o.reject_reason || 'no indicado'}. Puedes subir uno nuevo abajo.</div>}
          {o.status === 'confirmed' && o.delivery_status === 'ready_pickup' && <div className="alert ok"><b>¡Tu pedido está listo para recoger!</b> {s.pickup_address && <>Te esperamos en {s.pickup_address}. </>}{s.pickup_hours}</div>}
          {o.status === 'confirmed' && o.delivery_status === 'coordinating' && <div className="alert ok"><b>Tu pedido está listo.</b> Te contactaremos para coordinar el delivery{o.delivery_address ? ` a: ${o.delivery_address}` : ''}.</div>}
          {canPay && (
            <div className="panel">
              <h3>Paga y sube tu comprobante</h3>
              <p>Monto a pagar: <b>{money(o.total)}</b> por {o.payment_method === 'qr' ? 'QR' : 'transferencia bancaria'}.</p>
              <p style={{ whiteSpace: 'pre-line' }}>{s.payment_instructions}</p>
              {s.qr_image_url && <img src={s.qr_image_url} alt="Código QR para pagar" style={{ width: 220, margin: '0 0 1rem' }} />}
              {o.reserved_until && <p className="small muted">Reservamos tus productos hasta el {dateTime(o.reserved_until)}.</p>}
              <form onSubmit={upload}>
                <Field label="Comprobante (foto o PDF, máximo 5 MB)"><input className="input" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
                <Field label="Número de referencia o transacción (opcional)"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
                <ErrorBox text={err} />
                <div className="row"><button className="btn marker" disabled={busy}>{busy ? 'Enviando…' : 'Enviar comprobante'}</button>
                  <button type="button" className="btn ghost" onClick={cancel}>Cancelar pedido</button></div>
              </form>
            </div>
          )}
          {!canPay && err && <ErrorBox text={err} />}
          <div className="panel">
            <h3>Productos</h3>
            <div className="tablewrap"><table><tbody>
              {o.items.map((i, idx) => <tr key={idx}><td>{i.quantity} × {i.name}</td><td className="num">{money(i.line_total)}</td></tr>)}
              {o.discount_total > 0 && <tr><td>Descuentos</td><td className="num">− {money(o.discount_total)}</td></tr>}
              <tr><td><b>Total</b></td><td className="num"><b>{money(o.total)}</b></td></tr>
            </tbody></table></div>
          </div>
        </div>
        <aside className="stack">
          <div className="panel">
            <h3>Entrega</h3>
            <p>{DELIVERY_METHOD[o.delivery_method]}</p>
            {o.delivery_address && <p className="small">{o.delivery_address}</p>}
            {o.shipping_cost !== null && <p className="small">Costo de envío registrado: {money(o.shipping_cost)}</p>}
            <p className="small muted">Pedido creado el {dateTime(o.created_at)}</p>
          </div>
          <div className="panel">
            <h3>Historial</h3>
            <ul className="timeline">
              {o.history.map((h, i) => (
                <li key={i}><Badge kind={h.to_status}>{({ ...ORDER_STATUS, ...PAYMENT_STATUS, ...PREP_STATUS, ...DELIVERY_STATUS } as Record<string, string>)[h.to_status] ?? h.to_status}</Badge>
                  <div className="small muted">{dateTime(h.at)}</div></li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}
