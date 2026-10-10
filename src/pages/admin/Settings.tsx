import { FormEvent, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { errText, extOf, randomId } from '../../lib/api'
import { useAsync } from '../../hooks/useAsync'
import { clearSettingsCache } from '../../hooks/useSettings'
import { ErrorBox, Field, Spinner } from '../../components/ui'
import { notify } from '../../lib/toast'

interface S { key: string; value: string; label: string | null; is_public: boolean }

export default function SettingsPage() {
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('settings').select('*').order('key')
    if (error) throw error
    return data as S[]
  }, [])
  const [vals, setVals] = useState<Record<string, string>>({})
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const get = (s: S) => vals[s.key] ?? s.value

  const save = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try {
      const next: Record<string, string> = { ...vals }
      if (file) {
        if (file.size > 3 * 1024 * 1024) throw new Error('La imagen del QR pesa más de 3 MB.')
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('El QR debe ser JPG, PNG o WEBP.')
        const path = `qr/${randomId()}.${extOf(file)}`
        const up = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type })
        if (up.error) throw up.error
        next.qr_image_url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
      }
      for (const [key, value] of Object.entries(next)) {
        const r = await supabase.from('settings').update({ value }).eq('key', key)
        if (r.error) throw r.error
      }
      clearSettingsCache(); setVals({}); setFile(null); notify('Configuración guardada'); reload()
    } catch (e2: any) { setErr(errText(e2?.message ? new Error(e2.message) : e2)) } finally { setBusy(false) }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: '2rem' }}>Configuración del negocio</h1>
      <ErrorBox text={error} />
      {loading ? <Spinner /> : (
        <form className="panel" onSubmit={save}>
          {(data ?? []).filter((s) => s.key !== 'qr_image_url').map((s) => (
            <Field key={s.key} label={s.label || s.key} hint={s.is_public ? 'Se muestra al público.' : 'Solo lo ve el personal.'}>
              {s.key === 'payment_instructions'
                ? <textarea className="input" value={get(s)} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />
                : <input className="input" value={get(s)} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />}
            </Field>
          ))}
          <Field label="Imagen del QR de pago" hint="Sube la imagen del QR de tu banco para que los clientes la vean al pagar.">
            {(data ?? []).find((s) => s.key === 'qr_image_url')?.value && !file && <img src={(data ?? []).find((s) => s.key === 'qr_image_url')!.value} alt="QR actual" style={{ width: 160, marginBottom: '.5rem' }} />}
            <input className="input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          <ErrorBox text={err} />
          <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
        </form>
      )}
    </div>
  )
}
