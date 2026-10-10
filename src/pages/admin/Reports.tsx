import { FormEvent, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { rpc, errText } from '../../lib/api'
import { useAsync } from '../../hooks/useAsync'
import { ErrorBox, Field, Spinner } from '../../components/ui'
import { money, toInputDate, ORDER_STATUS, dateOnly } from '../../lib/format'
import { notify } from '../../lib/toast'

const startOf = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }

export default function Reports() {
  const today = new Date()
  const [from, setFrom] = useState(toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo] = useState(toInputDate(today))
  const [applied, setApplied] = useState({ from, to })

  const rep = useAsync(async () => {
    const pFrom = startOf(applied.from)
    const pTo = new Date(startOf(applied.to).getTime() + 86400000)
    const [summary, exp, purch, prods] = await Promise.all([
      rpc<any>('report_summary', { p_from: pFrom.toISOString(), p_to: pTo.toISOString() }),
      supabase.from('expenses').select('*').gte('expense_date', applied.from).lte('expense_date', applied.to).order('expense_date', { ascending: false }),
      supabase.from('purchases').select('total, received_at').eq('status', 'received').gte('received_at', pFrom.toISOString()).lt('received_at', pTo.toISOString()),
      supabase.from('products').select('id,name,code,stock,min_stock,active,product_costs(cost)').eq('active', true),
    ])
    const purchases = (purch.data ?? []).reduce((a: number, p: any) => a + Number(p.total), 0)
    const rows = (prods.data ?? []) as any[]
    const low = rows.filter((p) => p.stock <= p.min_stock)
    const noCost = rows.filter((p) => { const c = Array.isArray(p.product_costs) ? p.product_costs[0] : p.product_costs; return !c || Number(c.cost) === 0 }).length
    return { s: summary, expenses: (exp.data ?? []) as any[], purchases, low, noCost }
  }, [applied.from, applied.to])

  const apply = (e: FormEvent) => { e.preventDefault(); setApplied({ from, to }) }
  const d = rep.data
  const gross = d ? Number(d.s.revenue) - Number(d.s.cost) : 0
  const net = d ? gross - Number(d.s.expenses) : 0

  const [exForm, setExForm] = useState({ description: '', amount: '', category: '', date: toInputDate(today) })
  const addExpense = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('expenses').insert({ description: exForm.description.trim(), amount: Number(exForm.amount), category: exForm.category || null, expense_date: exForm.date })
    if (error) { notify(errText(new Error(error.message)), 'error'); return }
    notify('Gasto registrado'); setExForm({ ...exForm, description: '', amount: '' }); rep.reload()
  }
  const delExpense = async (id: string) => {
    if (!window.confirm('¿Eliminar este gasto?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) notify(errText(new Error(error.message)), 'error'); else rep.reload()
  }

  return (
    <div>
      <h1 style={{ fontSize: '2rem' }}>Reportes</h1>
      <form className="row mb" style={{ alignItems: 'flex-end' }} onSubmit={apply}>
        <Field label="Desde"><input className="input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta"><input className="input" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <button className="btn" style={{ marginBottom: '.9rem' }}>Ver reporte</button>
      </form>
      <ErrorBox text={rep.error} />
      {rep.loading && !d ? <Spinner /> : d && (
        <>
          <div className="alert info"><b>Ojo:</b> el total vendido no es ganancia. La ganancia se calcula restando el costo de lo vendido y, para la ganancia neta, también los gastos que registres abajo.</div>
          {d.noCost > 0 && <div className="alert warn">{d.noCost} producto(s) activos no tienen costo registrado. Mientras no lo tengan, la ganancia de esos productos aparece más alta de lo real.</div>}
          <div className="cards">
            <div className="stat"><div className="n">{money(d.s.revenue)}</div><div className="l">Total vendido (tienda {money(d.s.revenue_store)} + en línea {money(d.s.revenue_online)})</div></div>
            <div className="stat"><div className="n">{money(d.s.discounts)}</div><div className="l">Descuentos y ofertas otorgados</div></div>
            <div className="stat"><div className="n">{money(d.s.cost)}</div><div className="l">Costo de los productos vendidos</div></div>
            <div className="stat good"><div className="n">{money(gross)}</div><div className="l">Ganancia bruta estimada</div></div>
            <div className="stat"><div className="n">{money(d.s.expenses)}</div><div className="l">Gastos registrados ({d.s.expenses_count})</div></div>
            <div className={'stat ' + (net >= 0 ? 'good' : 'warn')}><div className="n">{money(net)}</div><div className="l">{d.s.expenses_count > 0 ? 'Ganancia neta estimada' : 'Sin gastos registrados: aún no es una ganancia neta real'}</div></div>
          </div>
          <div className="cards">
            <div className="stat"><div className="n">{money(d.purchases)}</div><div className="l">Compras de mercadería recibidas</div></div>
            <div className="stat"><div className="n">{d.s.pending_payments}</div><div className="l">Pagos pendientes de verificación (ahora)</div></div>
            <div className="stat"><div className="n">{d.s.voided_sales}</div><div className="l">Ventas anuladas en el período</div></div>
            <div className="stat"><div className="n">{d.low.length}</div><div className="l">Productos con stock bajo (ahora)</div></div>
          </div>
          <div className="twocol">
            <div className="stack">
              <div><h2>Productos más vendidos</h2>
                <div className="tablewrap"><table><thead><tr><th>Producto</th><th className="num">Unidades</th><th className="num">Importe</th></tr></thead>
                  <tbody>{d.s.top_products.length === 0 ? <tr><td colSpan={3} className="muted">Sin ventas en el período.</td></tr> : d.s.top_products.map((p: any, i: number) => <tr key={i}><td>{p.name}</td><td className="num">{p.qty}</td><td className="num">{money(p.total)}</td></tr>)}</tbody></table></div></div>
              <div><h2>Ventas por empleado (tienda)</h2>
                <div className="tablewrap"><table><thead><tr><th>Empleado</th><th className="num">Ventas</th><th className="num">Importe</th></tr></thead>
                  <tbody>{d.s.by_employee.length === 0 ? <tr><td colSpan={3} className="muted">Sin ventas en el período.</td></tr> : d.s.by_employee.map((p: any, i: number) => <tr key={i}><td>{p.name}</td><td className="num">{p.sales}</td><td className="num">{money(p.total)}</td></tr>)}</tbody></table></div></div>
              <div><h2>Pedidos en línea creados en el período</h2>
                <div className="tablewrap"><table><tbody>{Object.keys(d.s.orders_by_status).length === 0 ? <tr><td className="muted">Sin pedidos.</td></tr> : Object.entries(d.s.orders_by_status).map(([k, n]) => <tr key={k}><td>{ORDER_STATUS[k] ?? k}</td><td className="num">{String(n)}</td></tr>)}</tbody></table></div></div>
            </div>
            <div className="stack">
              <form className="panel" onSubmit={addExpense}>
                <h3>Registrar un gasto</h3>
                <Field label="Descripción"><input className="input" required value={exForm.description} onChange={(e) => setExForm({ ...exForm, description: e.target.value })} placeholder="Alquiler, luz, sueldos…" /></Field>
                <div className="grid2">
                  <Field label="Monto (Bs)"><input className="input" type="number" step="0.01" min="0.01" required value={exForm.amount} onChange={(e) => setExForm({ ...exForm, amount: e.target.value })} /></Field>
                  <Field label="Fecha"><input className="input" type="date" required value={exForm.date} onChange={(e) => setExForm({ ...exForm, date: e.target.value })} /></Field>
                </div>
                <button className="btn">Guardar gasto</button>
              </form>
              <div><h2>Gastos del período</h2>
                <div className="tablewrap"><table><tbody>{d.expenses.length === 0 ? <tr><td className="muted">Sin gastos registrados.</td></tr> : d.expenses.map((x: any) => (
                  <tr key={x.id}><td>{x.description}<div className="small muted">{dateOnly(x.expense_date + 'T12:00:00')}</div></td><td className="num">{money(x.amount)}</td><td><button className="btn ghost small" onClick={() => delExpense(x.id)} aria-label="Eliminar">✕</button></td></tr>
                ))}</tbody></table></div></div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
