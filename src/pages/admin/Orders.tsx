import { FormEvent, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { rpc, errText, one } from '../../lib/api'
import { useAsync } from '../../hooks/useAsync'
import PaymentCard, { PaymentRow } from '../../components/PaymentCard'
import { Badge, Empty, ErrorBox, Field, Modal, Spinner } from '../../components/ui'
import { money, dateTime, ORDER_STATUS, PAYMENT_STATUS, PREP_STATUS, DELIVERY_STATUS, DELIVERY_METHOD } from '../../lib/format'
import { notify } from '../../lib/toast'

const TABS: [string, string][] = [['all', 'Todos'], ['pending', 'Esperando pago'], ['toprep', 'Por preparar'], ['ready', 'Listos'], ['done', 'Entregados'], ['cancelled', 'Cancelados']]
const ALL_LABELS: Record<string, string> = { ...ORDER_STATUS, ...PAYMENT_STATUS, ...PREP_STATUS, ...DELIVERY_STATUS }

export default function Orders() {
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('orders').select('*, order_items(*), payments(*), deliveries(*), order_history(*)').order('created_at', { ascending: false }).limit(150)
    if (error) throw error
    return data as any[]
  }, [])
  const rows = (data ?? []).filter((o) => {
    const t = tab === 'all' || (tab === 'pending' && o.status === 'pending') || (tab === 'toprep' && o.status === 'confirmed' && o.prep_status !== 'prepared')
      || (tab === 'ready' && o.status === 'confirmed' && o.prep_status === 'prepared') || (tab === 'done' && o.status === 'completed') || (tab === 'cancelled' && o.status === 'cancelled')
    return t && `${o.code} ${o.customer_name} ${o.customer_phone}`.toLowerCase().includes(q.toLowerCase())
  })
  const open = (data ?? []).find((o) => o.id === openId)

  return (
    <div>
      <h1 style={{ fontSize: '2rem' }}>Pedidos en línea</h1>
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>
      <input className="input mb" style={{ maxWidth: 360 }} placeholder="Buscar por código, nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorBox text={error} />
      {loading && !data ? <Spinner /> : rows.length === 0 ? <Empty>No hay pedidos en esta lista.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Código</th><th>Cliente</th><th>Fecha</th><th>Pedido</th><th>Pago</th><th>Preparación</th><th>Entrega</th><th className="num">Total</th></tr></thead>
          <tbody>{rows.map((o) => {
            const d = one<any>(o.deliveries)
            return (
              <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(o.id)}>
                <td><b>{o.code}</b></td><td>{o.customer_name}<div className="small muted">{o.customer_phone}</div></td><td>{dateTime(o.created_at)}</td>
                <td><Badge kind={o.status}>{ORDER_STATUS[o.status]}</Badge></td><td><Badge kind={o.payment_status}>{PAYMENT_STATUS[o.payment_status]}</Badge></td>
                <td><Badge kind={o.prep_status}>{PREP_STATUS[o.prep_status]}</Badge></td><td><Badge kind={d?.status ?? 'pending'}>{DELIVERY_STATUS[d?.status ?? 'pending']}</Badge></td>
                <td className="num">{money(o.total)}</td>
              </tr>
            )
          })}</tbody>
        </table></div>
      )}
      {open && <OrderDetail o={open} onClose={() => setOpenId(null)} reload={reload} />}
    </div>
  )
}

