import { FormEvent, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { errText } from '../../lib/api'
import { useAsync } from '../../hooks/useAsync'
import { Badge, Empty, ErrorBox, Field, Modal, Spinner } from '../../components/ui'
import { dateTime, money } from '../../lib/format'
import { notify } from '../../lib/toast'

const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }
const nowLocal = (plusDays = 0) => { const d = new Date(Date.now() + plusDays * 86400000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16) }

interface Form { id: string; name: string; description: string; discount_type: 'percent' | 'fixed'; discount_value: string; scope: 'all' | 'product' | 'category'; product_id: string; category_id: string; min_quantity: string; starts_at: string; ends_at: string; active: boolean }
const blank = (): Form => ({ id: '', name: '', description: '', discount_type: 'percent', discount_value: '', scope: 'all', product_id: '', category_id: '', min_quantity: '1', starts_at: nowLocal(), ends_at: nowLocal(7), active: true })

export default function Promotions() {
  const [edit, setEdit] = useState<Form | null>(null)
  const list = useAsync(async () => {
    const { data, error } = await supabase.from('promotions').select('*, products(name), categories(name)').order('ends_at', { ascending: false })
    if (error) throw error
    return data as any[]
  }, [])
  const status = (p: any) => {
    const now = Date.now()
    if (!p.active) return ['cancelled', 'Desactivada'] as const
    if (now < new Date(p.starts_at).getTime()) return ['wait', 'Programada'] as const
    if (now > new Date(p.ends_at).getTime()) return ['cancelled', 'Vencida'] as const
    return ['approved', 'Vigente'] as const
  }
  const open = (p?: any) => setEdit(p ? { id: p.id, name: p.name, description: p.description ?? '', discount_type: p.discount_type, discount_value: String(p.discount_value), scope: p.product_id ? 'product' : p.category_id ? 'category' : 'all', product_id: p.product_id ?? '', category_id: p.category_id ?? '', min_quantity: String(p.min_quantity), starts_at: toLocal(p.starts_at), ends_at: toLocal(p.ends_at), active: p.active } : blank())
  const toggle = async (p: any) => {
    const { error } = await supabase.from('promotions').update({ active: !p.active }).eq('id', p.id)
    if (error) notify(errText(new Error(error.message)), 'error'); else list.reload()
  }

  return (
    <div>
      <div className="row spread mb"><h1 style={{ fontSize: '2rem', margin: 0 }}>Promociones</h1><button className="btn marker" onClick={() => open()}>Nueva promoción</button></div>
      <p className="small muted">Si varias promociones aplican al mismo producto, el sistema usa la que deja el precio más bajo. Las promociones solo funcionan dentro de sus fechas y mientras estén activas.</p>
      <ErrorBox text={list.error} />
      {list.loading ? <Spinner /> : (list.data ?? []).length === 0 ? <Empty>No hay promociones creadas.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Promoción</th><th>Descuento</th><th>Aplica a</th><th>Vigencia</th><th>Estado</th><th /></tr></thead>
          <tbody>{(list.data ?? []).map((p) => {
            const [k, label] = status(p)
            return (
              <tr key={p.id}><td><b>{p.name}</b>{p.description && <div className="small muted">{p.description}</div>}</td>
                <td>{p.discount_type === 'percent' ? `${p.discount_value}%` : money(p.discount_value)}{p.min_quantity > 1 && <div className="small muted">desde {p.min_quantity} unidades</div>}</td>
                <td>{p.products?.name ?? (p.categories?.name ? `Categoría: ${p.categories.name}` : 'Todo el catálogo')}</td>
                <td className="small">{dateTime(p.starts_at)}<br />{dateTime(p.ends_at)}</td><td><Badge kind={k}>{label}</Badge></td>
                <td className="row" style={{ flexWrap: 'nowrap' }}><button className="btn ghost small" onClick={() => open(p)}>Editar</button><button className="btn ghost small" onClick={() => toggle(p)}>{p.active ? 'Desactivar' : 'Activar'}</button></td></tr>
            )
          })}</tbody>
        </table></div>
      )}
      {edit && <PromoForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload() }} />}
    </div>
  )
}

function PromoForm({ initial, onClose, onSaved }: { initial: Form; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof Form, v: any) => setF((p) => ({ ...p, [k]: v }))
  const refs = useAsync(async () => {
    const [p, c] = await Promise.all([supabase.from('products').select('id,code,name').eq('active', true).order('name'), supabase.from('categories').select('id,name').order('name')])
    return { products: (p.data ?? []) as any[], cats: (c.data ?? []) as any[] }
  }, [])
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    if (f.scope === 'product' && !f.product_id) { setError('Elige el producto.'); return }
    if (f.scope === 'category' && !f.category_id) { setError('Elige la categoría.'); return }
    const body = {
      name: f.name.trim(), description: f.description.trim() || null, discount_type: f.discount_type, discount_value: Number(f.discount_value),
      product_id: f.scope === 'product' ? f.product_id : null, category_id: f.scope === 'category' ? f.category_id : null,
      min_quantity: Math.max(1, Math.floor(Number(f.min_quantity) || 1)), starts_at: new Date(f.starts_at).toISOString(), ends_at: new Date(f.ends_at).toISOString(), active: f.active,
    }
    const r = f.id ? await supabase.from('promotions').update(body).eq('id', f.id) : await supabase.from('promotions').insert(body)
    if (r.error) { setError(r.error.message.includes('promo_dates') ? 'La fecha de fin debe ser posterior a la de inicio.' : r.error.message.includes('promo_pct') ? 'Un descuento en porcentaje no puede pasar de 100.' : errText(new Error(r.error.message))); return }
    notify('Promoción guardada'); onSaved()
  }
  return (
    <Modal title={f.id ? 'Editar promoción' : 'Nueva promoción'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nombre"><input className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Descripción (opcional)"><input className="input" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Tipo de descuento"><select className="input" value={f.discount_type} onChange={(e) => set('discount_type', e.target.value)}><option value="percent">Porcentaje (%)</option><option value="fixed">Monto fijo por unidad (Bs)</option></select></Field>
          <Field label="Valor"><input className="input" type="number" step="0.01" min="0.01" required value={f.discount_value} onChange={(e) => set('discount_value', e.target.value)} /></Field>
        </div>
        <div className="grid2">
          <Field label="Aplica a"><select className="input" value={f.scope} onChange={(e) => set('scope', e.target.value)}><option value="all">Todo el catálogo</option><option value="category">Una categoría</option><option value="product">Un producto</option></select></Field>
          {f.scope === 'product' && <Field label="Producto"><select className="input" value={f.product_id} onChange={(e) => set('product_id', e.target.value)}><option value="">Elegir…</option>{(refs.data?.products ?? []).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field>}
          {f.scope === 'category' && <Field label="Categoría"><select className="input" value={f.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">Elegir…</option>{(refs.data?.cats ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
        </div>
        <Field label="Cantidad mínima para aplicar" hint="1 = aplica siempre. Ejemplo: 3 = solo si compra 3 o más unidades."><input className="input" type="number" min="1" value={f.min_quantity} onChange={(e) => set('min_quantity', e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Inicia"><input className="input" type="datetime-local" required value={f.starts_at} onChange={(e) => set('starts_at', e.target.value)} /></Field>
          <Field label="Termina"><input className="input" type="datetime-local" required value={f.ends_at} onChange={(e) => set('ends_at', e.target.value)} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Promoción activa</label>
        <ErrorBox text={error} />
        <div className="row"><button className="btn">Guardar</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
      </form>
    </Modal>
  )
}
