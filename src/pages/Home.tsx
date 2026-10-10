import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, configured } from '../lib/supabase'
import { useSettings } from '../hooks/useSettings'
import { useAsync } from '../hooks/useAsync'
import ProductCard from '../components/ProductCard'
import { Spinner, ErrorBox } from '../components/ui'
import type { CatalogItem, Category } from '../types'

export default function Home() {
  const nav = useNavigate()
  const s = useSettings()
  const [q, setQ] = useState('')
  useEffect(() => { if (configured) supabase.rpc('release_expired_reservations').then(() => undefined) }, [])

  const cats = useAsync(async () => {
    const { data } = await supabase.from('categories').select('id,name,active').eq('active', true).order('name')
    return (data ?? []) as Category[]
  }, [])
  const promos = useAsync(async () => {
    if (!configured) return [] as CatalogItem[]
    const { data } = await supabase.from('catalog').select('*').not('promo_price', 'is', null).gt('available', 0).limit(8)
    return (data ?? []) as CatalogItem[]
  }, [])
  const latest = useAsync(async () => {
    if (!configured) return [] as CatalogItem[]
    const { data, error } = await supabase.from('catalog').select('*').gt('available', 0).order('created_at', { ascending: false }).limit(8)
    if (error) throw error
    return (data ?? []) as CatalogItem[]
  }, [])

  const submit = (e: FormEvent) => { e.preventDefault(); nav(`/catalogo?q=${encodeURIComponent(q.trim())}`) }

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>Todo para tu año escolar y tu oficina</h1>
          <p>Cuadernos, lápices, mochilas y útiles. Reserva en línea, paga por transferencia o QR y recoge en {s.business_name || 'la librería'} o coordina tu delivery.</p>
          <form onSubmit={submit} role="search">
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre o código" aria-label="Buscar productos" />
            <button className="btn marker" type="submit">Buscar</button>
          </form>
        </div>
      </section>
      <div className="container">
        {(cats.data ?? []).length > 0 && (
          <div className="chips" aria-label="Categorías">
            {(cats.data ?? []).map((c) => <Link key={c.id} className="chip" to={`/catalogo?cat=${c.id}`}>{c.name}</Link>)}
          </div>
        )}
        {(promos.data ?? []).length > 0 && (
          <section className="section">
            <h2>Ofertas vigentes</h2>
            <div className="products">{(promos.data ?? []).map((p) => <ProductCard key={p.id} item={p} />)}</div>
          </section>
        )}
        <section className="section">
          <div className="row spread"><h2>Últimos productos</h2><Link to="/catalogo">Ver todo el catálogo</Link></div>
          {latest.loading ? <Spinner /> : <ErrorBox text={latest.error} />}
          {!latest.loading && (latest.data ?? []).length === 0 && !latest.error && <div className="empty">Pronto agregaremos productos al catálogo.</div>}
          <div className="products">{(latest.data ?? []).map((p) => <ProductCard key={p.id} item={p} />)}</div>
        </section>
      </div>
    </>
  )
}
