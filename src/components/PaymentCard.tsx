import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { rpc, errText } from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { Badge } from './ui'
import { money, dateTime, PAY_METHOD } from '../lib/format'
import { notify } from '../lib/toast'

export interface PaymentRow {
  id: string; order_id: string; method: string; amount: number; reference: string | null; receipt_path: string | null
  status: 'in_review' | 'approved' | 'rejected'; reviewed_at: string | null; reject_reason: string | null; created_at: string
}
const LABEL: Record<string, string> = { in_review: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado' }

export default function PaymentCard({ p, orderTotal, onDone }: { p: PaymentRow; orderTotal?: number; onDone: () => void }) {
  const { canVerify } = useAuth()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isPdf = !!p.receipt_path?.toLowerCase().endsWith('.pdf')

  useEffect(() => {
    let cancel = false
    if (!p.receipt_path) return
    supabase.storage.from('payment-receipts').createSignedUrl(p.receipt_path, 600).then(({ data }) => { if (!cancel) setUrl(data?.signedUrl ?? null) })
    return () => { cancel = true }
  }, [p.receipt_path])

  const approve = async () => {
    if (!window.confirm(`¿Confirmas que revisaste tu banco y que ingresaron ${money(p.amount)}? Al aprobar se descuenta el stock y el pedido queda confirmado.`)) return
    setBusy(true)
    try { await rpc('review_payment', { p_payment_id: p.id, p_approve: true }); notify('Pago aprobado'); onDone() } catch (e) { notify(errText(e), 'error') } finally { setBusy(false) }
  }
  const reject = async () => {
    const reason = window.prompt('Motivo del rechazo (el cliente lo verá):')
    if (!reason) return
    setBusy(true)
    try { await rpc('review_payment', { p_payment_id: p.id, p_approve: false, p_reason: reason }); notify('Comprobante rechazado'); onDone() } catch (e) { notify(errText(e), 'error') } finally { setBusy(false) }
  }

  return (
    <div className="panel">
      <div className="row spread">
        <div><b>{money(p.amount)}</b> · {PAY_METHOD[p.method] ?? p.method} <Badge kind={p.status}>{LABEL[p.status]}</Badge></div>
        <span className="small muted">{dateTime(p.created_at)}</span>
      </div>
      {orderTotal !== undefined && Number(orderTotal) !== Number(p.amount) && <div className="alert warn mt">El monto del pago no coincide con el total del pedido ({money(orderTotal)}).</div>}
      {p.reference && <p className="small mt">Referencia del cliente: <b>{p.reference}</b></p>}
      {p.reject_reason && <p className="small">Motivo del rechazo: {p.reject_reason}</p>}
      {p.receipt_path && (
        <div className="mt">
          {!url ? <span className="small muted">Cargando comprobante…</span> : isPdf
            ? <a className="btn ghost small" href={url} target="_blank" rel="noreferrer">Abrir comprobante (PDF)</a>
            : <a href={url} target="_blank" rel="noreferrer"><img className="receipt" src={url} alt="Comprobante de pago" /></a>}
        </div>
      )}
      {p.status === 'in_review' && (
        canVerify ? (
          <div className="row mt">
            <button className="btn" disabled={busy} onClick={approve}>Aprobar: el dinero ingresó</button>
            <button className="btn danger" disabled={busy} onClick={reject}>Rechazar</button>
          </div>
        ) : <p className="small muted mt">No tienes permiso para verificar pagos.</p>
      )}
    </div>
  )
}
