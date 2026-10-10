import { Link } from 'react-router-dom'
import type { CatalogItem } from '../types'
import { money } from '../lib/format'
import { useCart } from '../hooks/useCart'
import { notify } from '../lib/toast'

export function ProductPic({ item }: { item: { name: string; image_url: string | null } }) {
  return item.image_url
    ? <img src={item.image_url} alt={item.name} loading="lazy" />
    : <span aria-hidden="true">{item.name.trim().charAt(0).toUpperCase()}</span>
}

export default function ProductCard({ item }: { item: CatalogItem }) {
  const cart = useCart()
  const out = item.available <= 0
  const hasPromo = item.promo_price !== null && item.promo_price < item.price
  return (
    <article className="pcard">
      <Link to={`/producto/${item.id}`} className="pic" aria-label={item.name}><ProductPic item={item} /></Link>
      <div className="body">
        {item.category_name && <span className="cat">{item.category_name}</span>}
        <h3><Link to={`/producto/${item.id}`}>{item.name}</Link></h3>
        <div>
          <span className="price">{money(hasPromo ? item.promo_price : item.price)}</span>
          {hasPromo && <span className="old">{money(item.price)}</span>}
        </div>
        <div className="row" style={{ gap: '.4rem' }}>
          {hasPromo && <span className="tag">Oferta</span>}
          <span className="small muted">{out ? 'Agotado' : item.available <= 5 ? `Quedan ${item.available}` : 'Disponible'}</span>
        </div>
        <button className="btn small" style={{ marginTop: 'auto' }} disabled={out}
          onClick={() => { cart.add(item, 1); notify('Agregado al carrito') }}>
          {out ? 'Agotado' : 'Agregar al carrito'}
        </button>
      </div>
    </article>
  )
}
