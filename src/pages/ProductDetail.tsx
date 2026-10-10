import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAsync } from '../hooks/useAsync'
import { useCart } from '../hooks/useCart'
import { ProductPic } from '../components/ProductCard'
import { Spinner, ErrorBox, Empty } from '../components/ui'
import { money } from '../lib/format'
import { notify } from '../lib/toast'
import type { CatalogItem } from '../types'

export default function ProductDetail() {
  const { id } = useParams()
  const cart = useCart()
  const [qty, setQty] = useState(1)
  const { data, loading, error } = useAsync(async () => {
    const { data, error } = await supabase.from('catalog').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data as CatalogItem | null
  }, [id])

  if (loading) return <Spinner />
  if (error) return <div className="container section"><ErrorBox text={error} /></div>
  if (!data) return <div className="container section"><Empty>Este producto ya no está disponible. <Link to="/catalogo">Volver al catálogo</Link></Empty></div>
  const hasPromo = data.promo_price !== null && data.promo_price < data.price
  const out = data.available <= 0

  return (
    <div className="container section">
      <p><Link to="/catalogo">← Volver al catálogo</Link></p>
      <div className="detail">
        <div className="pic"><ProductPic item={data} /></div>
        <div>
          {data.category_name && <span className="muted">{data.category_name}</span>}
          <h1 style={{ fontSize: '2rem' }}>{data.name}</h1>
          <p><span className="price" style={{ fontSize: '1.8rem' }}>{money(hasPromo ? data.promo_price : data.price)}</span>
            {hasPromo && <span className="old">{money(data.price)}</span>}</p>
          {data.description && <p style={{ whiteSpace: 'pre-line' }}>{data.description}</p>}
          <p className="small muted">Código: {data.code} · {out ? 'Agotado por el momento' : `${data.available} disponibles`}</p>
          {!out && (
            <div className="row mt">
              <div className="qty">
                <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Menos">−</button>
                <span aria-live="polite">{qty}</span>
                <button onClick={() => setQty(Math.min(data.available, qty + 1))} aria-label="Más">+</button>
              </div>
              <button className="btn" onClick={() => { cart.add(data, qty); notify('Agregado al carrito') }}>Agregar al carrito</button>
              <Link className="btn ghost" to="/carrito">Ver carrito</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
