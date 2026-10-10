import { FormEvent, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { rpc, errText, one, extOf, randomId } from '../../lib/api'
import { useAsync } from '../../hooks/useAsync'
import { Badge, Empty, ErrorBox, Field, Modal, Spinner } from '../../components/ui'
import { money } from '../../lib/format'
import { notify } from '../../lib/toast'
import type { Category } from '../../types'

interface Row { id: string; code: string; name: string; description: string | null; category_id: string | null; price: number; image_url: string | null; stock: number; reserved: number; min_stock: number; active: boolean; categories: { name: string } | null; product_costs: { cost: number } | { cost: number }[] | null }
const blank = { id: '', code: '', name: '', description: '', category_id: '', price: '', cost: '', min_stock: '0', stock: '0', active: true, image_url: '' }

export default function Products() {
  const [q, setQ] = useState('')
  const [showOff, setShowOff] = useState(false)
  const [edit, setEdit] = useState<typeof blank | null>(null)
  const [catsOpen, setCatsOpen] = useState(false)

  const cats = useAsync(async () => {
    const { data } = await supabase.from('categories').select('*').order('name')
    return (data ?? []) as Category[]
  }, [])
  const list = useAsync(async () => {
    const { data, error } = await supabase.from('products').select('*, categories(name), product_costs(cost)').order('name')
    if (error) throw error
    return data as unknown as Row[]
  }, [])

  const rows = (list.data ?? []).filter((r) => (showOff || r.active) && (`${r.name} ${r.code}`.toLowerCase().includes(q.toLowerCase())))
  const open = (r?: Row) => setEdit(r ? { id: r.id, code: r.code, name: r.name, description: r.description ?? '', category_id: r.category_id ?? '', price: String(r.price), cost: String(one(r.product_costs as any)?.cost ?? 0), min_stock: String(r.min_stock), stock: String(r.stock), active: r.active, image_url: r.image_url ?? '' } : { ...blank })

  return (
    <div>
      <div className="row spread mb"><h1 style={{ fontSize: '2rem', margin: 0 }}>Productos</h1>
        <div className="row"><button className="btn ghost" onClick={() => setCatsOpen(true)}>Categorías</button><button className="btn marker" onClick={() => open()}>Nuevo producto</button></div></div>
      <div className="row mb">
        <input className="input grow" style={{ maxWidth: 360 }} placeholder="Buscar por nombre o código" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} /> Mostrar desactivados</label>
      </div>
      <ErrorBox text={list.error} />
      {list.loading ? <Spinner /> : rows.length === 0 ? <Empty>No hay productos. Crea el primero con “Nuevo producto”.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th className="num">Precio</th><th className="num">Costo</th><th className="num">Stock</th><th>Estado</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td>{r.code}</td><td>{r.name}</td><td>{r.categories?.name ?? '—'}</td><td className="num">{money(r.price)}</td>
              <td className="num">{money(one(r.product_costs as any)?.cost ?? 0)}</td>
              <td className="num">{r.stock <= r.min_stock ? <b style={{ color: 'var(--pencil)' }}>{r.stock}</b> : r.stock}</td>
              <td><Badge kind={r.active ? 'approved' : 'cancelled'}>{r.active ? 'Activo' : 'Desactivado'}</Badge></td>
              <td><button className="btn ghost small" onClick={() => open(r)}>Editar</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
      {edit && <ProductForm initial={edit} cats={cats.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload() }} />}
      {catsOpen && <CategoriesModal cats={cats.data ?? []} onClose={() => setCatsOpen(false)} onChanged={cats.reload} />}
    </div>
  )
}

