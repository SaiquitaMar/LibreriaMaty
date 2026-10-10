type Listener = (t: { id: number; text: string; kind: 'ok' | 'error' }) => void
const listeners = new Set<Listener>()
let counter = 0

export function subscribeToasts(fn: Listener) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export function notify(text: string, kind: 'ok' | 'error' = 'ok') {
  const t = { id: ++counter, text, kind }
  listeners.forEach((l) => l(t))
}
