import { FormEvent, useState } from 'react'
import { supabase, makeEphemeralClient } from '../../lib/supabase'
import { errText, friendly } from '../../lib/api'
import { useAuth } from '../../hooks/useAuth'
import { useAsync } from '../../hooks/useAsync'
import { Badge, Empty, ErrorBox, Field, Modal, Spinner } from '../../components/ui'
import { dateOnly } from '../../lib/format'
import { notify } from '../../lib/toast'
import type { Profile } from '../../types'

const ROLE: Record<string, string> = { admin: 'Administrador', employee: 'Empleado', customer: 'Cliente' }

export default function Users() {
  const { session } = useAuth()
  const [tab, setTab] = useState<'staff' | 'customer'>('staff')
  const [creating, setCreating] = useState(false)
  const [edit, setEdit] = useState<Profile | null>(null)
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data as Profile[]
  }, [])
  const rows = (data ?? []).filter((p) => tab === 'staff' ? p.role !== 'customer' : p.role === 'customer')

  const reset = async (email: string | null) => {
    if (!email) return
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/restablecer' })
    if (error) notify(friendly(error.message), 'error'); else notify('Enviamos el enlace para cambiar la contraseña.')
  }

  return (
    <div>
      <div className="row spread mb"><h1 style={{ fontSize: '2rem', margin: 0 }}>Usuarios</h1><button className="btn marker" onClick={() => setCreating(true)}>Crear cuenta de personal</button></div>
      <div className="tabs">
        <button className={'chip' + (tab === 'staff' ? ' on' : '')} onClick={() => setTab('staff')}>Personal</button>
        <button className={'chip' + (tab === 'customer' ? ' on' : '')} onClick={() => setTab('customer')}>Clientes con cuenta</button>
      </div>
      <ErrorBox text={error} />
      {loading ? <Spinner /> : rows.length === 0 ? <Empty>No hay usuarios en esta lista.</Empty> : (
        <div className="tablewrap"><table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Permisos</th><th>Estado</th><th>Alta</th><th /></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}><td><b>{p.full_name || '—'}</b>{p.id === session?.user.id && <span className="small muted"> (tú)</span>}</td><td>{p.email}</td><td>{ROLE[p.role]}</td>
              <td className="small">{p.role === 'admin' ? 'Todo' : p.role === 'employee' ? [p.can_manage_inventory && 'Inventario y productos', p.can_verify_payments && 'Verificar pagos'].filter(Boolean).join(', ') || 'Ventas y pedidos' : '—'}</td>
              <td><Badge kind={p.active ? 'approved' : 'cancelled'}>{p.active ? 'Activo' : 'Desactivado'}</Badge></td><td>{dateOnly(p.created_at)}</td>
              <td className="row" style={{ flexWrap: 'nowrap' }}><button className="btn ghost small" onClick={() => setEdit(p)}>Editar</button><button className="btn ghost small" onClick={() => reset(p.email)}>Enviar cambio de clave</button></td></tr>
          ))}</tbody>
        </table></div>
      )}
      {creating && <CreateStaff onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload() }} />}
      {edit && <EditUser p={edit} self={edit.id === session?.user.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function CreateStaff({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', inv: false, ver: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      if (f.password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.')
      const tmp = makeEphemeralClient()
      const { data, error } = await tmp.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { full_name: f.name.trim() } } })
      if (error) throw error
      if (!data.user || (data.user.identities && data.user.identities.length === 0)) throw new Error('Ese correo ya está registrado.')
      const up = await supabase.from('profiles').update({ role: 'employee', full_name: f.name.trim(), phone: f.phone.trim() || null, can_manage_inventory: f.inv, can_verify_payments: f.ver }).eq('id', data.user.id)
      if (up.error) throw new Error('La cuenta se creó, pero no se pudo asignar el rol: ' + up.error.message + '. Búscala en la lista y edítala.')
      setDone(data.session ? 'Cuenta creada. Ya puede ingresar con su correo y contraseña.' : 'Cuenta creada. Supabase le envió un correo de confirmación: debe confirmarlo antes de ingresar.')
    } catch (err) { setError(errText(err)) } finally { setBusy(false) }
  }
  return (
    <Modal title="Crear cuenta de personal" onClose={done ? onSaved : onClose}>
      {done ? (
        <>
          <div className="alert ok">{done}</div>
          <p>Entrégale su correo y su contraseña inicial en persona. Podrá cambiarla con “Olvidé mi contraseña” en la pantalla de ingreso.</p>
          <button className="btn" onClick={onSaved}>Listo</button>
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="alert info small">La cuenta se crea como <b>Empleado</b>. Solo tú puedes dar permisos extra. Desde aquí no se puede borrar una cuenta ni ver su contraseña: solo desactivarla o enviarle un enlace de cambio de clave.</div>
          <Field label="Nombre completo"><input className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid2">
            <Field label="Correo"><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          </div>
          <Field label="Contraseña inicial (mínimo 6 caracteres)"><input className="input" type="text" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="off" /></Field>
          <label className="check"><input type="checkbox" checked={f.inv} onChange={(e) => setF({ ...f, inv: e.target.checked })} /> Puede gestionar productos, inventario, proveedores y compras</label>
          <label className="check"><input type="checkbox" checked={f.ver} onChange={(e) => setF({ ...f, ver: e.target.checked })} /> Puede verificar pagos</label>
          <ErrorBox text={error} />
          <div className="row"><button className="btn" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
        </form>
      )}
    </Modal>
  )
}

function EditUser({ p, self, onClose, onSaved }: { p: Profile; self: boolean; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: p.full_name, phone: p.phone ?? '', role: p.role, active: p.active, inv: p.can_manage_inventory, ver: p.can_verify_payments })
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    const { error } = await supabase.from('profiles').update({ full_name: f.name.trim(), phone: f.phone.trim() || null, role: f.role, active: f.active, can_manage_inventory: f.inv, can_verify_payments: f.ver }).eq('id', p.id)
    if (error) { setError(friendly(error.message)); return }
    notify('Usuario actualizado'); onSaved()
  }
  return (
    <Modal title={`Editar: ${p.email}`} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nombre"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Teléfono"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Rol" hint={self ? 'No puedes cambiar tu propio rol.' : 'El rol Administrador da acceso total. Asígnalo solo a personas de máxima confianza.'}>
          <select className="input" disabled={self} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Profile['role'] })}>
            <option value="customer">Cliente</option><option value="employee">Empleado</option><option value="admin">Administrador</option>
          </select>
        </Field>
        {f.role === 'employee' && (
          <>
            <label className="check"><input type="checkbox" checked={f.inv} onChange={(e) => setF({ ...f, inv: e.target.checked })} /> Puede gestionar productos, inventario, proveedores y compras</label>
            <label className="check"><input type="checkbox" checked={f.ver} onChange={(e) => setF({ ...f, ver: e.target.checked })} /> Puede verificar pagos</label>
          </>
        )}
        <label className="check"><input type="checkbox" disabled={self} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Cuenta activa</label>
        <ErrorBox text={error} />
        <div className="row"><button className="btn">Guardar</button><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button></div>
      </form>
    </Modal>
  )
}
