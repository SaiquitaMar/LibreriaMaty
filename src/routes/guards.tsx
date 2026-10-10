import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/ui'

type Need = 'staff' | 'admin' | 'inventory' | 'verify' | 'customer'

export default function Guard({ need, children }: { need: Need; children: ReactNode }) {
  const { loading, session, profile, isStaff, isAdmin, canInventory, canVerify } = useAuth()
  const loc = useLocation()
  if (loading) return <Spinner />
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (!profile || !profile.active) {
    return <div className="container section"><div className="alert error">Tu cuenta no está activa. Comunícate con la librería.</div></div>
  }
  const ok = need === 'customer' ? true : need === 'staff' ? isStaff : need === 'admin' ? isAdmin : need === 'inventory' ? canInventory : canVerify
  if (!ok) {
    return (
      <div className="container section">
        <div className="alert warn"><b>No tienes permiso para entrar a esta sección.</b> Si la necesitas, pídele al administrador que la habilite en tu cuenta.</div>
      </div>
    )
  }
  return <>{children}</>
}
