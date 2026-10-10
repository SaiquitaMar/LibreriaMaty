import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAsync } from '../hooks/useAsync'
import { Badge, Empty, ErrorBox, Spinner } from '../components/ui'
import { money, dateTime, ORDER_STATUS, PAYMENT_STATUS } from '../lib/format'

export default function MyOrders() {
  const { session } = useAuth()
  const { data, loading, error } = useAsync(async () => {
    const { data, error } = await supabase.from('orders').select('code,status,payment_status,total,created_at')
      .eq('user_id', session!.user.id).order('created_at', { ascending: false })
    if (error) throw error
    return data as { code: string; status: string; payment_status: string; total: number; created_at: string }[]
  }, [session?.user.id])
  return (
    <div className="container section">
      <h1 style={{ fontSize: '2rem' }}>Mis pedidos</h1>
      <ErrorBox text={error} />
      {loading ? <Spinner /> : (data ?? []).length === 0 ? <Empty>Todavía no tienes pedidos con esta cuenta. <Link to="/catalogo">Ir al catálogo</Link></Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Código</th><th>Fecha</th><th>Estado</th><th>Pago</th><th className="num">Total</th></tr></thead>
          <tbody>{(data ?? []).map((o) => (
            <tr key={o.code}><td><Link to={`/pedido/${o.code}`}>{o.code}</Link></td><td>{dateTime(o.created_at)}</td>
              <td><Badge kind={o.status}>{ORDER_STATUS[o.status]}</Badge></td><td><Badge kind={o.payment_status}>{PAYMENT_STATUS[o.payment_status]}</Badge></td>
              <td className="num">{money(o.total)}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  )
}
