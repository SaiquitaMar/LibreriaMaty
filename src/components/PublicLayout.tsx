import { Link, NavLink, Outlet } from 'react-router-dom'
import { useCart } from '../hooks/useCart'
import { useAuth } from '../hooks/useAuth'
import { useSettings } from '../hooks/useSettings'
import { configured } from '../lib/supabase'
import { ConfigMissing } from './ui'

export default function PublicLayout() {
  const cart = useCart()
  const { profile, session, signOut, isStaff } = useAuth()
  const s = useSettings()
  const name = s.business_name || 'Librería MATY'
  return (
    <>
      <header className="topbar">
        <div className="container">
          <Link to="/" className="logo" aria-label={name}><b>M</b>ATY</Link>
          <nav className="nav" aria-label="Principal">
            <NavLink to="/catalogo">Catálogo</NavLink>
            <NavLink to="/pedido">Seguir pedido</NavLink>
            {session && !isStaff && <NavLink to="/mis-pedidos">Mis pedidos</NavLink>}
            {isStaff && <NavLink to="/admin">Panel</NavLink>}
            {session
              ? <button className="link" onClick={() => signOut()}>Salir{profile?.full_name ? ` (${profile.full_name.split(' ')[0]})` : ''}</button>
              : <NavLink to="/login">Ingresar</NavLink>}
            <NavLink to="/carrito" className="cartlink">Carrito{cart.count > 0 && <span className="count">{cart.count}</span>}</NavLink>
          </nav>
        </div>
      </header>
      <main>{configured ? <Outlet /> : <ConfigMissing />}</main>
      <footer className="footer">
        <div className="container">
          <strong>{name}</strong>
          <p className="small" style={{ margin: '.4rem 0 0' }}>
            {s.pickup_address && <>Recojo en: {s.pickup_address}. </>}
            {s.pickup_hours && <>Horario: {s.pickup_hours}. </>}
            {s.whatsapp && <>Consultas por <a href={`https://wa.me/${s.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a>.</>}
          </p>
        </div>
      </footer>
    </>
  )
}
