import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { errText } from '../../lib/api'
import { useAsync } from '../../hooks/useAsync'
import { Badge, Empty, ErrorBox, Field, Modal, Spinner } from '../../components/ui'
import { notify } from '../../lib/toast'

interface Supplier { id: string; name: string; contact_name: string | null; phone: string | null; email: string | null; address: string | null; notes: string | null; active: boolean }
const blank: Supplier = { id: '', name: '', contact_name: '', phone: '', email: '', address: '', notes: '', active: true }

export default function Suppliers() {
  const [edit, setEdit] = useState<Supplier | null>(null)
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('suppliers').select('*').order('name')
    if (error) throw error
    return data as Supplier[]
  }, [])
  return (
    <div>
      <div className="row spread mb"><h1 style={{ fontSize: '2rem', margin: 0 }}>Proveedores</h1><button className="btn marker" onClick={() => setEdit({ ...blank })}>Nuevo proveedor</button></div>
      <ErrorBox text={error} />
      {loading ? <Spinner /> : (data ?? []).length === 0 ? <Empty>Aún no registraste proveedores.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Proveedor</th><th>Contacto</th><th>Teléfono</th><th>Correo</th><th>Estado</th><th /></tr></thead>
          <tbody>{(data ?? []).map((s) => (
            <tr key={s.id}><td><b>{s.name}</b>{s.address && <div className="small muted">{s.address}</div>}</td><td>{s.contact_name || '—'}</td><td>{s.phone || '—'}</td><td>{s.email || '—'}</td>
              <td><Badge kind={s.active ? 'approved' : 'cancelled'}>{s.active ? 'Activo' : 'Inactivo'}</Badge></td>
              <td className="row" style={{ flexWrap: 'nowrap' }}><Link className="btn ghost small" to={`/admin/compras?proveedor=${s.id}`}>Compras</Link><button className="btn ghost small" onClick={() => setEdit(s)}>Editar</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
      {edit && <SupplierForm initial={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function SupplierForm({ initial, onClose, onSaved }: { initial: Supplier; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof Supplier, v: any) => setF((p) => ({ ...p, [k]: v }))
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    const body = { name: f.name.trim(), contact_name: f.contact_name || null, phone: f.phone || null, email: f.email || null, address: f.address || null, notes: f.notes || null, active: f.active }
    const r = f.id ? await supabase.from('suppliers').update(body).eq('id', f.id) : await supabase.from('suppliers').insert(body)
    if (r.error) { setError(errText(new Error(r.error.message))); return }
    notify('Proveedor guardado'); onSaved()
  }
  return (
    <Modal title={f.id ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nombre o razón social"><input className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Persona de contacto"><input className="input" value={f.contact_name ?? ''} onChange={(e) => set('contact_name', e.target.value)} /></Field>
          <Field label="Teléfono"><input className="input" value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Correo"><input className="input" type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Dirección"><input className="input" value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        </div>
        <Field label="Notas"><textarea className="input" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Proveedor activo</label>
        <ErrorBox text={error} />
        <div className="row"><button className="btn">Guardar</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
      </form>
    </Modal>
  )
}
