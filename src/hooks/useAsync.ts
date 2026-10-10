import { useCallback, useEffect, useRef, useState } from 'react'
import { errText } from '../lib/api'

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const seq = useRef(0)

  const reload = useCallback(async () => {
    const my = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const r = await fnRef.current()
      if (my === seq.current) setData(r)
    } catch (e) {
      if (my === seq.current) setError(errText(e))
    } finally {
      if (my === seq.current) setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  return { data, loading, error, reload, setData }
}