function OrderDetail({ o, onClose, reload }: { o: any; onClose: () => void; reload: () => void }) {
  const d = one<any>(o.deliveries)
  const [ship, setShip] = useState(d?.shipping_cost ?? '')
  const [dnotes, setDnotes] = useState(d?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const items: any[] = o.order_items ?? []
  const pays: PaymentRow[] = [...(o.payments ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const hist: any[] = [...(o.order_history ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    try { await fn(); notify(msg); reload() } catch (e) { notify(errText(e), 'error') } finally { setBusy(false) }
  }
  const saveDelivery = (e: FormEvent) => {
    e.preventDefault()
    run(() => rpc('update_delivery', { p_order_id: o.id, p_shipping_cost: ship === '' ? null : Number(ship), p_notes: dnotes }), 'Datos de entrega guardados')
  }
  const cancel = () => {
    const reason = window.prompt('Motivo de la cancelación:')
    if (reason) run(() => rpc('cancel_order', { p_order_id: o.id, p_reason: reason }), 'Pedido cancelado')
  }
  const deliver = () => {
    if (window.confirm('¿Confirmas que el pedido ya fue entregado al cliente (o al delivery)?')) run(() => rpc('register_delivery', { p_order_id: o.id, p_note: null }), 'Entrega registrada')
  }

  return (
    <Modal title={`Pedido ${o.code}`} onClose={onClose} wide>
      <div className="row mb">
        <Badge kind={o.status}>{ORDER_STATUS[o.status]}</Badge><Badge kind={o.payment_status}>{PAYMENT_STATUS[o.payment_status]}</Badge>
        <Badge kind={o.prep_status}>{PREP_STATUS[o.prep_status]}</Badge><Badge kind={d?.status ?? 'pending'}>{DELIVERY_STATUS[d?.status ?? 'pending']}</Badge>
      </div>
      {o.cancel_reason && <div className="alert error">Cancelado: {o.cancel_reason}</div>}
      <div className="grid2">
        <div>
          <h3>Cliente</h3>
          <p>{o.customer_name}<br />Tel: {o.customer_phone}{o.customer_email && <><br />{o.customer_email}</>}{o.customer_note && <><br /><i>“{o.customer_note}”</i></>}</p>
          <h3>Entrega</h3>
          <p>{DELIVERY_METHOD[o.delivery_method]}{d?.address && <><br />{d.address}</>}</p>
        </div>
        <div>
          <h3>Productos</h3>
          <div className="tablewrap"><table><tbody>
            {items.map((i) => <tr key={i.id}><td>{i.quantity} × {i.product_name}</td><td className="num">{money(i.line_total)}</td></tr>)}
            <tr><td><b>Total</b></td><td className="num"><b>{money(o.total)}</b></td></tr>
          </tbody></table></div>
        </div>
      </div>

      <h3 className="mt">Pagos</h3>
      {pays.length === 0 ? <p className="muted">El cliente todavía no subió comprobante.</p> : <div className="stack">{pays.map((p) => <PaymentCard key={p.id} p={p} orderTotal={o.total} onDone={reload} />)}</div>}

      {o.status === 'confirmed' && (
        <div className="panel mt">
          <h3>Preparación y entrega</h3>
          <div className="row">
            {o.prep_status === 'not_started' && <button className="btn" disabled={busy} onClick={() => run(() => rpc('set_prep_status', { p_order_id: o.id, p_to: 'preparing' }), 'Preparación iniciada')}>Empezar a preparar</button>}
            {o.prep_status === 'preparing' && <button className="btn" disabled={busy} onClick={() => run(() => rpc('set_prep_status', { p_order_id: o.id, p_to: 'prepared' }), 'Pedido preparado')}>Marcar como preparado</button>}
            {o.prep_status === 'prepared' && <button className="btn marker" disabled={busy} onClick={deliver}>Registrar entrega final</button>}
          </div>
        </div>
      )}
      {o.status !== 'cancelled' && d && (
        <form className="panel mt" onSubmit={saveDelivery}>
          <h3>Datos de coordinación</h3>
          <div className="grid2">
            <Field label="Costo del envío (Bs, si se conoce)"><input className="input" type="number" min="0" step="0.01" value={ship} onChange={(e) => setShip(e.target.value)} /></Field>
            <Field label="Notas de entrega (servicio de delivery, horario…)"><input className="input" value={dnotes} onChange={(e) => setDnotes(e.target.value)} /></Field>
          </div>
          <button className="btn ghost small" disabled={busy}>Guardar datos</button>
        </form>
      )}
      <h3 className="mt">Historial</h3>
      <ul className="timeline">{hist.map((h) => (
        <li key={h.id}><b>{ALL_LABELS[h.to_status] ?? h.to_status}</b> <span className="small muted">· {dateTime(h.created_at)}{h.note ? ` · ${h.note}` : ''}</span></li>
      ))}</ul>
      {(o.status === 'pending' || o.status === 'confirmed') && <div className="mt"><button className="btn danger small" disabled={busy} onClick={cancel}>Cancelar pedido</button></div>}
    </Modal>
  )
}
