import { FormEvent, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { rpc, errText } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useAsync } from '../../hooks/useAsync'
import { Empty, ErrorBox, Field, Modal, Spinner } from '../../components/ui'
import { dateTime, MOVE_TYPE } from '../../lib/format'
import { notify } from '../../lib/toast'
import type { Product } from '../../types'

export default function Inventory() {
  const { canInventory } = useAuth()
  const [q, setQ] = useState('')
  const [onlyLow, setOnlyLow] = useState(false)
  const [adj, setAdj] = useState<Product | null>(null)
  const [hist, setHist] = useState<Product | null>(null)
  const list = useAsync(async () => {
    const { data, error } = await supabase.from('products').select('id,code,name,stock,reserved,min_stock,active,price,description,category_id,image_url').order('name')
    if (error) throw error
    return data as Product[]
  }, [])
  const rows = (list.data ?? []).filter((p) => p.active && (!onlyLow || p.stock <= p.min_stock) && `${p.name} ${p.code}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <h1 style={{ fontSize: '2rem' }}>Inventario</h1>
      <div className="row mb">
        <input className="input grow" style={{ maxWidth: 360 }} placeholder="Buscar por nombre o código" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Solo con poco stock</label>
      </div>
      <p className="small muted">“Reservado” es lo que está apartado para pedidos en línea que aún no se pagan. “Disponible” = stock − reservado.</p>
      <ErrorBox text={list.error} />
      {list.loading ? <Spinner /> : rows.length === 0 ? <Empty>No hay productos para mostrar.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Código</th><th>Producto</th><th className="num">Stock</th><th className="num">Reservado</th><th className="num">Disponible</th><th className="num">Mínimo</th><th /></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}><td>{p.code}</td><td>{p.name}</td><td className="num">{p.stock}</td><td className="num">{p.reserved}</td>
              <td className="num"><b style={{ color: p.stock <= p.min_stock ? 'var(--pencil)' : undefined }}>{p.stock - p.reserved}</b></td><td className="num">{p.min_stock}</td>
              <td className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="btn ghost small" onClick={() => setHist(p)}>Historial</button>
                {canInventory && <button className="btn small" onClick={() => setAdj(p)}>Ajustar</button>}
              </td></tr>
          ))}</tbody>
        </table></div>
      )}
      {adj && <AdjustModal p={adj} onClose={() => setAdj(null)} onSaved={() => { setAdj(null); list.reload() }} />}
      {hist && <HistoryModal p={hist} onClose={() => setHist(null)} />}
    </div>
  )
}

function AdjustModal({ p, onClose, onSaved }: { p: Product; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'in' | 'out'>('in')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      const n = Math.floor(Number(qty))
      if (!(n > 0)) throw new Error('Escribe una cantidad mayor a cero.')
      await rpc('adjust_stock', { p_product: p.id, p_delta: kind === 'in' ? n : -n, p_note: note })
      notify('Inventario actualizado'); onSaved()
    } catch (err) { setError(errText(err)) } finally { setBusy(false) }
  }
  return (
    <Modal title={`Ajustar: ${p.name}`} onClose={onClose}>
      <p>Stock actual: <b>{p.stock}</b> · Reservado: {p.reserved}</p>
      <form onSubmit={submit}>
        <label className="check"><input type="radio" checked={kind === 'in'} onChange={() => setKind('in')} /> Entrada (suma al stock)</label>
        <label className="check"><input type="radio" checked={kind === 'out'} onChange={() => setKind('out')} /> Salida (resta del stock: pérdida, rotura, conteo)</label>
        <Field label="Cantidad"><input className="input" type="number" min="1" required value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="Motivo del ajuste" hint="Queda registrado en el historial."><input className="input" required minLength={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <ErrorBox text={error} />
        <div className="row"><button className="btn" disabled={busy}>Guardar ajuste</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
      </form>
    </Modal>
  )
}

function HistoryModal({ p, onClose }: { p: Product; onClose: () => void }) {
  const { data, loading, error } = useAsync(async () => {
    const { data, error } = await supabase.from('inventory_movements').select('*, creator:profiles!created_by(full_name)').eq('product_id', p.id).order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    return data as any[]
  }, [p.id])
  return (
    <Modal title={`Movimientos: ${p.name}`} onClose={onClose} wide>
      <ErrorBox text={error} />
      {loading ? <Spinner /> : (data ?? []).length === 0 ? <Empty>Aún no hay movimientos.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Fecha</th><th>Tipo</th><th className="num">Cantidad</th><th className="num">Stock después</th><th>Detalle</th><th>Usuario</th></tr></thead>
          <tbody>{(data ?? []).map((m) => (
            <tr key={m.id}><td>{dateTime(m.created_at)}</td><td>{MOVE_TYPE[m.type] ?? m.type}</td>
              <td className="num"><b style={{ color: m.quantity < 0 ? 'var(--pencil)' : 'var(--ok)' }}>{m.quantity > 0 ? '+' : ''}{m.quantity}</b></td>
              <td className="num">{m.stock_after}</td><td>{m.note}</td><td>{m.creator?.full_name || '—'}</td></tr>
          ))}</tbody>
        </table></div>
      )}
    </Modal>
  )
}
