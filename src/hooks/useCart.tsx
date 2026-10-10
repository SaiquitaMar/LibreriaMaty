import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import type { CartLine, CatalogItem } from '../types'

interface CartValue {
  lines: CartLine[]
  count: number
  total: number
  add: (p: CatalogItem, qty?: number) => void
  setQty: (id: string, qty: number) => void
  remove: (id: string) => void
  clear: () => void
  replaceAll: (lines: CartLine[]) => void
}

const Ctx = createContext<CartValue | null>(null)
const KEY = 'maty-cart-v1'

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as CartLine[]) : []
  } catch { return [] }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(lines)) } catch { /* el navegador no permite guardar */ }
  }, [lines])

  const value = useMemo<CartValue>(() => ({
    lines,
    count: lines.reduce((a, l) => a + l.quantity, 0),
    total: lines.reduce((a, l) => a + l.quantity * l.price, 0),
    add: (p, qty = 1) => setLines((prev) => {
      const price = p.promo_price ?? p.price
      const found = prev.find((l) => l.product_id === p.id)
      if (found) {
        return prev.map((l) => l.product_id === p.id
          ? { ...l, price, available: p.available, quantity: Math.min(l.quantity + qty, Math.max(p.available, 1)) } : l)
      }
      return [...prev, { product_id: p.id, name: p.name, price, image_url: p.image_url, available: p.available, quantity: Math.min(qty, Math.max(p.available, 1)) }]
    }),
    setQty: (id, qty) => setLines((prev) => prev.map((l) => l.product_id === id ? { ...l, quantity: Math.max(1, Math.min(qty, Math.max(l.available, 1))) } : l)),
    remove: (id) => setLines((prev) => prev.filter((l) => l.product_id !== id)),
    clear: () => setLines([]),
    replaceAll: (l) => setLines(l),
  }), [lines])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCart(): CartValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCart debe usarse dentro de CartProvider')
  return v
}
