import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCart } from '../hooks/useCart'
import { money } from '../lib/format'
import { Empty } from '../components/ui'
import { notify } from '../lib/toast'
import type { CatalogItem } from '../types'

export default function Cart() {
  const cart = useCart()
  const refreshed = useRef(false)

  // Al abrir el carrito se actualizan precios y disponibilidad con los datos reales
  useEffect(() => {
    if (refreshed.current || cart.lines.length === 0) return
    refreshed.current = true
    const ids = cart.lines.map((l) => l.product_id)
    supabase.from('catalog').select('*').in('id', ids).then(({ data }) => {
      const map = new Map((data ?? []).map((p: any) => [p.id, p as CatalogItem]))
      let changed = false
      const next = cart.lines.flatMap((l) => {
        const p = map.get(l.product_id)
        if (!p || p.available <= 0) { changed = true; return [] }
        const price = p.promo_price ?? p.price
        if (price !== l.price || p.available < l.quantity) changed = true
        return [{ ...l, price, available: p.available, image_url: p.image_url, quantity: Math.min(l.quantity, p.available) }]
      })
      if (changed) { cart.replaceAll(next); notify('Actualizamos precios y disponibilidad de tu carrito.') }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (cart.lines.length === 0) {
    return <div className="container section"><h1 style={{ fontSize: '2rem' }}>Tu carrito</h1>
      <Empty>Tu carrito está vacío. <Link to="/catalogo">Explora el catálogo</Link></Empty></div>
  }
  return (
    <div className="container section">
      <h1 style={{ fontSize: '2rem' }}>Tu carrito</h1>
      <div className="twocol">
        <div className="panel">
          {cart.lines.map((l) => (
            <div className="cartline" key={l.product_id}>
              <div className="thumb">{l.image_url ? <img src={l.image_url} alt="" /> : l.name.charAt(0)}</div>
              <div>
                <strong>{l.name}</strong>
                <div className="small muted">{money(l.price)} c/u · {l.available} disponibles</div>
                <div className="row mt" style={{ gap: '.5rem' }}>
                  <div className="qty">
                    <button onClick={() => cart.setQty(l.product_id, l.quantity - 1)} aria-label="Menos">−</button>
                    <span>{l.quantity}</span>
                    <button onClick={() => cart.setQty(l.product_id, l.quantity + 1)} aria-label="Más">+</button>
                  </div>
                  <button className="btn ghost small" onClick={() => cart.remove(l.product_id)}>Quitar</button>
                </div>
              </div>
              <strong>{money(l.price * l.quantity)}</strong>
            </div>
          ))}
        </div>
        <aside className="panel">
          <h3>Resumen</h3>
          <div className="row spread"><span>Total</span><span className="total">{money(cart.total)}</span></div>
          <p className="small muted">El costo de un delivery lo coordinas directamente con el servicio que elijas. El precio final se confirma al crear tu pedido.</p>
          <Link className="btn marker" style={{ width: '100%' }} to="/checkout">Continuar con el pedido</Link>
          <button className="btn ghost" style={{ width: '100%', marginTop: '.5rem' }} onClick={() => cart.clear()}>Vaciar carrito</button>
        </aside>
      </div>
    </div>
  )
}
