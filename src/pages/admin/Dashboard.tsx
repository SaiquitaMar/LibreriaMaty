import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useAsync } from '../../hooks/useAsync'
import { ErrorBox, Spinner } from '../../components/ui'
import { money } from '../../lib/format'

export default function Dashboard() {
  const { profile, isAdmin, canVerify } = useAuth()
  const { data, loading, error } = useAsync(async () => {
    await supabase.rpc('release_expired_reservations')
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const iso = start.toISOString()
    const count = (q: any) => q.then((r: any) => r.count ?? 0)
    const [review, toPrepare, pending, products, sales, orders] = await Promise.all([
      count(supabase.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'in_review')),
      count(supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'confirmed').neq('prep_status', 'prepared')),
      count(supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      supabase.from('products').select('id,code,name,stock,reserved,min_stock').eq('active', true),
      isAdmin ? supabase.from('sales').select('total').eq('status', 'completed').gte('created_at', iso) : Promise.resolve({ data: [] as any[] }),
      isAdmin ? supabase.from('orders').select('total').in('status', ['confirmed', 'completed']).gte('confirmed_at', iso) : Promise.resolve({ data: [] as any[] }),
    ])
    const low = ((products as any).data ?? []).filter((p: any) => p.stock <= p.min_stock).sort((a: any, b: any) => a.stock - b.stock)
    const sum = (rows: any[]) => rows.reduce((a, r) => a + Number(r.total), 0)
    return { review, toPrepare, pending, low, store: sum((sales as any).data ?? []), online: sum((orders as any).data ?? []) }
  }, [])

  return (
    <div>
      <h1 style={{ fontSize: '2rem' }}>Hola, {profile?.full_name?.split(' ')[0] || 'bienvenido'}</h1>
      <ErrorBox text={error} />
      {loading || !data ? <Spinner /> : (
        <>
          <div className="cards">
            {canVerify && <Link to="/admin/pagos" className={'stat ' + (data.review > 0 ? 'warn' : '')} style={{ textDecoration: 'none', color: 'inherit' }}><div className="n">{data.review}</div><div className="l">Pagos por verificar</div></Link>}
            <Link to="/admin/pedidos" className="stat" style={{ textDecoration: 'none', color: 'inherit' }}><div className="n">{data.toPrepare}</div><div className="l">Pedidos por preparar</div></Link>
            <Link to="/admin/pedidos" className="stat" style={{ textDecoration: 'none', color: 'inherit' }}><div className="n">{data.pending}</div><div className="l">Pedidos esperando pago</div></Link>
            <Link to="/admin/inventario" className={'stat ' + (data.low.length > 0 ? 'warn' : 'good')} style={{ textDecoration: 'none', color: 'inherit' }}><div className="n">{data.low.length}</div><div className="l">Productos con poco stock</div></Link>
          </div>
          {isAdmin && (
            <div className="cards">
              <div className="stat good"><div className="n">{money(data.store)}</div><div className="l">Vendido hoy en tienda</div></div>
              <div className="stat good"><div className="n">{money(data.online)}</div><div className="l">Pedidos en línea confirmados hoy</div></div>
            </div>
          )}
          <div className="row mb"><Link className="btn marker" to="/admin/ventas">Nueva venta</Link><Link className="btn ghost" to="/admin/pedidos">Ver pedidos</Link></div>
          <h2>Alertas de stock</h2>
          {data.low.length === 0 ? <div className="alert ok">Todos los productos tienen stock suficiente.</div> : (
            <div className="tablewrap"><table><thead><tr><th>Código</th><th>Producto</th><th className="num">Stock</th><th className="num">Mínimo</th></tr></thead>
              <tbody>{data.low.slice(0, 15).map((p: any) => <tr key={p.id}><td>{p.code}</td><td>{p.name}</td><td className="num"><b>{p.stock}</b></td><td className="num">{p.min_stock}</td></tr>)}</tbody></table></div>
          )}
        </>
      )}
    </div>
  )
}
