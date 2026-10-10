import { FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAsync } from '../hooks/useAsync'
import ProductCard from '../components/ProductCard'
import { Spinner, ErrorBox, Empty } from '../components/ui'
import type { CatalogItem, Category } from '../types'

const PAGE = 24

export default function Catalog() {
  const [params, setParams] = useSearchParams()
  const term = params.get('q') ?? ''
  const cat = params.get('cat') ?? ''
  const [text, setText] = useState(term)
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => setText(term), [term])
  useEffect(() => setLimit(PAGE), [term, cat])

  const cats = useAsync(async () => {
    const { data } = await supabase.from('categories').select('id,name,active').eq('active', true).order('name')
    return (data ?? []) as Category[]
  }, [])

  const items = useAsync(async () => {
    await supabase.rpc('release_expired_reservations')
    let q = supabase.from('catalog').select('*').order('name').limit(limit + 1)
    if (cat) q = q.eq('category_id', cat)
    const t = term.replace(/[,()%*]/g, ' ').trim()
    if (t) q = q.or(`name.ilike.%${t}%,code.ilike.%${t}%,description.ilike.%${t}%`)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as CatalogItem[]
  }, [term, cat, limit])

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params)
    if (v) p.set(k, v); else p.delete(k)
    setParams(p)
  }
  const submit = (e: FormEvent) => { e.preventDefault(); set('q', text.trim()) }
  const list = items.data ?? []

  return (
    <div className="container section">
      <h1 style={{ fontSize: '2rem' }}>Catálogo</h1>
      <form onSubmit={submit} className="row" role="search">
        <input className="input grow" style={{ maxWidth: 420 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar por nombre, código o descripción" aria-label="Buscar" />
        <button className="btn" type="submit">Buscar</button>
        {(term || cat) && <button type="button" className="btn ghost" onClick={() => setParams({})}>Quitar filtros</button>}
      </form>
      <div className="chips">
        <button className={'chip' + (!cat ? ' on' : '')} onClick={() => set('cat', '')}>Todas</button>
        {(cats.data ?? []).map((c) => <button key={c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => set('cat', c.id)}>{c.name}</button>)}
      </div>
      <ErrorBox text={items.error} />
      {items.loading && list.length === 0 ? <Spinner /> : list.length === 0 && !items.error
        ? <Empty>No encontramos productos con esa búsqueda. Prueba con otra palabra o quita los filtros.</Empty>
        : <div className="products">{list.slice(0, limit).map((p) => <ProductCard key={p.id} item={p} />)}</div>}
      {list.length > limit && <p className="center mt"><button className="btn ghost" onClick={() => setLimit(limit + PAGE)}>Ver más productos</button></p>}
    </div>
  )
}
