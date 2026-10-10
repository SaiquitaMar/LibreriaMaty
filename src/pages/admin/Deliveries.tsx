import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { rpc, errText } from '../../lib/api'
import { useAsync } from '../../hooks/useAsync'
import { Badge, Empty, ErrorBox, Spinner } from '../../components/ui'
import { money, dateTime, DELIVERY_STATUS, DELIVERY_METHOD } from '../../lib/format'
import { notify } from '../../lib/toast'

export default function Deliveries() {
  const [tab, setTab] = useState<'now' | 'wait' | 'done'>('now')
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('deliveries').select('*, orders(id, code, customer_name, customer_phone, total, status, prep_status)').order('created_at', { ascending: false }).limit(150)
    if (error) throw error
    return data as any[]
  }, [])
  const rows = (data ?? []).filter((d) => d.orders?.status !== 'cancelled' && (tab === 'now' ? ['ready_pickup', 'coordinating'].includes(d.status) : tab === 'done' ? d.status === 'delivered' : d.status === 'pending' && d.orders?.status === 'confirmed'))

  const deliver = async (d: any) => {
    if (!window.confirm(`¿Registrar la entrega del pedido ${d.orders.code}?`)) return
    try { await rpc('register_delivery', { p_order_id: d.orders.id, p_note: null }); notify('Entrega registrada'); reload() } catch (e) { notify(errText(e), 'error') }
  }
  const saveShip = async (d: any) => {
    const v = window.prompt('Costo del envío en Bs (deja vacío si no se conoce):', d.shipping_cost ?? '')
    if (v === null) return
    try { await rpc('update_delivery', { p_order_id: d.orders.id, p_shipping_cost: v.trim() === '' ? null : Number(v), p_notes: d.notes }); notify('Costo guardado'); reload() } catch (e) { notify(errText(e), 'error') }
  }

  return (
    <div>
      <h1 style={{ fontSize: '2rem' }}>Entregas</h1>
      <div className="tabs">
        <button className={'chip' + (tab === 'now' ? ' on' : '')} onClick={() => setTab('now')}>Listos para entregar</button>
        <button className={'chip' + (tab === 'wait' ? ' on' : '')} onClick={() => setTab('wait')}>En preparación</button>
        <button className={'chip' + (tab === 'done' ? ' on' : '')} onClick={() => setTab('done')}>Entregados</button>
      </div>
      <ErrorBox text={error} />
      {loading && !data ? <Spinner /> : rows.length === 0 ? <Empty>No hay entregas en esta lista.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Modalidad</th><th>Estado</th><th className="num">Envío</th><th /></tr></thead>
          <tbody>{rows.map((d) => (
            <tr key={d.id}>
              <td><b>{d.orders?.code}</b><div className="small muted">{money(d.orders?.total)}</div></td>
              <td>{d.orders?.customer_name}<div className="small muted">{d.contact_phone}</div></td>
              <td>{DELIVERY_METHOD[d.method]}{d.address && <div className="small">{d.address}</div>}{d.notes && <div className="small muted">{d.notes}</div>}</td>
              <td><Badge kind={d.status}>{DELIVERY_STATUS[d.status]}</Badge>{d.delivered_at && <div className="small muted">{dateTime(d.delivered_at)}</div>}</td>
              <td className="num">{d.shipping_cost !== null ? money(d.shipping_cost) : '—'}</td>
              <td className="row" style={{ flexWrap: 'nowrap' }}>
                {d.status !== 'delivered' && <button className="btn ghost small" onClick={() => saveShip(d)}>Costo envío</button>}
                {['ready_pickup', 'coordinating'].includes(d.status) && <button className="btn small" onClick={() => deliver(d)}>Registrar entrega</button>}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  )
}
