import { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function AdminLayout() {
  const { profile, isAdmin, canInventory, canVerify, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const items: { to: string; label: string; show: boolean; end?: boolean }[] = [
    { to: '/admin', label: 'Panel', show: true, end: true },
    { to: '/admin/ventas', label: 'Ventas', show: true },
    { to: '/admin/pedidos', label: 'Pedidos', show: true },
    { to: '/admin/pagos', label: 'Pagos', show: canVerify },
    { to: '/admin/entregas', label: 'Entregas', show: true },
    { to: '/admin/productos', label: 'Productos', show: canInventory },
    { to: '/admin/inventario', label: 'Inventario', show: true },
    { to: '/admin/proveedores', label: 'Proveedores', show: canInventory },
    { to: '/admin/compras', label: 'Compras', show: canInventory },
    { to: '/admin/promociones', label: 'Promociones', show: isAdmin },
    { to: '/admin/reportes', label: 'Reportes', show: isAdmin },
    { to: '/admin/usuarios', label: 'Usuarios', show: isAdmin },
    { to: '/admin/configuracion', label: 'Configuración', show: isAdmin },
  ]
  return (
    <div className="admin">
      <div className="mobilebar">
        <button onClick={() => setOpen(!open)} aria-label="Abrir menú">☰</button>
        <strong>MATY · Panel</strong>
      </div>
      <aside className={'side' + (open ? ' open' : '')}>
        <Link to="/admin" className="logo"><b>M</b>ATY</Link>
        <nav aria-label="Panel administrativo" onClick={() => setOpen(false)}>
          {items.filter((i) => i.show).map((i) => <NavLink key={i.to} to={i.to} end={i.end}>{i.label}</NavLink>)}
        </nav>
        <div className="who">
          <div><b>{profile?.full_name || profile?.email}</b></div>
          <div>{profile?.role === 'admin' ? 'Administrador' : 'Empleado'}</div>
          <p style={{ margin: '.6rem 0 0' }}><Link to="/" style={{ color: '#ffd93b' }}>Ver tienda</Link></p>
          <button className="btn ghost small" style={{ color: '#fff', borderColor: '#fff', marginTop: '.6rem' }} onClick={() => signOut()}>Cerrar sesión</button>
        </div>
      </aside>
      <div className="main" onClick={() => setOpen(false)}><Outlet /></div>
    </div>
  )
}
