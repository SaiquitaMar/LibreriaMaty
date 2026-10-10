import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { rpc, errText, must } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useAsync } from '../../hooks/useAsync'
import { useSettings } from '../../hooks/useSettings'
import { Badge, Empty, ErrorBox, Field, Spinner } from '../../components/ui'
import Ticket, { TicketData } from '../../components/Ticket'
import { money, dateTime, PAY_METHOD } from '../../lib/format'
import { notify } from '../../lib/toast'
import type { CatalogItem } from '../../types'

interface Line { id: string; code: string; name: string; price: number; promo: number | null; available: number; qty: number; disc: number }

export default function Sales() {
  const { isAdmin, profile } = useAuth()
  const settings = useSettings()
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<CatalogItem[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [method, setMethod] = useState('cash')
  const [customer, setCustomer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticket, setTicket] = useState<TicketData | null>(null)
  const [tab, setTab] = useState<'new' | 'history'>('new')
  const maxDisc = isAdmin ? 100 : Number(settings.max_employee_discount_percent || 0)

  useEffect(() => {
    const t = term.replace(/[,()%*]/g, ' ').trim()
    if (!t) { setResults([]); return }
    const h = window.setTimeout(async () => {
      const { data } = await supabase.from('catalog').select('*').or(`name.ilike.%${t}%,code.ilike.%${t}%`).order('name').limit(12)
      setResults((data ?? []) as CatalogItem[])
    }, 250)
    return () => window.clearTimeout(h)
  }, [term])

  const add = (p: CatalogItem) => {
    if (p.available <= 0) { notify('Sin stock disponible', 'error'); return }
    setLines((prev) => {
      const f = prev.find((l) => l.id === p.id)
      if (f) return prev.map((l) => l.id === p.id ? { ...l, qty: Math.min(l.qty + 1, p.available) } : l)
      return [...prev, { id: p.id, code: p.code, name: p.name, price: p.price, promo: p.promo_price, available: p.available, qty: 1, disc: 0 }]
    })
    setTerm(''); setResults([])
  }
  const onEnter = () => {
    const exact = results.find((r) => r.code.toLowerCase() === term.trim().toLowerCase())
    if (exact) add(exact); else if (results.length === 1) add(results[0])
  }
  const upd = (id: string, patch: Partial<Line>) => setLines((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l))
  const unit = (l: Line) => Math.round((l.promo ?? l.price) * (1 - l.disc / 100) * 100) / 100
  const total = lines.reduce((a, l) => a + unit(l) * l.qty, 0)

  const confirm = async () => {
    setBusy(true); setError(null)
    try {
      const res = await rpc<{ id: string; ticket_no: number }>('create_sale', {
        p_items: lines.map((l) => ({ product_id: l.id, quantity: l.qty, discount_percent: l.disc })),
        p_method: method, p_customer: customer, p_notes: null,
      })
      const sale = must(await supabase.from('sales').select('*, sale_items(*)').eq('id', res.id).single()) as any
      setTicket(toTicket(sale, settings.business_name || 'Librería MATY', profile?.full_name))
      setLines([]); setCustomer(''); setMethod('cash')
      notify('Venta registrada')
      history.reload()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  const history = useAsync(async () => {
    const { data, error } = await supabase.from('sales').select('*, sale_items(*), seller:profiles!seller_id(full_name)').order('created_at', { ascending: false }).limit(40)
    if (error) throw error
    return data as any[]
  }, [])

  const voidSale = async (id: string) => {
    const reason = window.prompt('Motivo de la anulación (el stock volverá al inventario):')
    if (!reason) return
    try { await rpc('void_sale', { p_sale_id: id, p_reason: reason }); notify('Venta anulada'); history.reload() } catch (e) { notify(errText(e), 'error') }
  }

  return (
    <div>
      <h1 style={{ fontSize: '2rem' }}>Ventas en tienda</h1>
      <div className="tabs">
        <button className={'chip' + (tab === 'new' ? ' on' : '')} onClick={() => setTab('new')}>Nueva venta</button>
        <button className={'chip' + (tab === 'history' ? ' on' : '')} onClick={() => setTab('history')}>Historial</button>
      </div>
      {tab === 'new' ? (
        <div className="pos">
          <div className="panel">
            <Field label="Buscar producto por nombre o código">
              <input className="input" autoFocus value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }} placeholder="Escribe o escanea un código" />
            </Field>
            {results.map((p) => (
              <button key={p.id} className="result" onClick={() => add(p)}>
                <span><b>{p.name}</b><br /><span className="small muted">{p.code} · {p.available} disponibles</span></span>
                <b>{money(p.promo_price ?? p.price)}</b>
              </button>
            ))}
            {term && results.length === 0 && <p className="muted">Sin resultados.</p>}
          </div>
          <div className="panel">
            <h3>Detalle de la venta</h3>
            {lines.length === 0 ? <Empty>Busca y agrega productos.</Empty> : (
              <div className="tablewrap"><table>
                <thead><tr><th>Producto</th><th>Cant.</th><th>Desc. %</th><th className="num">Subtotal</th><th /></tr></thead>
                <tbody>{lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.name}<div className="small muted">{money(l.promo ?? l.price)} c/u{l.promo !== null && ' (oferta)'}</div></td>
                    <td><input className="input" style={{ width: 70, minHeight: 36 }} type="number" min={1} max={l.available} value={l.qty} onChange={(e) => upd(l.id, { qty: Math.max(1, Math.min(l.available, Number(e.target.value) || 1)) })} /></td>
                    <td><input className="input" style={{ width: 70, minHeight: 36 }} type="number" min={0} max={maxDisc} value={l.disc} onChange={(e) => upd(l.id, { disc: Math.max(0, Math.min(maxDisc, Number(e.target.value) || 0)) })} /></td>
                    <td className="num">{money(unit(l) * l.qty)}</td>
                    <td><button className="btn ghost small" onClick={() => setLines(lines.filter((x) => x.id !== l.id))} aria-label="Quitar">✕</button></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
            <p className="small muted mt">{isAdmin ? 'Como administrador puedes dar cualquier descuento.' : `Tu descuento máximo autorizado es ${maxDisc}%.`} El precio final lo confirma el sistema al cobrar.</p>
            <div className="grid2">
              <Field label="Medio de pago"><select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>{Object.entries(PAY_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Cliente (opcional)"><input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} /></Field>
            </div>
            <div className="row spread"><span>Total</span><span className="total">{money(total)}</span></div>
            <ErrorBox text={error} />
            <button className="btn marker" style={{ width: '100%' }} disabled={busy || lines.length === 0} onClick={confirm}>{busy ? 'Registrando…' : 'Cobrar y registrar venta'}</button>
          </div>
        </div>
      ) : (
        <>
          <ErrorBox text={history.error} />
          {history.loading ? <Spinner /> : (
            <div className="tablewrap"><table>
              <thead><tr><th>Ticket</th><th>Fecha</th><th>Vendedor</th><th>Pago</th><th>Estado</th><th className="num">Total</th><th /></tr></thead>
              <tbody>{(history.data ?? []).map((s) => (
                <tr key={s.id}>
                  <td>#{s.ticket_no}</td><td>{dateTime(s.created_at)}</td><td>{s.seller?.full_name || '—'}</td><td>{PAY_METHOD[s.payment_method]}</td>
                  <td><Badge kind={s.status === 'voided' ? 'voided' : 'completed'}>{s.status === 'voided' ? 'Anulada' : 'Completada'}</Badge>{s.void_reason && <div className="small muted">{s.void_reason}</div>}</td>
                  <td className="num">{money(s.total)}</td>
                  <td className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn ghost small" onClick={() => setTicket(toTicket(s, settings.business_name || 'Librería MATY', s.seller?.full_name))}>Ticket</button>
                    {isAdmin && s.status === 'completed' && <button className="btn danger small" onClick={() => voidSale(s.id)}>Anular</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}
      {ticket && <Ticket data={ticket} onClose={() => setTicket(null)} />}
    </div>
  )
}

function toTicket(s: any, business: string, seller?: string): TicketData {
  return {
    business, ticket_no: s.ticket_no, created_at: s.created_at, seller, payment_method: s.payment_method, customer_name: s.customer_name,
    items: (s.sale_items ?? []).map((i: any) => ({ product_name: i.product_name, quantity: i.quantity, unit_price: Number(i.unit_price), line_total: Number(i.line_total) })),
    subtotal: Number(s.subtotal), discount_total: Number(s.discount_total), total: Number(s.total), voided: s.status === 'voided',
  }
}