function ProductForm({ initial, cats, onClose, onSaved }: { initial: typeof blank; cats: Category[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isNew = !f.id
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      let image_url = f.image_url || null
      if (file) {
        if (file.size > 3 * 1024 * 1024) throw new Error('La foto pesa más de 3 MB.')
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('La foto debe ser JPG, PNG o WEBP.')
        const path = `${randomId()}.${extOf(file)}`
        const up = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type })
        if (up.error) throw up.error
        image_url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
      }
      const body = { code: f.code.trim(), name: f.name.trim(), description: f.description.trim() || null, category_id: f.category_id || null, price: Number(f.price), min_stock: Number(f.min_stock) || 0, active: f.active, image_url }
      if (!(body.price >= 0)) throw new Error('Escribe un precio válido.')
      let id = f.id
      if (isNew) {
        const r = await supabase.from('products').insert(body).select('id').single()
        if (r.error) throw r.error
        id = r.data.id
      } else {
        const r = await supabase.from('products').update(body).eq('id', id)
        if (r.error) throw r.error
      }
      const c = await supabase.from('product_costs').upsert({ product_id: id, cost: Number(f.cost) || 0 })
      if (c.error) throw c.error
      if (isNew && Number(f.stock) > 0) await rpc('adjust_stock', { p_product: id, p_delta: Number(f.stock), p_note: 'Stock inicial' })
      notify('Producto guardado')
      onSaved()
    } catch (err: any) { setError(errText(err?.message ? new Error(err.message) : err)) } finally { setBusy(false) }
  }

  return (
    <Modal title={isNew ? 'Nuevo producto' : 'Editar producto'} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid2">
          <Field label="Código único"><div className="row" style={{ flexWrap: 'nowrap' }}><input className="input" required value={f.code} onChange={(e) => set('code', e.target.value)} />
            {isNew && <button type="button" className="btn ghost small" onClick={() => set('code', 'MAT-' + Math.floor(10000 + Math.random() * 90000))}>Generar</button>}</div></Field>
          <Field label="Categoría"><select className="input" value={f.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">Sin categoría</option>{cats.filter((c) => c.active || c.id === f.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        </div>
        <Field label="Nombre"><input className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Descripción"><textarea className="input" value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
        <div className="grid3">
          <Field label="Precio de venta (Bs)"><input className="input" type="number" step="0.01" min="0" required value={f.price} onChange={(e) => set('price', e.target.value)} /></Field>
          <Field label="Costo de compra (Bs)"><input className="input" type="number" step="0.01" min="0" value={f.cost} onChange={(e) => set('cost', e.target.value)} /></Field>
          <Field label="Stock mínimo"><input className="input" type="number" min="0" value={f.min_stock} onChange={(e) => set('min_stock', e.target.value)} /></Field>
        </div>
        {isNew
          ? <Field label="Stock inicial" hint="Cantidad que tienes hoy. Después se modifica con compras o ajustes de inventario."><input className="input" type="number" min="0" value={f.stock} onChange={(e) => set('stock', e.target.value)} /></Field>
          : <p className="small muted">Stock actual: <b>{f.stock}</b>. Para cambiarlo usa Inventario (ajuste) o Compras.</p>}
        <Field label="Fotografía (JPG, PNG o WEBP, máx. 3 MB)">
          {f.image_url && !file && <img src={f.image_url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 10, marginBottom: '.5rem' }} />}
          <input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Producto activo (visible en la tienda)</label>
        <ErrorBox text={error} />
        <div className="row"><button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
      </form>
    </Modal>
  )
}

function CategoriesModal({ cats, onClose, onChanged }: { cats: Category[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    const { error } = await supabase.from('categories').insert({ name: name.trim() })
    if (error) { setError(errText(new Error(error.message))); return }
    setName(''); onChanged()
  }
  const toggle = async (c: Category) => {
    const { error } = await supabase.from('categories').update({ active: !c.active }).eq('id', c.id)
    if (error) notify(errText(new Error(error.message)), 'error'); else onChanged()
  }
  return (
    <Modal title="Categorías" onClose={onClose}>
      <form className="row mb" onSubmit={add}><input className="input grow" required placeholder="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn">Agregar</button></form>
      <ErrorBox text={error} />
      <div className="tablewrap"><table><tbody>{cats.map((c) => (
        <tr key={c.id}><td>{c.name}</td><td><Badge kind={c.active ? 'approved' : 'cancelled'}>{c.active ? 'Activa' : 'Oculta'}</Badge></td>
          <td><button className="btn ghost small" onClick={() => toggle(c)}>{c.active ? 'Ocultar' : 'Mostrar'}</button></td></tr>
      ))}</tbody></table></div>
    </Modal>
  )
}
