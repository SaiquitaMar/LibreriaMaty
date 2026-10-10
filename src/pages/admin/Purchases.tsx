import { FormEvent, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { rpc, errText } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useAsync } from '../../hooks/useAsync'
import { Badge, Empty, ErrorBox, Field, Modal, Spinner } from '../../components/ui'
import { money, dateTime } from '../../lib/format'
import { notify } from '../../lib/toast'

interface Item { product_id: string; quantity: string; unit_cost: string }

export default function Purchases() {
  const { isAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const supplier = params.get('proveedor') ?? ''
  const [open, setOpen] = useState(false)
  const suppliers = useAsync(async () => {
    const { data } = await supabase.from('suppliers').select('id,name,active').order('name')
    return (data ?? []) as { id: string; name: string; active: boolean }[]
  }, [])
  const list = useAsync(async () => {
    let q = supabase.from('purchases').select('*, suppliers(name), purchase_items(*, products(name, code))').order('created_at', { ascending: false }).limit(100)
    if (supplier) q = q.eq('supplier_id', supplier)
    const { data, error } = await q
    if (error) throw error
    return data as any[]
  }, [supplier])

  const receive = async (id: string) => {
    if (!window.confirm('¿Confirmas que la mercadería llegó completa? Se sumará al inventario y se actualizará el costo de cada producto.')) return
    try { await rpc('receive_purchase', { p_purchase: id }); notify('Mercadería recibida'); list.reload() } catch (e) { notify(errText(e), 'error') }
  }
  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar esta compra pendiente?')) return
    const { error } = await supabase.from('purchases').delete().eq('id', id)
    if (error) notify(errText(new Error(error.message)), 'error'); else { notify('Compra eliminada'); list.reload() }
  }

  return (
    <div>
      <div className="row spread mb"><h1 style={{ fontSize: '2rem', margin: 0 }}>Compras de mercadería</h1><button className="btn marker" onClick={() => setOpen(true)}>Nueva compra</button></div>
      <div className="row mb">
        <select className="input" style={{ maxWidth: 320 }} value={supplier} onChange={(e) => setParams(e.target.value ? { proveedor: e.target.value } : {})} aria-label="Filtrar por proveedor">
          <option value="">Todos los proveedores</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <ErrorBox text={list.error} />
      {list.loading ? <Spinner /> : (list.data ?? []).length === 0 ? <Empty>No hay compras registradas.</Empty> : (
        <div className="stack">{(list.data ?? []).map((p) => (
          <div className="panel" key={p.id}>
            <div className="row spread">
              <div><b>{p.suppliers?.name}</b> <Badge kind={p.status}>{p.status === 'received' ? 'Recibida' : 'Pendiente de recibir'}</Badge>
                <div className="small muted">{dateTime(p.created_at)}{p.invoice_ref && ` · Doc: ${p.invoice_ref}`}{p.received_at && ` · Recibida: ${dateTime(p.received_at)}`}</div></div>
              <b>{money(p.total)}</b>
            </div>
            <div className="tablewrap mt"><table><tbody>{(p.purchase_items ?? []).map((i: any) => (
              <tr key={i.id}><td>{i.products?.name} <span className="small muted">({i.products?.code})</span></td><td className="num">{i.quantity} × {money(i.unit_cost)}</td><td className="num">{money(i.quantity * i.unit_cost)}</td></tr>
            ))}</tbody></table></div>
            {p.notes && <p className="small muted mt">{p.notes}</p>}
            {p.status === 'ordered' && <div className="row mt"><button className="btn" onClick={() => receive(p.id)}>Recibir mercadería</button>{isAdmin && <button className="btn ghost small" onClick={() => remove(p.id)}>Eliminar</button>}</div>}
          </div>
        ))}</div>
      )}
      {open && <NewPurchase suppliers={(suppliers.data ?? []).filter((s) => s.active)} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload() }} />}
    </div>
  )
}

function NewPurchase({ suppliers, onClose, onSaved }: { suppliers: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [sup, setSup] = useState('')
  const [invoice, setInvoice] = useState('')
  const [notes, setNotes] = useState('')
  const [receiveNow, setReceiveNow] = useState(false)
  const [items, setItems] = useState<Item[]>([{ product_id: '', quantity: '1', unit_cost: '' }])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const products = useAsync(async () => {
    const { data } = await supabase.from('products').select('id,code,name').eq('active', true).order('name')
    return (data ?? []) as { id: string; code: string; name: string }[]
  }, [])
  const upd = (i: number, patch: Partial<Item>) => setItems((prev) => prev.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  const total = items.reduce((a, i) => a + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0)

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      if (!sup) throw new Error('Elige el proveedor.')
      const clean = items.filter((i) => i.product_id)
      if (clean.length === 0) throw new Error('Agrega al menos un producto.')
      const id = await rpc<string>('create_purchase', {
        p_supplier: sup, p_invoice: invoice, p_notes: notes,
        p_items: clean.map((i) => ({ product_id: i.product_id, quantity: Math.floor(Number(i.quantity)), unit_cost: Number(i.unit_cost) })),
      })
      if (receiveNow) await rpc('receive_purchase', { p_purchase: id })
      notify(receiveNow ? 'Compra registrada y recibida' : 'Compra registrada'); onSaved()
    } catch (err) { setError(errText(err)) } finally { setBusy(false) }
  }

  return (
    <Modal title="Nueva compra" onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="grid2">
          <Field label="Proveedor"><select className="input" required value={sup} onChange={(e) => setSup(e.target.value)}><option value="">Elegir…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Número de factura o nota (opcional)"><input className="input" value={invoice} onChange={(e) => setInvoice(e.target.value)} /></Field>
        </div>
        <h3>Productos comprados</h3>
        {items.map((it, i) => (
          <div className="row mb" key={i} style={{ alignItems: 'flex-end' }}>
            <div className="grow" style={{ minWidth: 200 }}><span className="small">Producto</span>
              <select className="input" value={it.product_id} onChange={(e) => upd(i, { product_id: e.target.value })}><option value="">Elegir…</option>{(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></div>
            <div style={{ width: 90 }}><span className="small">Cantidad</span><input className="input" type="number" min="1" value={it.quantity} onChange={(e) => upd(i, { quantity: e.target.value })} /></div>
            <div style={{ width: 120 }}><span className="small">Costo c/u (Bs)</span><input className="input" type="number" min="0" step="0.01" value={it.unit_cost} onChange={(e) => upd(i, { unit_cost: e.target.value })} /></div>
            <button type="button" className="btn ghost small" onClick={() => setItems(items.filter((_, idx) => idx !== i))} aria-label="Quitar">✕</button>
          </div>
        ))}
        <button type="button" className="btn ghost small mb" onClick={() => setItems([...items, { product_id: '', quantity: '1', unit_cost: '' }])}>+ Agregar otro producto</button>
        <Field label="Notas"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        <label className="check"><input type="checkbox" checked={receiveNow} onChange={(e) => setReceiveNow(e.target.checked)} /> La mercadería ya llegó: sumar al inventario ahora</label>
        <div className="row spread"><span>Total de la compra</span><span className="total">{money(total)}</span></div>
        <ErrorBox text={error} />
        <div className="row"><button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Registrar compra'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
      </form>
    </Modal>
  )
}
