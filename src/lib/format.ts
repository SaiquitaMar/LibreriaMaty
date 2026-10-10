export const money = (n: number | string | null | undefined): string =>
  'Bs ' + Number(n ?? 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const dateTime = (s: string | null | undefined): string =>
  s ? new Date(s).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export const dateOnly = (s: string | null | undefined): string =>
  s ? new Date(s).toLocaleDateString('es-BO', { dateStyle: 'medium' }) : '—'

export const toInputDate = (d: Date): string => {
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const ORDER_STATUS: Record<string, string> = {
  pending: 'Pendiente de pago', confirmed: 'Confirmado', completed: 'Entregado', cancelled: 'Cancelado',
}
export const PAYMENT_STATUS: Record<string, string> = {
  unpaid: 'Sin comprobante', in_review: 'En revisión', approved: 'Pago verificado', rejected: 'Comprobante rechazado',
}
export const PREP_STATUS: Record<string, string> = {
  not_started: 'Sin preparar', preparing: 'En preparación', prepared: 'Preparado',
}
export const DELIVERY_STATUS: Record<string, string> = {
  pending: 'Pendiente', ready_pickup: 'Listo para recoger', coordinating: 'En coordinación de delivery', delivered: 'Entregado',
}
export const DELIVERY_METHOD: Record<string, string> = { pickup: 'Recojo en la librería', delivery: 'Delivery de tu confianza' }
export const PAY_METHOD: Record<string, string> = {
  cash: 'Efectivo', qr: 'QR', transfer: 'Transferencia', card: 'Tarjeta',
}
export const MOVE_TYPE: Record<string, string> = {
  purchase_in: 'Compra recibida', sale_out: 'Venta en tienda', order_out: 'Pedido en línea', void_return: 'Devolución / anulación',
  adjust_in: 'Ajuste (entrada)', adjust_out: 'Ajuste (salida)',
}

export const badgeTone = (kind: string): string => {
  if (['approved', 'completed', 'delivered', 'prepared', 'received', 'confirmed'].includes(kind)) return 'ok'
  if (['rejected', 'cancelled', 'voided'].includes(kind)) return 'bad'
  if (['in_review', 'preparing', 'coordinating', 'ready_pickup', 'ordered'].includes(kind)) return 'info'
  return 'wait'
}
