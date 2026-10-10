import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAsync } from '../../hooks/useAsync'
import PaymentCard, { PaymentRow } from '../../components/PaymentCard'
import { Empty, ErrorBox, Spinner } from '../../components/ui'

export default function Payments() {
  const [tab, setTab] = useState<'in_review' | 'approved' | 'rejected'>('in_review')
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('payments').select('*, orders(code, customer_name, customer_phone, total, status)')
      .eq('status', tab).order('created_at', { ascending: tab === 'in_review' }).limit(60)
    if (error) throw error
    return data as any[]
  }, [tab])
  return (
    <div>
      <h1 style={{ fontSize: '2rem' }}>Pagos</h1>
      <div className="alert info">Un comprobante subido <b>no significa que el dinero haya llegado</b>. Antes de aprobar, revisa tu banco o app y confirma que el ingreso existe por el monto exacto.</div>
      <div className="tabs">
        {([['in_review', 'Por verificar'], ['approved', 'Aprobados'], ['rejected', 'Rechazados']] as const).map(([k, l]) => (
          <button key={k} className={'chip' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <ErrorBox text={error} />
      {loading ? <Spinner /> : (data ?? []).length === 0 ? <Empty>No hay pagos en esta lista.</Empty> : (
        <div className="stack">
          {(data ?? []).map((p) => (
            <div key={p.id}>
              <p style={{ margin: '0 0 .4rem' }}><b>Pedido <Link to="/admin/pedidos">{p.orders?.code}</Link></b> · {p.orders?.customer_name} · {p.orders?.customer_phone}</p>
              <PaymentCard p={p as PaymentRow} orderTotal={p.orders?.total} onDone={reload} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
